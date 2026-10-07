import { addDias } from "./datas";

/** Regras puras da integração Asaas. Sem rede, testáveis. */

export type ParcelaPlano = { n: number; tipo: "entrada" | "parcela" | "integral"; valor: number; vencimento: string };

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Soma um mês mantendo o dia quando possível (31/01 → 28/02). */
export function addMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/**
 * Plano de cobranças de um acordo: entrada (opcional) no primeiro vencimento e N parcelas mensais.
 * A última parcela absorve a diferença de centavos para a soma bater exatamente com o total.
 */
export function planoParcelas(total: number, entradaPct: number, parcelas: number, primeiroVenc: string): ParcelaPlano[] {
  const n = Math.max(1, Math.floor(parcelas));
  const entrada = r2(total * (Math.max(0, Math.min(100, entradaPct)) / 100));
  const restante = r2(total - entrada);
  const out: ParcelaPlano[] = [];
  if (n === 1 && entrada === 0) return [{ n: 1, tipo: "integral", valor: r2(total), vencimento: primeiroVenc }];
  let venc = primeiroVenc;
  if (entrada > 0) { out.push({ n: 0, tipo: "entrada", valor: entrada, vencimento: venc }); venc = addMeses(primeiroVenc, 1); }
  const base = Math.floor((restante / n) * 100) / 100;
  let acumulado = 0;
  for (let i = 1; i <= n; i++) {
    const valor = i === n ? r2(restante - acumulado) : base;
    acumulado = r2(acumulado + valor);
    out.push({ n: i, tipo: "parcela", valor, vencimento: venc });
    venc = addMeses(venc, 1);
  }
  return out;
}

export type EfeitoEvento = "pago" | "vencido" | "cancelado" | "estornado" | "ignorar";

/** O que cada evento do Asaas significa para o caso. Eventos desconhecidos são registrados e ignorados. */
export function classificaEvento(evento: string): EfeitoEvento {
  switch (evento) {
    case "PAYMENT_RECEIVED":
    case "PAYMENT_CONFIRMED":
      return "pago";
    case "PAYMENT_OVERDUE":
      return "vencido";
    case "PAYMENT_DELETED":
      return "cancelado";
    case "PAYMENT_REFUNDED":
    case "PAYMENT_RECEIVED_IN_CASH_UNDONE":
    case "PAYMENT_CHARGEBACK_REQUESTED":
    case "PAYMENT_CHARGEBACK_DISPUTE":
      return "estornado";
    default:
      return "ignorar";
  }
}

/** Status de uma cobrança a partir do evento, para a tabela `cobrancas`. */
export function statusPorEvento(evento: string, atual: string): string {
  const e = classificaEvento(evento);
  if (e === "pago") return evento === "PAYMENT_CONFIRMED" ? "CONFIRMED" : "RECEIVED";
  if (e === "vencido") return "OVERDUE";
  if (e === "cancelado") return "DELETED";
  if (e === "estornado") return "REFUNDED";
  return atual;
}

export const hojeMais = (hoje: string, dias: number) => addDias(hoje, dias);
