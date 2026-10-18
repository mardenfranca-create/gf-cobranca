import { describe, expect, it } from "vitest";
import { agrupaConversas, formataCelular, restanteJanela, resumo } from "../conversas";
import type { Mensagem } from "../types";

const base: Mensagem = { id: "", caso_id: "", direcao: "saida", canal: "whatsapp", telefone: "5562999998888", template: "gf_lembrete_1", texto: "Olá", wa_id: null, status: "sent", erro: null, origem: "manual", criado_por: "Ana", criado_em: "", atualizado_em: "" };
const m = (p: Partial<Mensagem>): Mensagem => ({ ...base, ...p, atualizado_em: p.criado_em ?? "" });
const agora = new Date("2026-10-17T12:00:00Z");

describe("agrupaConversas", () => {
  it("agrupa por caso, mais recente primeiro, e detecta quem aguarda resposta", () => {
    const cs = agrupaConversas([
      m({ id: "1", caso_id: "A", criado_em: "2026-10-17T10:00:00Z" }),
      m({ id: "2", caso_id: "A", direcao: "entrada", texto: "Oi", status: "received", criado_em: "2026-10-17T11:00:00Z" }),
      m({ id: "3", caso_id: "B", criado_em: "2026-10-17T11:30:00Z" }),
    ], agora);
    expect(cs.map((c) => c.caso_id)).toEqual(["A", "B"]);
    expect(cs[0].aguardando).toBe(true);
    expect(cs[0].ultima.id).toBe("2");
    expect(cs[0].mensagens.map((x) => x.id)).toEqual(["2", "1"]);
    expect(cs[1].aguardando).toBe(false);
  });
  it("janela de 24h conta a partir da última mensagem do devedor e fecha depois", () => {
    const [aberta] = agrupaConversas([m({ id: "1", caso_id: "A", direcao: "entrada", criado_em: "2026-10-16T13:00:00Z" })], agora);
    expect(aberta.janelaAte).toBe("2026-10-17T13:00:00.000Z");
    const [fechada] = agrupaConversas([m({ id: "1", caso_id: "A", direcao: "entrada", criado_em: "2026-10-16T11:00:00Z" })], agora);
    expect(fechada.janelaAte).toBeNull();
    expect(fechada.aguardando).toBe(true); // ainda sem resposta, mesmo com a janela fechada
  });
  it("ordena: aguardando, depois janela aberta já respondida, depois as demais", () => {
    const cs = agrupaConversas([
      m({ id: "1", caso_id: "velha", criado_em: "2026-10-17T11:59:00Z" }),
      m({ id: "2", caso_id: "respondida", direcao: "entrada", criado_em: "2026-10-17T09:00:00Z" }),
      m({ id: "3", caso_id: "respondida", criado_em: "2026-10-17T09:30:00Z" }),
      m({ id: "4", caso_id: "aguarda", direcao: "entrada", criado_em: "2026-10-17T08:00:00Z" }),
    ], agora);
    expect(cs.map((c) => c.caso_id)).toEqual(["aguarda", "respondida", "velha"]);
  });
  it("conta falhas de entrega", () => {
    const [c] = agrupaConversas([m({ id: "1", caso_id: "A", status: "failed", erro: "número inválido", criado_em: "2026-10-17T10:00:00Z" })], agora);
    expect(c.falhas).toBe(1);
  });
});

describe("texto", () => {
  it("resumo encurta e tira quebras de linha", () => {
    expect(resumo("linha 1\n\nlinha 2")).toBe("linha 1 linha 2");
    expect(resumo("a".repeat(200), 20)).toHaveLength(20);
  });
  it("restante da janela em horas ou minutos", () => {
    expect(restanteJanela("2026-10-17T15:00:00Z", agora)).toBe("3h");
    expect(restanteJanela("2026-10-17T12:25:00Z", agora)).toBe("25min");
    expect(restanteJanela("2026-10-17T11:00:00Z", agora)).toBe("0min");
  });
  it("formata celular E.164 do Brasil", () => {
    expect(formataCelular("5562984077891")).toBe("(62) 98407-7891");
    expect(formataCelular("556232221111")).toBe("(62) 3222-1111");
    expect(formataCelular("16315551181")).toBe("16315551181");
  });
});
