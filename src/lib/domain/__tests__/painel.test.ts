import { describe, expect, it } from "vitest";
import { carteiraParada, porCliente, produtividade, recuperadoPorMes, taxaAcordo, tempoAtePagamento, ultimosMeses } from "../painel";
import { fimDoMes, mesesDisponiveis, montaRelatorio } from "../relatorio";
import type { Caso, Cobranca, Evento } from "../types";

const HOJE = "2026-10-17";
const caso = (p: Partial<Caso>): Caso => ({
  id: p.id ?? Math.random().toString(36).slice(2), cliente_id: "wrj", devedor: "Fulano", documento: null, documento_digits: "", referencia: "Mensalidade", detalhe: null,
  valor_original: 1000, valor_atualizado: 1200, valor_fonte: null, fase: "neg", fase_nota: null, responsavel: "Ana Paula", proxima_data: "2026-10-20", proxima_tipo: "recontatar",
  proxima_nota: "Recontatar", proxima_auto: true, exc_tipo: null, exc_motivo: null, exc_desde: null, exc_revisao: null, telefone: null, email: null, processo: null, acordo: null,
  origem: null, asaas_customer_id: null, wa_optout: false, pendencias: [], entrada_em: "2026-08-01", ultima_mov_em: "2026-10-10T12:00:00Z", encerrado_em: null, ...p,
});
const ev = (p: Partial<Evento>): Evento => ({ id: Math.random().toString(36).slice(2), caso_id: "a", data: "2026-10-05T12:00:00Z", autor: "Ana Paula", tipo: "contato", texto: "WhatsApp: sem resposta.", visivel_cliente: true, ...p });

const casos: Caso[] = [
  caso({ id: "a", fase: "pago", encerrado_em: "2026-10-03T10:00:00Z", entrada_em: "2026-09-03", acordo: { parc: 2, paid: 2, next: "" } }),
  caso({ id: "b", fase: "pago", encerrado_em: "2026-09-20T10:00:00Z", entrada_em: "2026-08-01", valor_atualizado: 500 }),
  caso({ id: "c", fase: "devolvido", encerrado_em: "2026-10-10T10:00:00Z" }),
  caso({ id: "d", fase: "neg", ultima_mov_em: "2026-07-01T12:00:00Z", proxima_data: "2026-07-10" }),
  caso({ id: "e", fase: "acordo", cliente_id: "lobe", responsavel: "Letícia", acordo: { parc: 3, paid: 1, next: "2026-11-01" }, entrada_em: "2026-10-02" }),
  caso({ id: "f", fase: "regua", cliente_id: "lobe", entrada_em: "2026-10-15", ultima_mov_em: "2026-10-15T12:00:00Z" }),
];
const eventos: Evento[] = [
  ev({ caso_id: "a", tipo: "acordo", texto: "Acordo fechado pela equipe dentro da alçada." }),
  ev({ caso_id: "d", tipo: "contato", data: "2026-10-01T12:00:00Z" }),
  ev({ caso_id: "e", tipo: "acordo", autor: "Letícia", texto: "Proposta aprovada pelo cliente." }),
  ev({ caso_id: "e", tipo: "acordo", autor: "Letícia", texto: "Parcela vencida sem pagamento. Acordo quebrado; aviso ao devedor.", data: "2026-10-12T12:00:00Z" }),
  ev({ caso_id: "f", tipo: "sistema", autor: "sistema", texto: "Caso criado." }),
];
const cobrancas: Cobranca[] = [
  { id: "x", caso_id: "e", asaas_id: "pay_1", tipo: "parcela", parcela_n: 1, parcelas: 3, valor: 400, vencimento: "2026-10-05", status: "RECEIVED", invoice_url: null, boleto_url: null, pix_copia: null, valor_pago: 400, pago_em: "2026-10-05T09:00:00Z", criado_por: "Ana Paula", criado_em: "", atualizado_em: "" },
  { id: "y", caso_id: "e", asaas_id: "pay_2", tipo: "parcela", parcela_n: 2, parcelas: 3, valor: 400, vencimento: "2026-11-05", status: "PENDING", invoice_url: null, boleto_url: null, pix_copia: null, valor_pago: null, pago_em: null, criado_por: "Ana Paula", criado_em: "", atualizado_em: "" },
];

describe("painel", () => {
  it("lista os últimos meses em ordem", () => {
    expect(ultimosMeses(HOJE, 3)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(ultimosMeses("2026-01-10", 2)).toEqual(["2025-12", "2026-01"]);
  });
  it("recuperado por mês soma casos pagos e Asaas separadamente", () => {
    const m = recuperadoPorMes(casos, cobrancas, HOJE, 2);
    expect(m.map((x) => x.mes)).toEqual(["2026-09", "2026-10"]);
    expect(m[0]).toMatchObject({ casos: 1, valor: 500, asaas: 0 });
    expect(m[1]).toMatchObject({ casos: 1, valor: 1200, asaas: 400, novos: 2, devolvidos: 1 });
  });
  it("por cliente: saldo, recuperado e taxa de recuperação", () => {
    const l = porCliente(casos, HOJE);
    const wrj = l.find((x) => x.cliente_id === "wrj")!;
    expect(wrj.abertos).toBe(1);
    expect(wrj.recuperadoMes).toBe(1200);
    expect(wrj.recuperado12m).toBe(1700);
    expect(wrj.encerrados12m).toBe(3);
    expect(wrj.taxaRecuperacao).toBeCloseTo(2 / 3);
    expect(wrj.parados).toBe(1);
    expect(l.find((x) => x.cliente_id === "lobe")!.taxaRecuperacao).toBeNull();
  });
  it("taxa de acordo ignora acordos quebrados como fechamento", () => {
    const t = taxaAcordo(casos, eventos);
    expect(t.comAcordo).toBe(2); // a e e
    expect(t.trabalhados).toBe(3); // a, d, e
    expect(t.quebrados).toBe(1);
    expect(t.taxa).toBeCloseTo(2 / 3);
  });
  it("tempo até o pagamento usa entrada → encerramento", () => {
    expect(tempoAtePagamento(casos, HOJE)).toEqual({ n: 2, media: 40, mediana: 40 }); // 30 e 50 dias
  });
  it("carteira parada: só abertos sem movimento há mais de 60 dias", () => {
    const p = carteiraParada(casos, HOJE);
    expect(p.map((c) => c.id)).toEqual(["d"]);
    expect(p[0].paradoHa).toBe(108);
  });
  it("produtividade por pessoa", () => {
    const p = produtividade(casos, eventos, HOJE);
    const ana = p.find((x) => x.nome === "Ana Paula")!;
    expect(ana).toMatchObject({ casos: 2, atrasados: 1, contatos30: 1, acordos30: 1, movimentos30: 2, pagosMes: 1, recuperadoMes: 1200 });
    const le = p.find((x) => x.nome === "Letícia")!;
    expect(le).toMatchObject({ casos: 1, atrasados: 0, acordos30: 1, movimentos30: 2 });
    expect(p.find((x) => x.nome === "sistema")).toBeUndefined();
  });
});

describe("relatório mensal", () => {
  it("fim do mês e meses disponíveis", () => {
    expect(fimDoMes("2026-02")).toBe("2026-02-28");
    expect(fimDoMes("2028-02")).toBe("2028-02-29");
    expect(mesesDisponiveis(casos, HOJE)).toEqual(["2026-10", "2026-09", "2026-08"]);
  });
  it("monta números do mês", () => {
    const d = montaRelatorio("2026-10", casos, eventos, cobrancas, HOJE);
    expect(d.inicio).toBe("2026-10-01");
    expect(d.fim).toBe(HOJE);
    expect(d.recuperado).toEqual({ casos: 1, valor: 1200, asaas: 400, asaasQtd: 1 });
    expect(d.carteira.abertos).toBe(3); // d, e, f
    expect(d.novos.casos).toBe(2);
    expect(d.acordos).toEqual({ fechados: 2, quebrados: 1, emPagamento: 1 });
    expect(d.devolvidos).toBe(1);
    expect(d.pagos.map((c) => c.id)).toEqual(["a"]);
    expect(d.movimentos.every((e) => e.visivel_cliente)).toBe(true);
    expect(d.tempoMedioPagamento).toBe(30);
  });
  it("mês passado: casos encerrados depois contam como abertos na época", () => {
    const d = montaRelatorio("2026-09", casos, eventos, cobrancas, HOJE);
    expect(d.fim).toBe("2026-09-30");
    expect(d.pagos.map((c) => c.id)).toEqual(["b"]);
    // a (pago em out), c (devolvido em out) e d estavam abertos em 30/09; e e f entraram em outubro
    expect(d.carteira.abertos).toBe(3);
  });
});
