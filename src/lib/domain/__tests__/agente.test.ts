import { describe, expect, it } from "vitest";
import { leituraAgente } from "../agente";
import type { Caso, Cliente, Cobranca, Parcela, Proposta } from "../types";

const HOJE = "2026-10-27";

function caso(p: Partial<Caso> & { id: string }): Caso {
  return {
    cliente_id: "wrj",
    devedor: `Devedor ${p.id}`,
    documento: null,
    documento_digits: "",
    referencia: "Título em cobrança",
    detalhe: null,
    valor_original: 1000,
    valor_atualizado: null,
    valor_fonte: null,
    fase: "regua",
    fase_nota: null,
    responsavel: "Ana Paula",
    proxima_data: "2026-11-10",
    proxima_tipo: "recontatar",
    proxima_nota: null,
    proxima_auto: true,
    exc_tipo: null,
    exc_motivo: null,
    exc_desde: null,
    exc_revisao: null,
    telefone: "62999999999",
    email: null,
    processo: null,
    acordo: null,
    origem: null,
    asaas_customer_id: null,
    wa_optout: false,
    pendencias: [],
    entrada_em: "2026-01-10",
    ultima_mov_em: "2026-10-20T12:00:00Z",
    encerrado_em: null,
    ...p,
  };
}

function parcela(p: Partial<Parcela> & { caso_id: string; vencimento: string }): Parcela {
  return { id: `${p.caso_id}-${p.vencimento}`, referencia: "parcela", competencia: null, valor: 100, paga: false, paga_em: null, retirada_em: null, retirada_motivo: null, ...p };
}

const clientes: Record<string, Cliente> = {
  wrj: { id: "wrj", nome: "Colégio WRJ", nome_curto: "WRJ" } as Cliente,
};

describe("leitura do agente de Cobrança", () => {
  it("ignora casos encerrados e soma o valor aberto", () => {
    const l = leituraAgente(
      [caso({ id: "a", valor_atualizado: 1500 }), caso({ id: "b", fase: "pago", encerrado_em: "2026-10-01T00:00:00Z" })],
      clientes, [], [], HOJE,
    );
    expect(l.resumo.casos_abertos).toBe(1);
    expect(l.resumo.valor_aberto).toBe(1500);
  });

  it("sinaliza atenção de prescrição só com parcela aberta vencida há mais de 4 anos e sem exceção 'prescrito'", () => {
    const antiga = parcela({ caso_id: "velho", vencimento: "2022-09-01" });
    const recente = parcela({ caso_id: "novo", vencimento: "2024-01-01" });
    const jaMarcado = parcela({ caso_id: "marcado", vencimento: "2020-01-01" });
    const paga = parcela({ caso_id: "pago", vencimento: "2019-01-01", paga: true, paga_em: "2019-02-01" });
    const l = leituraAgente(
      [
        caso({ id: "velho" }),
        caso({ id: "novo" }),
        caso({ id: "marcado", exc_tipo: "prescrito", exc_desde: "2026-01-01", exc_revisao: "2027-01-01", exc_motivo: "x" }),
        caso({ id: "pago" }),
      ],
      clientes, [antiga, recente, jaMarcado, paga], [], HOJE,
    );
    expect(l.atencao_prescricao.map((i) => i.caso_id)).toEqual(["velho"]);
    expect(l.atencao_prescricao[0]).toMatchObject({ vencimento_mais_antigo: "2022-09-01", anos: 4, cliente: "WRJ" });
  });

  it("lista acordo com parcela vencida e não paga, com soma do valor vencido", () => {
    const l = leituraAgente(
      [caso({ id: "ac", fase: "acordo", acordo: { parc: 3, paid: 1, next: "2026-10-10" } })],
      clientes,
      [
        parcela({ caso_id: "ac", vencimento: "2026-09-10", valor: 200 }),
        parcela({ caso_id: "ac", vencimento: "2026-10-10", valor: 200 }),
        parcela({ caso_id: "ac", vencimento: "2026-11-10", valor: 200 }),
        parcela({ caso_id: "ac", vencimento: "2026-08-10", valor: 200, retirada_em: "2026-08-20", retirada_motivo: "cliente" }),
      ],
      [], HOJE,
    );
    expect(l.acordo_em_atraso).toHaveLength(1);
    expect(l.acordo_em_atraso[0]).toMatchObject({ parcelas_vencidas: 2, valor_vencido: 400, vencimento_mais_antigo: "2026-09-10" });
  });

  it("acordo em atraso pelas cobranças do Asaas, ignorando as pagas e canceladas", () => {
    const cob = (p: Partial<Cobranca> & { vencimento: string; status: string }): Cobranca =>
      ({ id: `c-${p.vencimento}-${p.status}`, caso_id: "asa", asaas_id: `pay_${p.vencimento}`, tipo: "parcela", parcela_n: 1, parcelas: 3, valor: 300,
         invoice_url: null, boleto_url: null, pix_copia: null, valor_pago: null, pago_em: null, criado_por: "x", criado_em: "2026-08-01T00:00:00Z", ...p }) as Cobranca;
    const l = leituraAgente(
      [caso({ id: "asa", fase: "acordo", acordo: { parc: 3, paid: 1, next: "2026-09-15" } })],
      clientes,
      [],
      [],
      HOJE,
      [
        cob({ vencimento: "2026-08-15", status: "RECEIVED", pago_em: "2026-08-15T10:00:00Z" }),
        cob({ vencimento: "2026-09-15", status: "OVERDUE" }),
        cob({ vencimento: "2026-10-15", status: "PENDING" }),
        cob({ vencimento: "2026-10-01", status: "DELETED" }),
        cob({ vencimento: "2026-11-15", status: "PENDING" }),
      ],
    );
    expect(l.acordo_em_atraso).toHaveLength(1);
    expect(l.acordo_em_atraso[0]).toMatchObject({ parcelas_vencidas: 2, valor_vencido: 600, vencimento_mais_antigo: "2026-09-15", fonte: "asaas" });
    expect(l.resumo.casos_sem_vencimento).toBe(0);
  });

  it("conta os casos abertos sem nenhum vencimento cadastrado", () => {
    const l = leituraAgente(
      [caso({ id: "com" }), caso({ id: "sem1" }), caso({ id: "sem2" })],
      clientes,
      [parcela({ caso_id: "com", vencimento: "2026-01-01", paga: true, paga_em: "2026-01-05" })],
      [],
      HOJE,
    );
    expect(l.resumo.casos_sem_vencimento).toBe(2);
  });

  it("propostas fora da alçada pendentes, mais antigas primeiro", () => {
    const prop = (id: string, caso_id: string, enviada_em: string): Proposta =>
      ({ id, caso_id, desconto_pct: 10, parcelas: 3, entrada_pct: 10, total: 900, nota: null, fora_alcada: true, status: "pending", enviada_em }) as Proposta;
    const l = leituraAgente(
      [caso({ id: "x", fase: "neg" }), caso({ id: "y", fase: "neg" })],
      clientes, [],
      [prop("p1", "x", "2026-10-25T10:00:00Z"), prop("p2", "y", "2026-10-15T10:00:00Z"), { ...prop("p3", "x", "2026-10-01T00:00:00Z"), fora_alcada: false }],
      HOJE,
    );
    expect(l.propostas_aguardando_cliente.map((p) => [p.caso_id, p.dias])).toEqual([["y", 12], ["x", 2]]);
  });
});
