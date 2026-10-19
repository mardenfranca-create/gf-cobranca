import { describe, expect, it } from "vitest";
import { aplicaAssinatura, minutaNotificacao, paragrafos } from "../notificacao";
import type { Caso, Cliente, Parcela } from "../types";

const caso = { id: "a", cliente_id: "wrj", devedor: "Maria Silva", documento: "123.456.789-00", documento_digits: "12345678900", referencia: "Mensalidades mar a jun/2026", detalhe: "Ana, 5º ano", valor_original: 4000, valor_atualizado: 4320.5, valor_fonte: null, fase: "neg", fase_nota: null, responsavel: "Ana Paula", proxima_data: "2026-10-20", proxima_tipo: "recontatar", proxima_nota: "x", proxima_auto: true, exc_tipo: null, exc_motivo: null, exc_desde: null, exc_revisao: null, telefone: "62999990001", email: null, processo: null, acordo: null, origem: null, asaas_customer_id: null, wa_optout: false, pendencias: [], entrada_em: "2026-08-01", ultima_mov_em: "2026-10-10T12:00:00Z", encerrado_em: null } as Caso;
const cliente = { id: "wrj", nome: "Colégio WRJ Ltda.", nome_curto: "WRJ", tipo: "escola", limites: { desc: 20, parc: 10, ent: 10, min: 250 }, honorarios: { extra: 20, jud: 25 }, protesto_dias: 45, contato: null, ativo: true } as Cliente;
const parcelas = [{ id: "p1", caso_id: "a", referencia: "Mensalidade mar/2026", competencia: "2026-03", valor: 1000, vencimento: "2026-03-10", paga: false }, { id: "p2", caso_id: "a", referencia: "Mensalidade abr/2026", competencia: "2026-04", valor: 1000, vencimento: "2026-04-10", paga: true }] as Parcela[];

describe("notificação extrajudicial", () => {
  it("gera minuta com dados do caso, só parcelas em aberto e prazo por extenso", () => {
    const m = minutaNotificacao({ caso, cliente, parcelas, prazoDias: 10, hoje: "2026-10-19" });
    expect(m.titulo).toBe("Notificação extrajudicial · Maria Silva · WRJ");
    expect(m.corpo).toContain("Goiânia/GO, 19 de outubro de 2026.");
    expect(m.corpo).toContain("o(a) Sr.(a) Maria Silva, CPF 123.456.789-00");
    expect(m.corpo).toContain("R$ 4.320,50".replace(" ", " ").replace(" ", m.corpo.includes("R$ 4.320,50") ? " " : " "));
    expect(m.corpo).toContain("Mensalidade mar/2026");
    expect(m.corpo).not.toContain("Mensalidade abr/2026");
    expect(m.corpo).toContain("10 (dez) dias corridos");
    expect(m.corpo).toContain("[ADVOGADO(A)]");
    expect(paragrafos(m.corpo).length).toBeGreaterThan(8);
  });
  it("pessoa jurídica recebe tratamento no plural", () => {
    const m = minutaNotificacao({ caso: { ...caso, devedor: "Mundial Ltda", documento: "12.345.678/0001-90" }, cliente, parcelas: [], prazoDias: 5, hoje: "2026-10-19" });
    expect(m.corpo).toContain("A Mundial Ltda, CNPJ 12.345.678/0001-90.");
    expect(m.corpo).toContain("NOTIFICAR V.Sas.");
    expect(m.corpo).toContain("5 (cinco) dias");
  });
  it("aplica assinatura", () => {
    const c = aplicaAssinatura("x\n\n[ADVOGADO(A)]\nOAB/[UF] [número]", "Letícia Silveira", "GO 12345");
    expect(c).toContain("Letícia Silveira\nOAB GO 12345");
    expect(aplicaAssinatura("OAB/[UF] [número]", null, "OAB/GO 99")).toBe("OAB/GO 99");
  });
});
