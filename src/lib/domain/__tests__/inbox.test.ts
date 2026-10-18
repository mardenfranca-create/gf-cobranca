import { describe, expect, it } from "vitest";
import { agrupaConversas, filtraConversas, fmtTelefone, type CasoResumo } from "../inbox";
import type { Mensagem } from "../types";

const m = (p: Partial<Mensagem>): Mensagem => ({ id: Math.random().toString(36).slice(2), caso_id: "a", direcao: "saida", canal: "whatsapp", telefone: "5562999990001", template: null, texto: "oi", wa_id: null, status: "sent", erro: null, origem: "manual", criado_por: "Ana", criado_em: "2026-10-17T10:00:00Z", atualizado_em: "", lida_em: null, lida_por: null, ...p });
const casos: Record<string, CasoResumo> = {
  a: { id: "a", devedor: "Maria Silva", cliente_id: "wrj", responsavel: "Ana Paula", fase: "neg", wa_optout: false, telefone: "62999990001" },
  b: { id: "b", devedor: "João Souza", cliente_id: "lobe", responsavel: "Letícia", fase: "regua", wa_optout: false, telefone: "62999990002" },
};
const AGORA = new Date("2026-10-17T12:00:00Z");

describe("caixa de entrada", () => {
  it("agrupa por telefone, conta não lidas e detecta quem espera resposta", () => {
    const lista = agrupaConversas([
      m({ telefone: "5562999990001", criado_em: "2026-10-17T09:00:00Z" }),
      m({ telefone: "5562999990001", direcao: "entrada", status: "received", texto: "posso pagar sexta", criado_em: "2026-10-17T11:00:00Z" }),
      m({ telefone: "5562999990002", caso_id: "b", criado_em: "2026-10-17T11:30:00Z" }),
      m({ telefone: "5562999990003", caso_id: null, direcao: "entrada", status: "received", texto: "quem é?", criado_em: "2026-10-16T11:00:00Z", lida_em: "2026-10-16T12:00:00Z" }),
    ], casos, AGORA);
    expect(lista.map((c) => c.telefone)).toEqual(["5562999990001", "5562999990003", "5562999990002"]);
    const maria = lista[0];
    expect(maria.caso?.devedor).toBe("Maria Silva");
    expect(maria.naoLidas).toBe(1);
    expect(maria.aguardando).toBe(true);
    expect(maria.janelaAte).toBe("2026-10-18T11:00:00.000Z");
    expect(maria.ultima.texto).toBe("posso pagar sexta");
    const semCaso = lista[1];
    expect(semCaso.caso).toBeNull();
    expect(semCaso.naoLidas).toBe(0);
    expect(semCaso.janelaAte).toBeNull(); // mais de 24h
    expect(lista[2].aguardando).toBe(false);
  });
  it("filtra por situação e busca por nome, texto ou dígitos", () => {
    const lista = agrupaConversas([
      m({ telefone: "5562999990001", direcao: "entrada", status: "received", texto: "posso pagar sexta", criado_em: "2026-10-17T11:00:00Z" }),
      m({ telefone: "5562999990002", caso_id: "b" }),
      m({ telefone: "5562999990003", caso_id: null, direcao: "entrada", status: "received" }),
    ], casos, AGORA);
    expect(filtraConversas(lista, "aguardando", "").map((c) => c.telefone)).toEqual(["5562999990001", "5562999990003"]);
    expect(filtraConversas(lista, "sem_caso", "").map((c) => c.telefone)).toEqual(["5562999990003"]);
    expect(filtraConversas(lista, "todas", "joão").map((c) => c.telefone)).toEqual(["5562999990002"]);
    expect(filtraConversas(lista, "todas", "sexta").length).toBe(1);
    expect(filtraConversas(lista, "todas", "0003").map((c) => c.telefone)).toEqual(["5562999990003"]);
  });
  it("junta na mesma conversa o número com e sem o nono dígito", () => {
    const lista = agrupaConversas([
      m({ telefone: "5562984077891", criado_em: "2026-10-17T09:00:00Z" }),
      m({ telefone: "556284077891", direcao: "entrada", status: "received", texto: "oi", criado_em: "2026-10-17T11:00:00Z" }),
    ], casos, AGORA);
    expect(lista).toHaveLength(1);
    expect(lista[0].telefone).toBe("5562984077891");
    expect(lista[0].total).toBe(2);
    expect(lista[0].aguardando).toBe(true);
  });
  it("formata telefone", () => {
    expect(fmtTelefone("5562999990001")).toBe("(62) 99999-0001");
    expect(fmtTelefone("556233330001")).toBe("(62) 3333-0001");
    expect(fmtTelefone("12345")).toBe("12345");
  });
});
