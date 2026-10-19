import { describe, expect, it } from "vitest";
import { normalizaNovoCaso, parseValorForm, type CamposNovoCaso } from "../novo-caso";
import { reconcilia } from "../reconcile";
import type { Caso, Cliente } from "../types";

const HOJE = "2026-10-18";
const WRJ: Cliente = { id: "wrj", nome: "Colégio WRJ", nome_curto: "WRJ", tipo: "escola", limites: { desc: 20, parc: 10, ent: 10, min: 250 }, honorarios: { extra: 20, jud: 25 }, protesto_dias: 45, contato: null, ativo: true };

const campos = (over: Partial<CamposNovoCaso> = {}): CamposNovoCaso => ({
  cliente_id: "wrj", devedor: "Maria Souza", documento: "123.456.789-09", referencia: "Mensalidades mar a jun/2026 - João (5º ano)", valor: "2.450,00",
  vencimento: "2026-09-10", telefone: "(62) 98407-7891", email: "", responsavel: "Ana Paula", ...over,
});

function casoAberto(over: Partial<Caso> = {}): Caso {
  return {
    id: "c1", cliente_id: "wrj", devedor: "Maria Souza", documento: "123.456.789-09", documento_digits: "12345678909", referencia: "Mensalidades", detalhe: null,
    valor_original: 1000, valor_atualizado: 1000, valor_fonte: "planilha", fase: "neg", fase_nota: "Cobrança inicial", responsavel: "Ana Paula",
    proxima_data: "2026-10-20", proxima_tipo: "recontatar", proxima_nota: "Recontatar", proxima_auto: true,
    exc_tipo: null, exc_motivo: null, exc_desde: null, exc_revisao: null, telefone: null, email: null, processo: null, acordo: null, origem: null, asaas_customer_id: null, wa_optout: false,
    pendencias: [], entrada_em: "2026-09-01", ultima_mov_em: "2026-10-01T12:00:00Z", encerrado_em: null, ...over,
  };
}

describe("novo caso: valor digitado à mão", () => {
  it("aceita formato brasileiro e ponto decimal", () => {
    expect(parseValorForm("2.450,00")).toBe(2450);
    expect(parseValorForm("2450,5")).toBe(2450.5);
    expect(parseValorForm("2450.50")).toBe(2450.5);
    expect(parseValorForm("R$ 1.200,30")).toBe(1200.3);
    expect(parseValorForm("980")).toBe(980);
  });
  it("rejeita zero, negativo e texto", () => {
    expect(parseValorForm("0")).toBeNull();
    expect(parseValorForm("-10")).toBeNull();
    expect(parseValorForm("abc")).toBeNull();
    expect(parseValorForm("")).toBeNull();
  });
});

describe("novo caso: validação do formulário", () => {
  it("formulário completo passa sem erros nem avisos e normaliza a linha como a planilha", () => {
    const r = normalizaNovoCaso(campos(), HOJE);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.responsavel).toBe("Ana Paula");
    expect(r.celular).toBe("5562984077891");
    expect(r.linha).toMatchObject({ devedor: "Maria Souza", documento_digits: "12345678909", valor: 2450, vencimento: "2026-09-10", cliente: "wrj" });
  });
  it("aceita vencimento em DD/MM/AAAA e em ISO (input type=date)", () => {
    expect(normalizaNovoCaso(campos({ vencimento: "10/09/2026" }), HOJE).linha.vencimento).toBe("2026-09-10");
    expect(normalizaNovoCaso(campos({ vencimento: "2026-09-10" }), HOJE).linha.vencimento).toBe("2026-09-10");
  });
  it("bloqueia valor zerado, data inválida, título não vencido, documento errado e devedor em branco", () => {
    expect(normalizaNovoCaso(campos({ valor: "0" }), HOJE).erros).toContain("valor inválido");
    expect(normalizaNovoCaso(campos({ vencimento: "31/02/2026" }), HOJE).erros).toContain("data fora do formato DD/MM/AAAA");
    expect(normalizaNovoCaso(campos({ vencimento: "2026-12-01" }), HOJE).erros).toContain("título ainda não venceu");
    expect(normalizaNovoCaso(campos({ documento: "123" }), HOJE).erros).toContain("documento deve ter 11 ou 14 dígitos");
    expect(normalizaNovoCaso(campos({ devedor: "  " }), HOJE).erros).toContain("devedor em branco");
  });
  it("exige cliente e responsável da lista; sem responsável usa Ana Paula", () => {
    expect(normalizaNovoCaso(campos({ cliente_id: "" }), HOJE).erros[0]).toBe("escolha o cliente credor");
    expect(normalizaNovoCaso(campos({ responsavel: "Fulano" }), HOJE).erros).toContain("responsável inválido");
    expect(normalizaNovoCaso(campos({ responsavel: "Letícia" }), HOJE).responsavel).toBe("Letícia");
    expect(normalizaNovoCaso(campos({ responsavel: "" }), HOJE).responsavel).toBe("Ana Paula");
  });
  it("celular ausente ou inválido não bloqueia, mas avisa que a régua não envia", () => {
    const sem = normalizaNovoCaso(campos({ telefone: "" }), HOJE);
    expect(sem.erros).toEqual([]);
    expect(sem.celular).toBeNull();
    expect(sem.avisos[0]).toMatch(/Sem celular/);
    const fixo = normalizaNovoCaso(campos({ telefone: "(62) 3234-5678" }), HOJE);
    expect(fixo.erros).toEqual([]);
    expect(fixo.celular).toBeNull();
    expect(fixo.avisos[0]).toMatch(/não é um celular válido/);
    // número sem DDD é erro (mesma regra da planilha), não só aviso
    expect(normalizaNovoCaso(campos({ telefone: "98407-7891" }), HOJE).erros).toContain("telefone sem DDD");
  });
  it("celular antigo sem o nono dígito é completado", () => {
    expect(normalizaNovoCaso(campos({ telefone: "62 8407-7891" }), HOJE).celular).toBe("5562984077891");
  });
});

describe("novo caso: reconciliação com a carteira (mesma regra da planilha)", () => {
  it("devedor sem caso aberto vira caso novo", () => {
    const { linha } = normalizaNovoCaso(campos(), HOJE);
    const rec = reconcilia([linha], [], {}, [WRJ], "wrj");
    expect(rec.linhas[0].kind).toBe("novo");
    expect(rec.linhas[0].caso).toBeNull();
  });
  it("mesmo cliente + documento com caso aberto consolida a parcela no caso existente", () => {
    const { linha } = normalizaNovoCaso(campos(), HOJE);
    const rec = reconcilia([linha], [casoAberto()], { c1: [{ referencia: "Mensalidades", vencimento: "2026-08-10" }] }, [WRJ], "wrj");
    expect(rec.linhas[0].kind).toBe("consolida");
    expect(rec.linhas[0].caso?.id).toBe("c1");
  });
  it("parcela já cadastrada no caso aberto não entra de novo", () => {
    const { linha } = normalizaNovoCaso(campos(), HOJE);
    const rec = reconcilia([linha], [casoAberto()], { c1: [{ referencia: linha.referencia, vencimento: "2026-09-10" }] }, [WRJ], "wrj");
    expect(rec.linhas[0].kind).toBe("igual");
  });
  it("caso do mesmo devedor em outro cliente ou já encerrado não impede caso novo", () => {
    const { linha } = normalizaNovoCaso(campos(), HOJE);
    expect(reconcilia([linha], [casoAberto({ cliente_id: "lobe" })], {}, [WRJ], "wrj").linhas[0].kind).toBe("novo");
    expect(reconcilia([linha], [casoAberto({ fase: "pago", encerrado_em: "2026-10-01T12:00:00Z" })], {}, [WRJ], "wrj").linhas[0].kind).toBe("novo");
  });
});
