import { describe, expect, it } from "vitest";
import { desfechoSemAbertas, descreveParcela, parcelaAberta, recalculaValores, situacaoParcela, totaisParcelas, validaParcela } from "../parcelas";
import { brl } from "../datas";
import type { Parcela } from "../types";

const p = (over: Partial<Parcela> = {}): Parcela => ({ id: "p", caso_id: "c", referencia: "Mensalidade mar/2026", competencia: null, valor: 1419, vencimento: "2026-03-30", paga: false, paga_em: null, retirada_em: null, retirada_motivo: null, ...over });

describe("situação da parcela", () => {
  it("aberta por padrão; paga e retirada pelas colunas", () => {
    expect(situacaoParcela(p())).toBe("aberta");
    expect(situacaoParcela(p({ paga: true, paga_em: "2026-04-01" }))).toBe("paga");
    expect(situacaoParcela(p({ retirada_em: "2026-04-01" }))).toBe("retirada");
    expect(parcelaAberta(p())).toBe(true);
    expect(parcelaAberta(p({ retirada_em: "2026-04-01" }))).toBe(false);
  });

  it("tolera linhas antigas sem as colunas da migration 0011", () => {
    const antiga = { paga: false } as unknown as Parcela;
    expect(situacaoParcela(antiga)).toBe("aberta");
  });
});

describe("totais e valores do caso", () => {
  const lista = [p({ id: "1", valor: 1419 }), p({ id: "2", valor: 1419, paga: true, paga_em: "2026-05-02" }), p({ id: "3", valor: 500, retirada_em: "2026-05-02" })];

  it("soma por situação com centavos exatos", () => {
    expect(totaisParcelas(lista)).toEqual({ aberto: 1419, pago: 1419, retirado: 500, abertas: 1, pagas: 1, retiradas: 1 });
    expect(totaisParcelas([p({ valor: 0.1 }), p({ valor: 0.2 })]).aberto).toBe(0.3);
  });

  it("original = aberto + pago; atualizado = aberto (retirada sai dos dois)", () => {
    expect(recalculaValores(lista)).toEqual({ valor_original: 2838, valor_atualizado: 1419 });
    expect(recalculaValores([])).toEqual({ valor_original: 0, valor_atualizado: 0 });
  });

  it("aceita valor vindo do banco como string", () => {
    expect(recalculaValores([p({ valor: "1419.50" as unknown as number })]).valor_atualizado).toBe(1419.5);
  });
});

describe("desfecho quando não sobra parcela aberta", () => {
  it("segue aberto enquanto houver parcela em cobrança", () => {
    expect(desfechoSemAbertas([p(), p({ paga: true })])).toBeNull();
  });
  it("pago se alguma foi paga; devolvido se todas foram retiradas", () => {
    expect(desfechoSemAbertas([p({ paga: true }), p({ retirada_em: "2026-05-02" })])).toBe("pago");
    expect(desfechoSemAbertas([p({ retirada_em: "2026-05-02" })])).toBe("devolvido");
  });
  it("sem parcelas não decide nada", () => {
    expect(desfechoSemAbertas([])).toBeNull();
  });
});

describe("validação da parcela digitada", () => {
  it("aceita valor em formato brasileiro e normaliza", () => {
    const v = validaParcela({ referencia: " Mensalidade abr/2026 ", valor: "1.419,00", vencimento: "2026-04-30" });
    expect(v.erros).toEqual([]);
    expect(v.dados).toEqual({ referencia: "Mensalidade abr/2026", valor: 1419, vencimento: "2026-04-30" });
  });
  it("recusa referência vazia, valor zero ou negativo e data inválida", () => {
    const v = validaParcela({ referencia: "", valor: "0", vencimento: "30/04/2026" });
    expect(v.erros).toHaveLength(3);
    expect(validaParcela({ referencia: "x", valor: "-5", vencimento: "2026-04-30" }).erros).toEqual(["valor deve ser maior que zero"]);
    expect(validaParcela({ referencia: "x", valor: "10", vencimento: "2026-02-31" }).erros).toEqual([]);
  });
});

describe("descrição no histórico", () => {
  it("referência, valor e vencimento formatados", () => {
    expect(descreveParcela(p())).toBe(`Mensalidade mar/2026 (${brl(1419)}, venc. 30/03/2026)`);
  });
});
