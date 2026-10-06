import { addDias, diffDias } from "./datas";
import { EXCECOES, isAberto, type Caso, type ReguaItem, type TipoExcecao, type TipoFollowup } from "./types";

export type ProximaAcao = { data: string; tipo: TipoFollowup; nota: string; auto: boolean };

type ReguaMap = Record<string, ReguaItem>;
export const mapaRegua = (itens: ReguaItem[]): ReguaMap => Object.fromEntries(itens.map((r) => [r.chave, r]));

/**
 * Deriva a próxima ação automática de um caso a partir da fase e da última movimentação.
 * É a régua operacional em código: mudar os dias na tabela `regua` muda o comportamento.
 */
export function derivaProxima(caso: Pick<Caso, "fase" | "fase_nota" | "exc_tipo" | "exc_revisao" | "ultima_mov_em">, regua: ReguaMap, hoje: string): ProximaAcao | null {
  if (!isAberto(caso)) return null;
  if (caso.exc_tipo) {
    return { data: caso.exc_revisao ?? addDias(hoje, regua.excecao?.dias ?? 30), tipo: "decidir", nota: `Revisar exceção: ${EXCECOES[caso.exc_tipo]}`, auto: true };
  }
  const base = caso.ultima_mov_em.slice(0, 10);
  const em = (chave: string, tipo: TipoFollowup, nota?: string): ProximaAcao => {
    const r = regua[chave];
    return { data: addDias(base, r?.dias ?? 7), tipo, nota: nota ?? r?.nota ?? chave, auto: true };
  };
  const nota = caso.fase_nota ?? "";
  switch (caso.fase) {
    case "regua":
      return em("cobranca", "recontatar");
    case "neg":
      if (/Notificação extrajudicial pendente/i.test(nota)) return em("notif1", "decidir", "Emitir notificação extrajudicial");
      if (/Notificado/i.test(nota)) return em("notifExtra", "notif");
      return em("recontato", "recontatar");
    case "acordo":
      return em("acordoConf", "acordo");
    case "quebra":
      return em("quebra", "decidir");
    case "analise":
      return em("analise", "decidir");
    case "protesto":
      return em("protesto", "notif");
    case "judicial":
      return em("judicial", "judicial");
    case "confirma":
      return { data: addDias(base, 1), tipo: "decidir", nota: "Conferir pagamento informado", auto: true };
  }
  return null;
}

/** Próxima ação marcada por uma ação humana (não é sobrescrita ao reprogramar a régua). */
export function marca(hoje: string, dias: number, tipo: TipoFollowup, nota: string): ProximaAcao {
  return { data: addDias(hoje, dias), tipo, nota, auto: false };
}

export function colunasProxima(p: ProximaAcao | null) {
  return p
    ? { proxima_data: p.data, proxima_tipo: p.tipo, proxima_nota: p.nota, proxima_auto: p.auto }
    : { proxima_data: null, proxima_tipo: null, proxima_nota: null, proxima_auto: true };
}

export function colunasExcecao(tipo: TipoExcecao | null, motivo: string, hoje: string, revisao?: string, regua?: ReguaMap) {
  if (!tipo) return { exc_tipo: null, exc_motivo: null, exc_desde: null, exc_revisao: null };
  return { exc_tipo: tipo, exc_motivo: motivo || null, exc_desde: hoje, exc_revisao: revisao ?? addDias(hoje, regua?.excecao?.dias ?? 30) };
}

export const atrasoDias = (caso: Pick<Caso, "proxima_data">, hoje: string) => (caso.proxima_data ? diffDias(hoje, caso.proxima_data) : 0);
