import type { supabaseServer } from "@/lib/supabase/server";
import { addDias } from "@/lib/domain/datas";
import { colunasExcecao, colunasProxima, derivaProxima, type mapaRegua } from "@/lib/domain/regua";

type SB = Awaited<ReturnType<typeof supabaseServer>>;
type Regua = ReturnType<typeof mapaRegua>;
export type Autor = { nome: string; id: string };

/** Dados mínimos para abrir um caso em cobrança: os mesmos da linha da planilha. */
export type DadosAbertura = {
  cliente_id: string;
  devedor: string;
  documento: string;
  /** "Mensalidades mar/2026 - Ana (5º ano)": o que vem antes de " - " é a referência, o resto o detalhe. */
  referencia: string;
  valor: number;
  vencimento: string; // ISO
  telefone: string;
  email: string;
  responsavel: string;
  /** De onde veio o valor (coluna valor_fonte): "planilha", "mesa"... */
  valor_fonte: string;
  /** Quando a própria origem já pede para não cobrar (coluna situacao da planilha): abre pausado, em exceção. */
  excecao?: { motivo: string } | null;
};

/**
 * Abre um caso na fase "regua" com a primeira parcela e o evento de abertura.
 * É o único lugar que cria caso a partir de uma dívida nova: importação de planilha e cadastro avulso passam aqui,
 * para que a regra de ouro (responsável + próxima ação + data) e a régua sejam sempre as mesmas.
 * Devolve o id do caso criado.
 */
export async function abreCaso(sb: SB, d: DadosAbertura, ctx: { regua: Regua; hoje: string; autor: Autor; eventoTexto: string; eventoTipo?: string }): Promise<string> {
  const { regua, hoje } = ctx;
  const base = { fase: "regua" as const, fase_nota: "Régua automática", ultima_mov_em: new Date().toISOString() };
  const prox = d.excecao
    ? { data: addDias(hoje, regua.excecao?.dias ?? 30), tipo: "decidir" as const, nota: "Revisar exceção: Não cobrar", auto: true }
    : derivaProxima({ ...base, exc_tipo: null, exc_revisao: null }, regua, hoje);
  const [referencia, ...detalhe] = d.referencia.split(" - ");
  const { data: novo, error } = await sb.from("casos").insert({
    cliente_id: d.cliente_id, devedor: d.devedor, documento: d.documento, referencia: referencia || "Título em cobrança", detalhe: detalhe.length ? detalhe.join(" - ") : null,
    valor_original: d.valor, valor_atualizado: d.valor, valor_fonte: d.valor_fonte, ...base, responsavel: d.responsavel, ...colunasProxima(prox),
    ...(d.excecao ? colunasExcecao("nao_cobrar", d.excecao.motivo, hoje, undefined, regua) : {}),
    telefone: d.telefone || null, email: d.email || null, entrada_em: hoje, pendencias: [],
  }).select("id").single();
  if (error) throw new Error(error.message);
  const { error: e2 } = await sb.from("parcelas").insert({ caso_id: novo.id, referencia: d.referencia, valor: d.valor, vencimento: d.vencimento });
  if (e2) throw new Error(e2.message);
  await registraEvento(sb, novo.id, ctx.autor, ctx.eventoTipo ?? "importacao", ctx.eventoTexto);
  return novo.id;
}

/**
 * Devedor já em cobrança: a nova parcela entra no caso existente, o valor soma e a régua é mantida.
 * A mesma parcela (referência + vencimento) não entra duas vezes.
 */
export async function consolidaParcela(sb: SB, casoId: string, p: { referencia: string; valor: number; vencimento: string }, ctx: { autor: Autor; valor_fonte: string; eventoTexto: string; eventoTipo?: string }): Promise<void> {
  const { data: c } = await sb.from("casos").select("valor_original, valor_atualizado").eq("id", casoId).single();
  const { error } = await sb.from("parcelas").upsert({ caso_id: casoId, referencia: p.referencia, valor: p.valor, vencimento: p.vencimento }, { onConflict: "caso_id,referencia,vencimento", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  const { error: e2 } = await sb.from("casos").update({ valor_original: (c?.valor_original ?? 0) + p.valor, valor_atualizado: (c?.valor_atualizado ?? 0) + p.valor, valor_fonte: ctx.valor_fonte, ultima_mov_em: new Date().toISOString() }).eq("id", casoId);
  if (e2) throw new Error(e2.message);
  await registraEvento(sb, casoId, ctx.autor, ctx.eventoTipo ?? "importacao", ctx.eventoTexto);
}

export async function registraEvento(sb: SB, casoId: string, autor: Autor, tipo: string, texto: string, visivel_cliente = true): Promise<void> {
  const { error } = await sb.from("eventos").insert({ caso_id: casoId, autor: autor.nome, autor_id: autor.id, tipo, texto, visivel_cliente });
  if (error) throw new Error(error.message);
}
