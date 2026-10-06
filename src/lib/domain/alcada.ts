import type { Cliente } from "./types";

export type TermosProposta = { desconto_pct: number; parcelas: number; entrada_pct: number; total: number };

/** Confere uma proposta contra as alçadas do cliente. Dentro: a equipe fecha; fora: o cliente decide. */
export function confereAlcada(p: TermosProposta, limites: Cliente["limites"]) {
  const parcelaValor = (p.total * (1 - p.entrada_pct / 100)) / Math.max(1, p.parcelas);
  const motivos: string[] = [];
  if (p.desconto_pct > limites.desc) motivos.push(`desconto acima de ${limites.desc}%`);
  if (p.parcelas > limites.parc) motivos.push(`mais de ${limites.parc} parcelas`);
  if (p.entrada_pct < limites.ent) motivos.push(`entrada abaixo de ${limites.ent}%`);
  if (parcelaValor < limites.min) motivos.push(`parcela abaixo de R$ ${limites.min}`);
  return { fora: motivos.length > 0, motivos, parcelaValor };
}
