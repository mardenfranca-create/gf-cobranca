"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigeEquipe } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { listaCasos, listaClientes, listaRegua, parcelasDosCasos } from "@/lib/data";
import { abreCaso, consolidaParcela } from "@/lib/abertura-caso";
import { normalizaNovoCaso, parseValorForm, type CamposNovoCaso } from "@/lib/domain/novo-caso";
import { reconcilia } from "@/lib/domain/reconcile";
import { addDias, brl, fmtData, hojeISO } from "@/lib/domain/datas";
import { confereAlcada } from "@/lib/domain/alcada";
import { colunasExcecao, colunasProxima, derivaProxima, mapaRegua, marca, type ProximaAcao } from "@/lib/domain/regua";
import { descreveParcela, desfechoSemAbertas, recalculaValores, situacaoParcela, validaParcela } from "@/lib/domain/parcelas";
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
  redirect(`/casos/${id}?ok=${encodeURIComponent("Contato registrado e próximo follow-up agendado.")}`);
}

export async function agendarFollowup(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ hoje }) => {
    const tipo = (s(fd, "tipo") || "recontatar") as TipoFollowup;
    const data = dataOu(s(fd, "data"), addDias(hoje, 3));
    const nota = s(fd, "nota") || FOLLOWUPS[tipo];
    return { patch: prox({ data, tipo, nota, auto: false }), evento: { tipo: "agenda", texto: `Follow-up agendado para ${fmtData(data)}: ${nota}`, visivel_cliente: false } };
  });
  redirect(`/casos/${id}?ok=${encodeURIComponent("Follow-up salvo na agenda.")}`);
}

export async function atribuirResponsavel(fd: FormData) {
  const id = s(fd, "caso_id");
  const quem = s(fd, "responsavel");
  if (!(EQUIPE as readonly string[]).includes(quem)) throw new Error("Responsável inválido");
  await aplica(id, () => ({ patch: { responsavel: quem }, evento: { tipo: "sistema", texto: `Responsável alterado para ${quem}.`, visivel_cliente: false } }));
  redirect(`/casos/${id}?ok=${encodeURIComponent("Responsável atualizado.")}`);
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
  redirect(`/casos/${id}?ok=${encodeURIComponent("Exceção registrada. A régua fica pausada até a data de revisão.")}`);
}

export async function retomarCobranca(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ caso, hoje, regua }) => {
    const semExc = { ...caso, exc_tipo: null, exc_revisao: null, ultima_mov_em: new Date().toISOString() };
    return { patch: { ...colunasExcecao(null, "", hoje), ...prox(derivaProxima(semExc, regua, hoje)) }, evento: { tipo: "excecao", texto: `Exceção levantada (${caso.exc_tipo ? EXCECOES[caso.exc_tipo] : ""}). Cobrança retomada.` } };
  });
  redirect(`/casos/${id}?ok=${encodeURIComponent("Cobrança retomada.")}`);
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
  redirect(`/casos/${id}?ok=${encodeURIComponent("Proposta registrada.")}`);
}

export async function enviarProtesto(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ hoje, regua }) => {
    const just = s(fd, "justificativa");
    return { patch: { fase: "protesto", ...prox(marca(hoje, regua.protesto?.dias ?? 10, "notif", "Fim do prazo do protesto em cartório")) }, evento: { tipo: "protesto", texto: `Título enviado a protesto (CENPROT).${just ? " Justificativa: " + just : ""}` } };
  });
  redirect(`/casos/${id}?ok=${encodeURIComponent("Envio a protesto registrado.")}`);
}

export async function encaminharJudicial(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ hoje }) => ({
    patch: { fase: "judicial", processo: "em distribuição", acordo: null, responsavel: s(fd, "advogado") || "Lucas", ...prox(marca(hoje, 30, "judicial", "Conferir distribuição e citação no Astrea")) },
    evento: { tipo: "judicial", texto: `Encaminhado ao judicial (${s(fd, "via")}). Advogado: ${s(fd, "advogado")}. Caso a abrir no Astrea.` },
  }));
  redirect(`/casos/${id}?ok=${encodeURIComponent("Caso encaminhado ao judicial.")}`);
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
  redirect(`/casos/${id}?ok=${encodeURIComponent("Parcela confirmada.")}`);
}

export async function marcarAcordoQuebrado(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ caso, hoje, regua }) => ({
    patch: { fase: "quebra", ...prox(marca(hoje, regua.quebra?.dias ?? 2, "decidir", "Renegociar ou protestar")) },
    evento: { tipo: "acordo", texto: `${caso.acordo ? `Parcela ${caso.acordo.paid + 1}/${caso.acordo.parc} vencida` : "Parcela vencida"} sem pagamento. Acordo quebrado; aviso ao devedor.` },
  }));
  redirect(`/casos/${id}?ok=${encodeURIComponent("Acordo marcado como quebrado.")}`);
}

export async function devolverAoCliente(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, () => ({ patch: { fase: "devolvido", ...prox(null), ...colunasExcecao(null, "", "") }, evento: { tipo: "encerramento", texto: `Devolvido ao cliente com parecer: ${s(fd, "parecer") || "sem viabilidade de cobrança."}` } }));
  redirect(`/casos/${id}?ok=${encodeURIComponent("Caso devolvido ao cliente e encerrado.")}`);
}

export async function reativarCobranca(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ hoje }) => ({ patch: { fase: "neg", fase_nota: "Cobrança reativada", ...prox(marca(hoje, 1, "recontatar", "Retomar contato após reativação")) }, evento: { tipo: "sistema", texto: "Cobrança reativada pela equipe." } }));
  redirect(`/casos/${id}?ok=${encodeURIComponent("Cobrança reativada.")}`);
}

export async function confirmarPagamento(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, () => ({ patch: { fase: "pago", acordo: null, ...prox(null) }, evento: { tipo: "pagamento", texto: `Pagamento conferido (${s(fd, "onde").toLowerCase() || "extrato"}). Caso encerrado.` } }));
  redirect(`/casos/${id}?ok=${encodeURIComponent("Pagamento confirmado. Caso encerrado.")}`);
}

export async function pagamentoNaoLocalizado(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ hoje }) => ({ patch: { fase: "neg", ...prox(marca(hoje, 1, "recontatar", "Cobrar comprovante do pagamento alegado")) }, evento: { tipo: "pagamento", texto: `Pagamento informado não localizado. ${s(fd, "motivo")} Cobrança retomada e cliente avisado.` } }));
  redirect(`/casos/${id}?ok=${encodeURIComponent("Pagamento não localizado: caso devolvido à negociação.")}`);
}

export async function registrarPagamentoIntegral(fd: FormData) {
  const id = s(fd, "caso_id");
  await aplica(id, ({ caso }) => ({ patch: { fase: "pago", acordo: null, ...prox(null) }, evento: { tipo: "pagamento", texto: `Pagamento integral registrado (${brl(n(fd, "valor") || caso.valor_atualizado || 0)} · ${s(fd, "forma")}). Caso encerrado.` } }));
  redirect(`/casos/${id}?ok=${encodeURIComponent("Pagamento integral registrado. Caso encerrado.")}`);
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
  redirect(`/casos/${id}?ok=${encodeURIComponent("Cadastro atualizado.")}`);
}

/**
 * "Feito" sem registrar contato: para tarefas de conferência e acompanhamento. A régua deriva o próximo passo
 * a partir de agora, então o caso nunca fica sem próxima ação. O evento é interno (o cliente não vê).
 */
export async function concluirTarefa(fd: FormData) {
  const id = s(fd, "caso_id");
  const voltar = s(fd, "voltar");
  const nota = s(fd, "nota");
  let feita = "";
  await aplica(id, ({ caso, hoje, regua }) => {
    feita = caso.proxima_nota ?? "tarefa";
    const agora = { ...caso, ultima_mov_em: new Date().toISOString() };
    const p = derivaProxima(agora, regua, hoje) ?? marca(hoje, 7, "recontatar", "Acompanhar");
    if (p.data <= hoje) p.data = addDias(hoje, 1);
    return { patch: prox(p), evento: { tipo: "sistema", texto: `Tarefa concluída: ${feita}.${nota ? " " + nota : ""} Próximo passo pela régua em ${fmtData(p.data)}: ${p.nota}.`, visivel_cliente: false } };
  });
  const msg = encodeURIComponent(`Concluído: ${feita}. Próximo passo marcado pela régua.`);
  redirect(voltar.startsWith("/") ? `${voltar}${voltar.includes("?") ? "&" : "?"}ok=${msg}` : `/casos/${id}?ok=${msg}`);
}

/* ---------- Novo caso pela mesa (sem planilha) ---------- */

export type EstadoNovoCaso = { erros: string[]; avisos: string[]; valores: CamposNovoCaso } | null;

/**
 * Cadastra um devedor avulso com a mesma regra da importação: valida como linha de planilha, reconcilia com a carteira
 * (devedor já em cobrança recebe a parcela no caso existente) e abre o caso pela função compartilhada.
 * Devolve o estado do formulário quando há erro; em caso de sucesso redireciona para o caso.
 */
export async function novoCaso(_prev: EstadoNovoCaso, fd: FormData): Promise<EstadoNovoCaso> {
  const u = await exigeEquipe();
  const valores: CamposNovoCaso = {
    cliente_id: s(fd, "cliente_id"), devedor: s(fd, "devedor"), documento: s(fd, "documento"), referencia: s(fd, "referencia"), valor: s(fd, "valor"),
    vencimento: s(fd, "vencimento"), telefone: s(fd, "telefone"), email: s(fd, "email"), responsavel: s(fd, "responsavel"),
  };
  const hoje = hojeISO();
  const r = normalizaNovoCaso(valores, hoje);
  if (r.erros.length) return { erros: r.erros, avisos: r.avisos, valores };

  const [clientes, abertos] = await Promise.all([listaClientes(), listaCasos({ cliente: valores.cliente_id, abertos: true })]);
  if (!clientes.some((c) => c.id === valores.cliente_id)) return { erros: ["cliente não encontrado ou inativo"], avisos: [], valores };
  const parcelas = await parcelasDosCasos(abertos.map((c) => c.id));
  const [linha] = reconcilia([r.linha], abertos, parcelas, clientes, valores.cliente_id).linhas;
  if (linha.erros.length) return { erros: linha.erros, avisos: r.avisos, valores };

  const sb = await supabaseServer();
  const autor = { nome: u.nome, id: u.id };
  const aviso = r.avisos.length ? ` Atenção: ${r.avisos.join(" ")}` : "";
  let destino: string;
  try {
    if (linha.caso && linha.kind === "igual") {
      destino = `/casos/${linha.caso.id}?ok=${encodeURIComponent(`${linha.caso.devedor} já está em cobrança e esta parcela (${linha.referencia}, venc. ${fmtData(linha.vencimento)}) já consta no caso. Nada foi alterado.`)}`;
    } else if (linha.caso) {
      await consolidaParcela(sb, linha.caso.id, { referencia: linha.referencia, valor: linha.valor!, vencimento: linha.vencimento! }, {
        autor, valor_fonte: "mesa (consolidado)", eventoTexto: `${u.nome} cadastrou nova parcela em aberto pela mesa (${linha.referencia}, ${brl(linha.valor)}). Caso consolidado, régua mantida.`,
      });
      destino = `/casos/${linha.caso.id}?ok=${encodeURIComponent(`${linha.caso.devedor} já estava em cobrança: a parcela foi adicionada ao caso existente.`)}`;
    } else {
      const regua = mapaRegua(await listaRegua());
      const id = await abreCaso(sb, {
        cliente_id: valores.cliente_id, devedor: linha.devedor, documento: linha.documento, referencia: linha.referencia, valor: linha.valor!, vencimento: linha.vencimento!,
        telefone: linha.telefone, email: linha.email, responsavel: r.responsavel, valor_fonte: "mesa",
      }, { regua, hoje, autor, eventoTipo: "sistema", eventoTexto: `Caso aberto na mesa por ${u.nome}. Primeira notificação agendada na régua.` });
      destino = `/casos/${id}?ok=${encodeURIComponent(`Caso aberto.${aviso}`)}`;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("novoCaso falhou:", msg);
    return { erros: [`Não consegui gravar: ${msg}`], avisos: r.avisos, valores };
  }
  revalidatePath("/", "layout");
  redirect(destino);
}

/* ---------- Editar caso e parcelas (o cliente avisa que já pagou ou pede para não cobrar) ---------- */

const erroVolta = (id: string, msg: string): never => redirect(`/casos/${id}/editar?erro=${encodeURIComponent(msg)}`);

/** Cadastro completo do caso: devedor, referência, detalhe, documento, contato e, se informado, o valor em aberto. */
export async function editarCaso(fd: FormData) {
  const id = s(fd, "caso_id");
  const devedor = s(fd, "devedor");
  if (!devedor) erroVolta(id, "Informe o nome do devedor.");
  const valorTxt = s(fd, "valor");
  const valor = valorTxt ? parseValorForm(valorTxt) : null;
  if (valorTxt && (valor == null || valor < 0)) erroVolta(id, "Valor em aberto inválido.");
  await aplica(id, ({ caso }) => {
    const patch: Patch = {
      devedor,
      referencia: s(fd, "referencia") || caso.referencia,
      detalhe: s(fd, "detalhe") || null,
      documento: s(fd, "documento") || null,
      telefone: s(fd, "telefone") || null,
      email: s(fd, "email") || null,
    };
    const mudou: string[] = [];
    if (patch.devedor !== caso.devedor) mudou.push(`devedor "${caso.devedor}" → "${patch.devedor}"`);
    if (patch.referencia !== caso.referencia) mudou.push(`referência "${caso.referencia}" → "${patch.referencia}"`);
    if ((patch.detalhe ?? null) !== (caso.detalhe ?? null)) mudou.push("detalhe");
    if ((patch.documento ?? null) !== (caso.documento ?? null)) mudou.push(`documento ${patch.documento ?? "removido"}`);
    if ((patch.telefone ?? null) !== (caso.telefone ?? null)) mudou.push(`telefone ${patch.telefone ?? "removido"}`);
    if ((patch.email ?? null) !== (caso.email ?? null)) mudou.push(`e-mail ${patch.email ?? "removido"}`);
    if (valor != null && valor !== caso.valor_atualizado) {
      patch.valor_atualizado = valor;
      patch.valor_fonte = "cadastro manual";
      mudou.push(`valor em aberto ${brl(caso.valor_atualizado)} → ${brl(valor)}`);
    }
    patch.pendencias = (caso.pendencias ?? []).filter((p) => !(patch.documento && p === "sem CPF/CNPJ") && !((patch.telefone || patch.email) && p === "sem contato") && !(patch.valor_atualizado != null && p === "sem valor"));
    return { patch, evento: mudou.length ? { tipo: "cadastro", texto: `Caso editado: ${mudou.join(" · ")}.`, visivel_cliente: false } : null };
  });
  redirect(`/casos/${id}?ok=${encodeURIComponent("Caso atualizado.")}`);
}

type ParcelaLinha = { id: string; caso_id: string; referencia: string; valor: number; vencimento: string; paga: boolean; paga_em: string | null; retirada_em: string | null; retirada_motivo: string | null };

async function parcelasDoCaso(sb: Awaited<ReturnType<typeof supabaseServer>>, casoId: string): Promise<ParcelaLinha[]> {
  const { data, error } = await sb.from("parcelas").select("*").eq("caso_id", casoId).order("vencimento");
  if (error) throw new Error(error.message);
  return (data ?? []) as ParcelaLinha[];
}

/**
 * Depois de mexer nas parcelas, o valor do caso volta a ser a soma do que está em aberto e,
 * se não sobrou parcela aberta, o caso encerra (pago ou devolvido). Grava o evento informado.
 */
async function refleteParcelasNoCaso(casoId: string, evento: { tipo: string; texto: string; visivel_cliente?: boolean }) {
  const sb = await supabaseServer();
  const parcelas = await parcelasDoCaso(sb, casoId);
  await aplica(casoId, ({ caso }) => {
    const valores = recalculaValores(parcelas);
    const patch: Patch = { ...valores, valor_fonte: "parcelas (editadas pela mesa)" };
    patch.pendencias = (caso.pendencias ?? []).filter((p) => p !== "sem valor");
    const desfecho = desfechoSemAbertas(parcelas);
    let texto = evento.texto + ` Valor em aberto: ${brl(valores.valor_atualizado)}.`;
    if (desfecho && !["pago", "devolvido"].includes(caso.fase)) {
      Object.assign(patch, { fase: desfecho, acordo: null, ...prox(null), ...colunasExcecao(null, "", "") });
      texto += desfecho === "pago" ? " Nenhuma parcela em aberto: caso encerrado como pago." : " Nenhuma parcela em cobrança: caso devolvido ao cliente.";
    }
    return { patch, evento: { ...evento, texto } };
  });
}

/** Corrige referência, valor ou vencimento de uma parcela (erro de digitação ou planilha errada). */
export async function editarParcela(fd: FormData) {
  const id = s(fd, "caso_id");
  const parcelaId = s(fd, "parcela_id");
  const v = validaParcela({ referencia: s(fd, "referencia"), valor: s(fd, "valor"), vencimento: s(fd, "vencimento") });
  if (v.erros.length) erroVolta(id, `Parcela não salva: ${v.erros.join("; ")}.`);
  await exigeEquipe();
  const sb = await supabaseServer();
  const antes = (await parcelasDoCaso(sb, id)).find((p) => p.id === parcelaId);
  if (!antes) return erroVolta(id, "Parcela não encontrada.");
  const { error } = await sb.from("parcelas").update(v.dados).eq("id", parcelaId).eq("caso_id", id);
  if (error) erroVolta(id, error.code === "23505" ? "Já existe uma parcela com essa referência e vencimento neste caso." : error.message);
  await refleteParcelasNoCaso(id, { tipo: "cadastro", texto: `Parcela corrigida: ${descreveParcela(antes)} → ${descreveParcela(v.dados)}.`, visivel_cliente: false });
  redirect(`/casos/${id}/editar?ok=${encodeURIComponent("Parcela corrigida.")}`);
}

/**
 * Baixa uma parcela como paga (o cliente confirmou que recebeu) ou a retira da cobrança (o cliente pediu
 * para não cobrar). "Reabrir" desfaz qualquer uma das duas. Fica no histórico visível ao cliente.
 */
export async function baixarParcela(fd: FormData) {
  const id = s(fd, "caso_id");
  const parcelaId = s(fd, "parcela_id");
  const acao = s(fd, "acao");
  await exigeEquipe();
  const sb = await supabaseServer();
  const p = (await parcelasDoCaso(sb, id)).find((x) => x.id === parcelaId);
  if (!p) return erroVolta(id, "Parcela não encontrada.");
  const hoje = hojeISO();
  let patch: Partial<ParcelaLinha>;
  let texto: string;
  let ok: string;
  if (acao === "paga") {
    const em = dataOu(s(fd, "paga_em"), hoje);
    patch = { paga: true, paga_em: em, retirada_em: null, retirada_motivo: null };
    texto = `Parcela ${descreveParcela(p)} baixada como paga em ${fmtData(em)}, conforme informado pelo cliente.`;
    ok = "Parcela baixada como paga.";
  } else if (acao === "retirada") {
    const motivo = s(fd, "motivo") || "a pedido do cliente";
    patch = { paga: false, paga_em: null, retirada_em: hoje, retirada_motivo: motivo };
    texto = `Parcela ${descreveParcela(p)} retirada da cobrança: ${motivo}.`;
    ok = "Parcela retirada da cobrança.";
  } else if (acao === "reabrir") {
    patch = { paga: false, paga_em: null, retirada_em: null, retirada_motivo: null };
    texto = `Parcela ${descreveParcela(p)} reaberta para cobrança (estava ${situacaoParcela(p) === "paga" ? "baixada como paga" : "retirada da cobrança"}).`;
    ok = "Parcela reaberta.";
  } else return erroVolta(id, "Ação inválida.");
  const { error } = await sb.from("parcelas").update(patch).eq("id", parcelaId).eq("caso_id", id);
  if (error) erroVolta(id, error.message);
  await refleteParcelasNoCaso(id, { tipo: acao === "paga" ? "pagamento" : "cadastro", texto, visivel_cliente: true });
  redirect(`/casos/${id}/editar?ok=${encodeURIComponent(ok)}`);
}

/** Inclui uma competência que ficou de fora (mesma regra da consolidação por planilha: referência + vencimento únicos). */
export async function adicionarParcela(fd: FormData) {
  const id = s(fd, "caso_id");
  const v = validaParcela({ referencia: s(fd, "referencia"), valor: s(fd, "valor"), vencimento: s(fd, "vencimento") });
  if (v.erros.length) erroVolta(id, `Parcela não incluída: ${v.erros.join("; ")}.`);
  await exigeEquipe();
  const sb = await supabaseServer();
  const { error } = await sb.from("parcelas").insert({ caso_id: id, ...v.dados });
  if (error) erroVolta(id, error.code === "23505" ? "Essa parcela (referência + vencimento) já está no caso." : error.message);
  await refleteParcelasNoCaso(id, { tipo: "cadastro", texto: `Parcela incluída pela mesa: ${descreveParcela(v.dados)}.`, visivel_cliente: true });
  redirect(`/casos/${id}/editar?ok=${encodeURIComponent("Parcela incluída.")}`);
}
