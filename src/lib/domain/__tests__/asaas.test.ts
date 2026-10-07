import { describe, expect, it } from "vitest";
import { addMeses, classificaEvento, planoParcelas, statusPorEvento } from "../asaas";

describe("plano de parcelas do acordo", () => {
  it("soma exatamente o total, com centavos na última parcela", () => {
    const p = planoParcelas(1000, 0, 3, "2026-10-10");
    expect(p.map((x) => x.valor)).toEqual([333.33, 333.33, 333.34]);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
    expect(p.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(1000, 2);
  });
  it("entrada no primeiro vencimento e parcelas a partir do mês seguinte", () => {
    const p = planoParcelas(2000, 10, 2, "2026-10-31");
    expect(p[0]).toMatchObject({ tipo: "entrada", valor: 200, vencimento: "2026-10-31" });
    expect(p[1]).toMatchObject({ tipo: "parcela", n: 1, valor: 900, vencimento: "2026-11-30" });
    expect(p[2]).toMatchObject({ tipo: "parcela", n: 2, valor: 900, vencimento: "2026-12-30" });
  });
  it("uma parcela sem entrada vira cobrança integral", () => {
    expect(planoParcelas(500, 0, 1, "2026-10-10")).toEqual([{ n: 1, tipo: "integral", valor: 500, vencimento: "2026-10-10" }]);
  });
  it("addMeses respeita fim de mês", () => {
    expect(addMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMeses("2026-12-15", 1)).toBe("2027-01-15");
  });
});

describe("eventos do webhook", () => {
  it("classifica pagamento, vencimento, cancelamento e estorno", () => {
    expect(classificaEvento("PAYMENT_RECEIVED")).toBe("pago");
    expect(classificaEvento("PAYMENT_CONFIRMED")).toBe("pago");
    expect(classificaEvento("PAYMENT_OVERDUE")).toBe("vencido");
    expect(classificaEvento("PAYMENT_DELETED")).toBe("cancelado");
    expect(classificaEvento("PAYMENT_REFUNDED")).toBe("estornado");
    expect(classificaEvento("PAYMENT_CREATED")).toBe("ignorar");
  });
  it("evento desconhecido não altera o status", () => {
    expect(statusPorEvento("PAYMENT_UPDATED", "PENDING")).toBe("PENDING");
    expect(statusPorEvento("PAYMENT_CONFIRMED", "PENDING")).toBe("CONFIRMED");
  });
});
