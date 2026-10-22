import { brl, fmtData } from "@/lib/domain/datas";
import { parseValorForm } from "@/lib/domain/novo-caso";
import type { Parcela } from "@/lib/domain/types";

/**
 * Situação de uma parcela consolidada no caso (migration 0011):
 * - aberta: em cobrança; entra no valor da dívida.
 * - paga: o cliente ou o devedor confirmou o pagamento; sai do valor em aberto, fica no original.
 * - retirada: o cliente pediu para não cobrar; sai dos dois valores, mas a linha fica para a
 *   reconciliação da planilha não a recriar.
 */
export type SituacaoParcela = "aberta" | "paga" | "retirada";

export const SITUACAO_PARCELA: Record<SituacaoParcela, string> = {
  aberta: "em cobrança",
  paga: "paga",
  retirada: "retirada da cobrança",
};

export function situacaoParcela(p: Pick<Parcela, "paga" | "retirada_em">): SituacaoParcela {
  if (p.paga) return "paga";
  if (p.retirada_em) return "retirada";
  return "aberta";
}

export const parcelaAberta = (p: Pick<Parcela, "paga" | "retirada_em">) => situacaoParcela(p) === "aberta";

export type TotaisParcelas = { aberto: number; pago: number; retirado: number; abertas: number; pagas: number; retiradas: number };

const soma = (ps: Pick<Parcela, "valor">[]) => Math.round(ps.reduce((t, p) => t + Number(p.valor), 0) * 100) / 100;

export function totaisParcelas(parcelas: Pick<Parcela, "valor" | "paga" | "retirada_em">[]): TotaisParcelas {
  const por = (s: SituacaoParcela) => parcelas.filter((p) => situacaoParcela(p) === s);
  return { aberto: soma(por("aberta")), pago: soma(por("paga")), retirado: soma(por("retirada")), abertas: por("aberta").length, pagas: por("paga").length, retiradas: por("retirada").length };
}

/**
 * Valores do caso derivados das parcelas: o original é o que foi consolidado e continua devido ou foi pago
 * (parcela retirada nunca deveria ter entrado); o atualizado é o que ainda está em aberto.
 * Mesma regra de `consolidaParcela`, que soma a parcela nos dois ao importar.
 */
export function recalculaValores(parcelas: Pick<Parcela, "valor" | "paga" | "retirada_em">[]): { valor_original: number; valor_atualizado: number } {
  const t = totaisParcelas(parcelas);
  return { valor_original: Math.round((t.aberto + t.pago) * 100) / 100, valor_atualizado: t.aberto };
}

/** Sem parcela aberta, o caso não tem mais o que cobrar: fecha como pago se alguma foi paga, senão devolve ao cliente. */
export function desfechoSemAbertas(parcelas: Pick<Parcela, "valor" | "paga" | "retirada_em">[]): "pago" | "devolvido" | null {
  if (!parcelas.length) return null;
  const t = totaisParcelas(parcelas);
  if (t.abertas > 0) return null;
  return t.pagas > 0 ? "pago" : "devolvido";
}

export type CamposParcela = { referencia: string; valor: string; vencimento: string };

/** Valida os campos de uma parcela digitada na mesa. Devolve os erros (vazio = ok) e os valores normalizados. */
export function validaParcela(c: CamposParcela): { erros: string[]; dados: { referencia: string; valor: number; vencimento: string } } {
  const erros: string[] = [];
  const referencia = c.referencia.trim();
  const valor = parseValorForm(c.valor);
  const vencimento = c.vencimento.trim();
  if (!referencia) erros.push("informe a referência da parcela");
  if (valor == null || !(valor > 0)) erros.push("valor deve ser maior que zero");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento) || Number.isNaN(Date.parse(vencimento))) erros.push("vencimento inválido");
  return { erros, dados: { referencia, valor: valor ?? 0, vencimento } };
}

export const descreveParcela = (p: Pick<Parcela, "referencia" | "valor" | "vencimento">) => `${p.referencia} (${brl(p.valor)}, venc. ${fmtData(p.vencimento)})`;
