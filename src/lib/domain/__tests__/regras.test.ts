import { describe, expect, it } from "vitest";
import { derivaProxima, mapaRegua } from "../regua";
import { montaFila } from "../fila";
import { normalizaPlanilha, reconcilia } from "../reconcile";
import { confereAlcada } from "../alcada";
import { addDias, diffDias, parseDataBR } from "../datas";
import type { Caso, Cliente, ReguaItem } from "../types";

const HOJE = "2026-10-06";
const REGUA: ReguaItem[] = [
  { chave: "notif1", rotulo: "", dias: 1, nota: "Enviar primeira notificação", ordem: 1 },
  { chave: "cobranca", rotulo: "", dias: 11, nota: "Fim da régua: contato humano", ordem: 2 },
  { chave: "recontato", rotulo: "", dias: 5, nota: "Recontatar o devedor", ordem: 3 },
  { chave: "notifExtra", rotulo: "", dias: 15, nota: "Fim do prazo da notificação extrajudicial", ordem: 4 },
  { chave: "acordoConf", rotulo: "", dias: 30, nota: "Conferir parcela do acordo", ordem: 5 },
  { chave: "quebra", rotulo: "", dias: 2, nota: "Renegociar ou protestar", ordem: 6 },
  { chave: "analise", rotulo: "", dias: 15, nota: "Decidir", ordem: 7 },
  { chave: "protesto", rotulo: "", dias: 10, nota: "Fim do prazo do protesto", ordem: 8 },
  { chave: "judicial", rotulo: "", dias: 90, nota: "Conferir Astrea", ordem: 9 },
  { chave: "excecao", rotulo: "", dias: 30, nota: "Revisar exceção", ordem: 10 },
];
const R = mapaRegua(REGUA);
const WRJ: Cliente = { id: "wrj", nome: "Colégio WRJ", nome_curto: "WRJ", tipo: "escola", limites: { desc: 20, parc: 10, ent: 10, min: 250 }, honorarios: { extra: 20, jud: 25 }, protesto_dias: 45, contato: null, ativo: true };

function caso(over: Partial<Caso> = {}): Caso {
  return {
    id: over.id ?? "c1", cliente_id: "wrj", devedor: "Fulano", documento: "123.456.789-09", documento_digits: "12345678909", referencia: "Mensalidades", detalhe: null,
    valor_original: 1000, valor_atualizado: 1000, valor_fonte: "planilha", fase: "neg", fase_nota: "Cobrança inicial", responsavel: "Ana Paula",
    proxima_data: "2026-10-10", proxima_tipo: "recontatar", proxima_nota: "Recontatar", proxima_auto: true,
    exc_tipo: null, exc_motivo: null, exc_desde: null, exc_revisao: null, telefone: null, email: null, processo: null, acordo: null, origem: null, asaas_customer_id: null,
    pendencias: [], entrada_em: "2026-09-01", ultima_mov_em: "2026-10-01T12:00:00Z", encerrado_em: null, ...over,
  };
}

describe("datas", () => {
  it("soma e subtrai dias sem fuso", () => {
    expect(addDias("2026-10-06", 5)).toBe("2026-10-11");
    expect(addDias("2026-01-31", 1)).toBe("2026-02-01");
    expect(diffDias("2026-10-06", "2026-10-01")).toBe(5);
    expect(parseDataBR("31/02/2026")).toBeNull();
    expect(parseDataBR("10/07/2026")).toBe("2026-07-10");
  });
});

describe("régua: próxima ação derivada da fase", () => {
  it("negociação recontata em N dias da última movimentação", () => {
    const p = derivaProxima(caso(), R, HOJE)!;
    expect(p).toMatchObject({ data: "2026-10-06", tipo: "recontatar", auto: true });
  });
  it("notificado extrajudicialmente usa o prazo da notificação", () => {
    const p = derivaProxima(caso({ fase_nota: "Notificado extrajudicialmente" }), R, HOJE)!;
    expect(p.data).toBe("2026-10-16");
    expect(p.tipo).toBe("notif");
  });
  it("exceção vira revisão na data marcada e não dispara cobrança", () => {
    const p = derivaProxima(caso({ exc_tipo: "nao_cobrar", exc_desde: HOJE, exc_revisao: "2026-11-05" }), R, HOJE)!;
    expect(p).toMatchObject({ data: "2026-11-05", tipo: "decidir" });
    expect(p.nota).toMatch(/Revisar exceção/);
  });
  it("caso encerrado não tem próxima ação", () => {
    expect(derivaProxima(caso({ fase: "pago" }), R, HOJE)).toBeNull();
  });
  it("mudar a régua muda a data", () => {
    const r2 = mapaRegua(REGUA.map((r) => (r.chave === "recontato" ? { ...r, dias: 2 } : r)));
    expect(derivaProxima(caso(), r2, HOJE)!.data).toBe("2026-10-03");
  });
});

describe("fila: próxima ação obrigatória", () => {
  const clientes = { wrj: WRJ };
  it("caso aberto sem data entra como prioridade alta em 'completar'", () => {
    const t = montaFila([caso({ proxima_data: null, proxima_tipo: null })], clientes, HOJE);
    expect(t[0]).toMatchObject({ p: "alta", g: "completar" });
  });
  it("follow-up atrasado vem primeiro e conta os dias", () => {
    const t = montaFila([caso({ proxima_data: "2026-10-01" }), caso({ id: "c2", proxima_data: "2026-12-01" })], clientes, HOJE);
    expect(t[0].titulo).toMatch(/Atrasado 5 dias/);
    expect(t.find((x) => x.caso.id === "c2")).toBeUndefined();
  });
  it("exceção só aparece na data de revisão", () => {
    const antes = montaFila([caso({ exc_tipo: "aguardando", exc_desde: HOJE, exc_revisao: "2026-11-05", proxima_data: "2026-11-05", proxima_tipo: "decidir" })], clientes, HOJE);
    expect(antes).toHaveLength(0);
    const depois = montaFila([caso({ exc_tipo: "aguardando", exc_desde: "2026-09-01", exc_revisao: "2026-10-01", proxima_data: "2026-10-01", proxima_tipo: "decidir" })], clientes, HOJE);
    expect(depois[0].titulo).toMatch(/Revisar exceção/);
  });
});

describe("planilha: normalização e reconciliação", () => {
  const rows = [
    ["Devedor", "CPF/CNPJ", "Referência", "Valor", "Vencimento", "Telefone", "Cliente", "Situação"],
    ["Novo Devedor", "987.654.321-00", "Mensalidade set/2026", "1.500,00", "10/09/2026", "(62) 99999-0000", "WRJ", ""],
    ["Fulano", "123.456.789-09", "Mensalidade ago/2026", 1200, "10/08/2026", "", "WRJ", ""],
    ["Fulano", "123.456.789-09", "Mensalidades", 1000, "10/07/2026", "", "WRJ", ""],
    ["Pagou", "111.222.333-44", "Mensalidade jul/2026", "900,00", "10/07/2026", "", "WRJ", "pago"],
    ["Com erro", "12", "x", "abc", "99/99/2026", "", "WRJ", ""],
  ];
  it("aceita cabeçalhos parecidos, números do Excel e datas BR", () => {
    const { linhas, faltam } = normalizaPlanilha(rows, HOJE);
    expect(faltam).toEqual([]);
    expect(linhas).toHaveLength(5);
    expect(linhas[0].valor).toBe(1500);
    expect(linhas[1].valor).toBe(1200);
    expect(linhas[1].vencimento).toBe("2026-08-10");
    expect(linhas[4].erros.length).toBeGreaterThan(0);
  });
  it("mesmo devedor com caso aberto consolida; parcela repetida é 'igual'; situação pago vira baixa", () => {
    const { linhas } = normalizaPlanilha(rows, HOJE);
    const aberto = caso();
    const rec = reconcilia(linhas, [aberto], { c1: [{ referencia: "Mensalidades", vencimento: "2026-07-10" }] }, [WRJ], null);
    const kinds = rec.linhas.map((l) => l.kind);
    expect(kinds.slice(0, 4)).toEqual(["novo", "consolida", "igual", "baixa"]);
    expect(rec.resumo).toMatchObject({ novos: 1, consolidados: 1, iguais: 1, baixas: 1, erros: 1 });
  });
  it("caso aberto ausente da planilha é apontado, nunca apagado", () => {
    const { linhas } = normalizaPlanilha(rows, HOJE);
    const ausente = caso({ id: "c9", documento: "555.666.777-88", documento_digits: "55566677788" });
    const rec = reconcilia(linhas, [caso(), ausente], {}, [WRJ], null);
    expect(rec.ausentes.map((c) => c.id)).toEqual(["c9"]);
  });
  it("cliente fixo no topo dispensa a coluna cliente", () => {
    const { linhas } = normalizaPlanilha([rows[0].slice(0, 6), rows[1].slice(0, 6)], HOJE);
    const rec = reconcilia(linhas, [], {}, [WRJ], "wrj");
    expect(rec.linhas[0].cliente_id).toBe("wrj");
    expect(rec.linhas[0].erros).toEqual([]);
  });
});

describe("alçada", () => {
  it("fora da alçada lista os motivos", () => {
    const r = confereAlcada({ desconto_pct: 30, parcelas: 12, entrada_pct: 5, total: 1000 }, WRJ.limites);
    expect(r.fora).toBe(true);
    expect(r.motivos).toHaveLength(4);
  });
  it("dentro da alçada fecha sem o cliente", () => {
    expect(confereAlcada({ desconto_pct: 10, parcelas: 4, entrada_pct: 20, total: 2000 }, WRJ.limites).fora).toBe(false);
  });
});
