"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigeCliente, type Usuario } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { listaRegua } from "@/lib/data";
import { addDias, brl, fmtData, hojeISO, parseDataBR } from "@/lib/domain/datas";
import { colunasProxima, marca, type ProximaAcao } from "@/lib/domain/regua";
import { isAberto, type Caso, type Cliente } from "@/lib/domain/types";

/**
 * Ações do cliente no portal. Toda ação grava um evento (visível ao cliente e à equipe) e
 * deixa uma próxima ação marcada para a equipe: nada que o cliente faz fica sem dono nem sem data.
 * O RLS garante que o cliente só alcança a própria carteira; aqui conferimos de novo.
 */

type Patch = Omit<Partial<Caso>, "id" | "documento_digits" | "cliente_id">;
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").replace(/\./g, "").replace(",", ".")) || 0;

async function casoDoCliente(u: Usuario & { cliente_id: string }, casoId: string) {
  const sb = await supabaseServer();
  const { data: caso } = await sb.from("casos").select("*").eq("id", casoId).maybeSingle();
  if (!caso || caso.cliente_id !== u.cliente_id) throw new Error("Caso não encontrado na sua carteira.");
  return { sb, caso: caso as Caso };
}

async function aplicaCliente(casoId: string, fn: (ctx: { caso: Caso; hoje: string; acordoDias: number; autor: string }) => { patch: Patch; evento: { tipo: string; texto: string } }) {
  const u = await exigeCliente();
  const { sb, caso } = await casoDoCliente(u, casoId);
  const regua = await listaRegua().catch(() => []);
  const acordoDias = regua.find((r) => r.chave === "acordoConf")?.dias ?? 30;
  const { patch, evento } = fn({ caso, hoje: hojeISO(), acordoDias, autor: u.nome });
  const { error } = await sb.from("casos").update({ ...patch, ultima_mov_em: new Date().toISOString() }).eq("id", casoId);
  if (error) throw new Error(error.message);
  const { error: e2 } = await sb.from("eventos").insert({ caso_id: casoId, autor: `${u.nome} (cliente)`, autor_id: u.id, tipo: evento.tipo, texto: evento.texto, visivel_cliente: true });
  if (e2) throw new Error(e2.message);
  revalidatePath("/", "layout");
  return u;
}

const prox = (p: ProximaAcao) => colunasProxima(p);

/** Aprova ou recusa uma proposta fora da alçada. Aprovar fecha o acordo; recusar devolve o caso à mesa para renegociar. */
export async function decidirProposta(fd: FormData) {
  const casoId = s(fd, "caso_id");
  const propostaId = s(fd, "proposta_id");
  const decisao = s(fd, "decisao");
  const motivo = s(fd, "motivo");
  if (decisao !== "aprovar" && decisao !== "recusar") throw new Error("Decisão inválida.");
  const u = await exigeCliente();
  const { sb, caso } = await casoDoCliente(u, casoId);
  const { data: proposta } = await sb.from("propostas").select("*").eq("id", propostaId).eq("caso_id", casoId).maybeSingle();
  if (!proposta) throw new Error("Proposta não encontrada.");
  if (proposta.status !== "pending") throw new Error("Esta proposta já foi decidida.");
  const { error } = await sb.from("propostas").update({ status: decisao === "aprovar" ? "approved" : "rejected", decidida_por: `${u.nome} (cliente)`, decidida_em: new Date().toISOString() }).eq("id", propostaId);
  if (error) throw new Error(error.message);
  const parcelaValor = (proposta.total * (1 - proposta.entrada_pct / 100)) / Math.max(1, proposta.parcelas);
  await aplicaCliente(casoId, ({ hoje, acordoDias }) =>
    decisao === "aprovar"
      ? {
          patch: { fase: "acordo", fase_nota: "Acordo aprovado pelo cliente", acordo: { parc: proposta.parcelas, paid: 0, next: addDias(hoje, acordoDias) }, ...prox(marca(hoje, 1, "acordo", "Formalizar acordo aprovado pelo cliente e emitir boletos")) },
          evento: { tipo: "acordo", texto: `Proposta aprovada pelo cliente: ${proposta.desconto_pct}% de desconto, entrada de ${proposta.entrada_pct}%, ${proposta.parcelas} parcelas de ${brl(parcelaValor)} (total ${brl(proposta.total)}).${motivo ? " " + motivo : ""} Equipe formaliza e emite os boletos.` },
        }
      : {
          patch: { fase: caso.fase === "acordo" ? "neg" : caso.fase, ...prox(marca(hoje, 1, "recontatar", "Cliente recusou a proposta: renegociar com o devedor")) },
          evento: { tipo: "proposta", texto: `Proposta recusada pelo cliente (${proposta.desconto_pct}% · ${proposta.parcelas}× · entrada ${proposta.entrada_pct}%).${motivo ? " Motivo: " + motivo : ""} Equipe retoma a negociação.` },
        },
  );
  redirect(fd.get("voltar") === "aprovacoes" ? "/portal/aprovacoes" : `/portal/casos/${casoId}`);
}

/** O cliente recebeu o pagamento direto (na escola, em conta). A cobrança para na hora; a equipe confere e encerra. */
export async function informarPagamento(fd: FormData) {
  const casoId = s(fd, "caso_id");
  const valor = n(fd, "valor");
  const data = parseDataBR(s(fd, "data")) ?? (/^\d{4}-\d{2}-\d{2}$/.test(s(fd, "data")) ? s(fd, "data") : hojeISO());
  const forma = s(fd, "forma") || "não informada";
  const obs = s(fd, "obs");
  const integral = s(fd, "alcance") !== "parcial";
  await aplicaCliente(casoId, ({ caso, hoje }) => {
    if (!isAberto(caso)) throw new Error("Este caso já está encerrado.");
    return {
      patch: { fase: "confirma", fase_nota: integral ? "Pagamento informado pelo cliente" : "Pagamento parcial informado pelo cliente", ...prox(marca(hoje, 1, "decidir", integral ? "Conferir pagamento informado pelo cliente e encerrar" : "Conferir pagamento parcial informado pelo cliente e recalcular saldo")) },
      evento: { tipo: "pagamento", texto: `Cliente informa pagamento ${integral ? "integral" : "parcial"} recebido diretamente: ${valor ? brl(valor) : "valor não informado"} em ${fmtData(data)} via ${forma}.${obs ? " " + obs : ""} Cobrança suspensa até conferência.` },
    };
  });
  redirect(`/portal/casos/${casoId}`);
}

/** Orientação ou pergunta do cliente sobre um caso. Vira evento e tarefa para o responsável no dia seguinte. */
export async function enviarOrientacao(fd: FormData) {
  const casoId = s(fd, "caso_id");
  const texto = s(fd, "texto");
  if (texto.length < 3) throw new Error("Escreva a orientação.");
  const pedido = s(fd, "pedido");
  const rotulo: Record<string, string> = { orientar: "Orientação do cliente", pausar: "Cliente pede para suspender a cobrança", retomar: "Cliente libera a cobrança", duvida: "Pergunta do cliente" };
  await aplicaCliente(casoId, ({ caso, hoje }) => ({
    patch: isAberto(caso) ? prox(marca(hoje, 1, "decidir", `${rotulo[pedido] ?? "Mensagem do cliente"}: responder e ajustar o caso`)) : {},
    evento: { tipo: "cliente", texto: `${rotulo[pedido] ?? "Mensagem do cliente"}: ${texto}` },
  }));
  redirect(`/portal/casos/${casoId}`);
}

/** Alçadas e contato alterados pelo próprio cliente, com registro de quem mudou. */
export async function salvarAlcadasCliente(fd: FormData) {
  const u = await exigeCliente();
  const sb = await supabaseServer();
  const { data: atual } = await sb.from("clientes").select("*").eq("id", u.cliente_id).single();
  if (!atual) throw new Error("Cliente não encontrado.");
  const cli = atual as Cliente;
  const num = (k: string, d: number, min = 0, max = 100) => { const v = Number(fd.get(k)); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d; };
  const limites = { desc: num("desc", cli.limites.desc), parc: num("parc", cli.limites.parc, 1, 60), ent: num("ent", cli.limites.ent), min: num("min", cli.limites.min, 0, 1e7) };
  const contato = s(fd, "contato") || null;
  const mudouLimites = JSON.stringify(limites) !== JSON.stringify(cli.limites);
  const mudouContato = contato !== (cli.contato ?? null);
  if (!mudouLimites && !mudouContato) redirect("/portal/config?ok=0");
  const { error } = await sb.from("clientes").update({ limites, contato }).eq("id", u.cliente_id);
  if (error) throw new Error(error.message);
  const registros = [];
  if (mudouLimites) registros.push({ cliente_id: u.cliente_id, autor: `${u.nome} (cliente)`, autor_id: u.id, campo: "limites", antes: cli.limites, depois: limites });
  if (mudouContato) registros.push({ cliente_id: u.cliente_id, autor: `${u.nome} (cliente)`, autor_id: u.id, campo: "contato", antes: cli.contato, depois: contato });
  const { error: e2 } = await sb.from("ajustes_cliente").insert(registros);
  if (e2 && !/ajustes_cliente/.test(e2.message)) throw new Error(e2.message);
  revalidatePath("/", "layout");
  redirect("/portal/config?ok=1");
}
