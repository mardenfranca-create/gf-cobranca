"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigeEquipe } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { listaRegua } from "@/lib/data";
import { addDias, brl, fmtData, hojeISO } from "@/lib/domain/datas";
import { confereAlcada } from "@/lib/domain/alcada";
import { colunasExcecao, colunasProxima, derivaProxima, mapaRegua, marca, type ProximaAcao } from "@/lib/domain/regua";
import { EQUIPE, EXCECOES, FOLLOWUPS, type Caso, type Cliente, type TipoExcecao, type TipoFollowup } from "@/lib/domain/types";

type Patch = Omit<Partial<Caso>, "id" | "documento_digits" | "cliente_id">;

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string) => Number(fd.get(k) ?? 0) || 0;
const dataOu = (v: string, fallback: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback);

/** Carrega caso + cliente, aplica o patch, grava o evento e revalida. Toda ação da mesa passa por aqui. */
async function aplica(casoId: string, fn: (ctx: { caso: Caso; cliente: Cliente; hoje: string; regua: ReturnType<typeof mapaRegua>; autor: string }) => { patch: Patch; evento: { tipo: string; texto: string; visivel_cliente?: boolean } | null }) {
  const u = await exigeEquipe();
  const sb = await supabaseServer();
  const [{ data: caso }, regua] = await Promise.all([sb.from("casos").select("*").eq("id", casoId).single(), listaRegua()]);
  if (!caso) throw new Error("Caso não encontrado");
  const { data: cliente } = await sb.from("clientes").select("*").eq("id", caso.cliente_id).single();
  const hoje = hojeISO();
  const { patch, evento } = fn({ caso: caso as Caso, cliente: cliente as Cliente, hoje, regua: mapaRegua(regua), autor: u.nome });
  const fechando = patch.fase && ["pago", "devolvido"].includes(patch.fase as string);
  const { error } = await sb
    .from("casos")
    .update({ ...patch, ultima_mov_em: new Date().toISOString(), encerrado_em: fechando ? new Date().toISOString() : patch.fase && !fechando ? null : (caso.encerrado_em ?? null) })
    .eq("id", casoId);
  if (error) throw new Error(error.message);
  if (evento) {
    const { error: e2 } = await sb.from("eventos").insert({ caso_id: casoId, autor: u.nome, autor_id: u.id, tipo: evento.tipo, texto: evento.texto, visivel_cliente: evento.visivel_cliente ?? true });
    if (e2) throw new Error(e2.message);
  }
  revalidatePath("/", "layout");
}

const prox = (p: ProximaAcao | null) => colunasProxima(p);

export async function registrarContato(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ hoje }) => {
    const tipo = (s(fd, "proximo_tipo") || "recontatar") as TipoFollowup;
    const data = dataOu(s(fd, "proxima_data"), addDias(hoje, 3));
    const resultado = s(fd, "resultado"), canal = s(fd, "canal"), obs = s(fd, "obs");
    const nota = FOLLOWUPS[tipo] + (resultado === "Vai pagar o boleto" ? " (devedor prometeu pagar)" : "");
    return {
      patch: { ...prox({ data, tipo, nota, auto: false }), fase: undefined },
      evento: { tipo: "contato", texto: `${canal}: ${resultado.toLowerCase()}.${obs ? " " + obs : ""} Próximo follow-up em ${fmtData(data)}.` },
    };
  });
  redirect(`/casos/${id}`);
}

export async function agendarFollowup(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ hoje }) => {
    const tipo = (s(fd, "tipo") || "recontatar") as TipoFollowup;
    const data = dataOu(s(fd, "data"), addDias(hoje, 3));
    const nota = s(fd, "nota") || FOLLOWUPS[tipo];
    return { patch: prox({ data, tipo, nota, auto: false }), evento: { tipo: "agenda", texto: `Follow-up agendado para ${fmtData(data)}: ${nota}`, visivel_cliente: false } };
  });
  redirect(`/casos/${id}`);
}

export async function atribuirResponsavel(fd: FormData) {
  const id = s(fd, "caso_id");
  const quem = s(fd, "responsavel");
  if (!(EQUIPE as readonly string[]).includes(quem)) throw new Error("Responsável inválido");
  await aplica(id, () => ({ patch: { responsavel: quem }, evento: { tipo: "sistema", texto: `Responsável alterado para ${quem}.`, visivel_cliente: false } }));
  redirect(`/casos/${id}`);
}

export async function marcarExcecao(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ hoje, regua }) => {
    const tipo = s(fd, "tipo") as TipoExcecao;
    if (!EXCECOES[tipo]) throw new Error("Tipo de exceção inválido");
    const revisao = dataOu(s(fd, "revisao"), addDias(hoje, regua.excecao?.dias ?? 30));
    const motivo = s(fd, "motivo");
    return {
      patch: { ...colunasExcecao(tipo, motivo, hoje, revisao, regua), ...prox({ data: revisao, tipo: "decidir", nota: `Revisar exceção: ${EXCECOES[tipo]}`, auto: true }) },
      evento: { tipo: "excecao", texto: `Exceção marcada: ${EXCECOES[tipo]}. ${motivo} Régua pausada; revisão em ${fmtData(revisao)}.` },
    };
  });
  redirect(`/casos/${id}`);
}

export async function retomarCobranca(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ caso, hoje, regua }) => {
    const semExc = { ...caso, exc_tipo: null, exc_revisao: null, ultima_mov_em: new Date().toISOString() };
    return { patch: { ...colunasExcecao(null, "", hoje), ...prox(derivaProxima(semExc, regua, hoje)) }, evento: { tipo: "excecao", texto: `Exceção levantada (${caso.exc_tipo ? EXCECOES[caso.exc_tipo] : ""}). Cobrança retomada.` } };
  });
  redirect(`/casos/${id}`);
}

export async function registrarProposta(fd: FormData) {
  const id = s(fd, "caso_id");
  const u = await exigeEquipe();
  const sb = await supabaseServer();
  const { data: caso } = await sb.from("casos").select("*").eq("id", id).single();
  if (!caso) throw new Error("Caso não encontrado");
  const { data: cliente } = await sb.from("clientes").select("*").eq("id", caso.cliente_id).single();
  const termos = { desconto_pct: n(fd, "desconto"), parcelas: Math.max(1, n(fd, "parcelas")), entrada_pct: n(fd, "entrada"), total: 0 };
  termos.total = Math.round((caso.valor_atualizado ?? 0) * (1 - termos.desconto_pct / 100) * 100) / 100;
  const ck = confereAlcada(termos, (cliente as Cliente).limites);
  const nota = s(fd, "nota") || "Proposta registrada pela equipe.";
  const { error } = await sb.from("propostas").insert({ caso_id: id, ...termos, nota, fora_alcada: ck.fora, status: ck.fora ? "pending" : "closed", decidida_por: ck.fora ? null : u.nome, decidida_em: ck.fora ? null : new Date().toISOString() });
  if (error) throw new Error(error.message);
  if (ck.fora) {
    await aplica(id, ({ hoje }) => ({
      patch: { fase: caso.fase === "regua" ? "neg" : caso.fase, ...prox(marca(hoje, 2, "acordo", "Retorno do cliente sobre a proposta")) },
      evento: { tipo: "proposta", texto: `Proposta registrada (${termos.desconto_pct}% · ${termos.parcelas}× · entrada ${termos.entrada_pct}%). Fora da alçada (${ck.motivos.join(", ")}): enviada ao cliente para aprovação.` },
    }));
  } else {
    await aplica(id, ({ hoje, regua }) => ({
      patch: { fase: "acordo", acordo: { parc: termos.parcelas, paid: 0, next: addDias(hoje, 30) }, ...prox(marca(hoje, regua.acordoConf?.dias ?? 30, "acordo", "Conferir 1ª parcela do acordo")) },
      evento: { tipo: "acordo", texto: `Acordo fechado pela equipe dentro da alçada: ${termos.desconto_pct}% de desconto, entrada de ${termos.entrada_pct}%, ${termos.parcelas} parcelas de ${brl(ck.parcelaValor)}. Boletos a emitir no Asaas.` },
    }));
  }
  redirect(`/casos/${id}`);
}

export async function enviarProtesto(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ hoje, regua }) => {
    const just = s(fd, "justificativa");
    return { patch: { fase: "protesto", ...prox(marca(hoje, regua.protesto?.dias ?? 10, "notif", "Fim do prazo do protesto em cartório")) }, evento: { tipo: "protesto", texto: `Título enviado a protesto (CENPROT).${just ? " Justificativa: " + just : ""}` } };
  });
  redirect(`/casos/${id}`);
}

export async function encaminharJudicial(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ hoje }) => ({
    patch: { fase: "judicial", processo: "em distribuição", acordo: null, responsavel: s(fd, "advogado") || "Lucas", ...prox(marca(hoje, 30, "judicial", "Conferir distribuição e citação no Astrea")) },
    evento: { tipo: "judicial", texto: `Encaminhado ao judicial (${s(fd, "via")}). Advogado: ${s(fd, "advogado")}. Caso a abrir no Astrea.` },
  }));
  redirect(`/casos/${id}`);
}

export async function marcarParcelaPaga(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ caso, hoje, regua }) => {
    const acordo = caso.acordo ?? { parc: Math.max(1, n(fd, "total_parcelas")) || 6, paid: Math.max(0, (n(fd, "ja_pagas") || 1) - 1), next: hoje };
    acordo.paid += 1;
    if (acordo.paid >= acordo.parc) return { patch: { fase: "pago", acordo, ...prox(null) }, evento: { tipo: "pagamento", texto: "Última parcela do acordo paga. Caso encerrado." } };
    acordo.next = addDias(hoje, regua.acordoConf?.dias ?? 30);
    return { patch: { acordo, ...prox(marca(hoje, regua.acordoConf?.dias ?? 30, "acordo", `Conferir parcela ${acordo.paid + 1}/${acordo.parc}`)) }, evento: { tipo: "pagamento", texto: `Parcela ${acordo.paid}/${acordo.parc} do acordo confirmada.` } };
  });
  redirect(`/casos/${id}`);
}

export async function marcarAcordoQuebrado(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ caso, hoje, regua }) => ({
    patch: { fase: "quebra", ...prox(marca(hoje, regua.quebra?.dias ?? 2, "decidir", "Renegociar ou protestar")) },
    evento: { tipo: "acordo", texto: `${caso.acordo ? `Parcela ${caso.acordo.paid + 1}/${caso.acordo.parc} vencida` : "Parcela vencida"} sem pagamento. Acordo quebrado; aviso ao devedor.` },
  }));
  redirect(`/casos/${id}`);
}

export async function devolverAoCliente(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, () => ({ patch: { fase: "devolvido", ...prox(null), ...colunasExcecao(null, "", "") }, evento: { tipo: "encerramento", texto: `Devolvido ao cliente com parecer: ${s(fd, "parecer") || "sem viabilidade de cobrança."}` } }));
  redirect(`/casos/${id}`);
}

export async function reativarCobranca(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ hoje }) => ({ patch: { fase: "neg", fase_nota: "Cobrança reativada", ...prox(marca(hoje, 1, "recontatar", "Retomar contato após reativação")) }, evento: { tipo: "sistema", texto: "Cobrança reativada pela equipe." } }));
  redirect(`/casos/${id}`);
}

export async function confirmarPagamento(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, () => ({ patch: { fase: "pago", acordo: null, ...prox(null) }, evento: { tipo: "pagamento", texto: `Pagamento conferido (${s(fd, "onde").toLowerCase() || "extrato"}). Caso encerrado.` } }));
  redirect(`/casos/${id}`);
}

export async function pagamentoNaoLocalizado(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ hoje }) => ({ patch: { fase: "neg", ...prox(marca(hoje, 1, "recontatar", "Cobrar comprovante do pagamento alegado")) }, evento: { tipo: "pagamento", texto: `Pagamento informado não localizado. ${s(fd, "motivo")} Cobrança retomada e cliente avisado.` } }));
  redirect(`/casos/${id}`);
}

export async function registrarPagamentoIntegral(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ caso }) => ({ patch: { fase: "pago", acordo: null, ...prox(null) }, evento: { tipo: "pagamento", texto: `Pagamento integral registrado (${brl(n(fd, "valor") || caso.valor_atualizado || 0)} · ${s(fd, "forma")}). Caso encerrado.` } }));
  redirect(`/casos/${id}`);
}

export async function atualizarCadastro(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ caso }) => {
    const valor = n(fd, "valor") || null;
    const doc = s(fd, "documento") || null;
    const patch: Patch = { valor_original: valor ?? caso.valor_original, valor_atualizado: valor ?? caso.valor_atualizado, valor_fonte: valor ? "cadastro manual" : caso.valor_fonte, documento: doc ?? caso.documento, telefone: s(fd, "telefone") || caso.telefone, email: s(fd, "email") || caso.email };
    patch.pendencias = (caso.pendencias ?? []).filter((p) => !(valor && p === "sem valor") && !(doc && p === "sem CPF/CNPJ") && !((s(fd, "telefone") || s(fd, "email")) && p === "sem contato"));
    return { patch, evento: { tipo: "cadastro", texto: `Cadastro atualizado${valor ? ` · valor ${brl(valor)}` : ""}${doc ? ` · documento ${doc}` : ""}.`, visivel_cliente: false } };
  });
  redirect(`/casos/${id}`);
}
