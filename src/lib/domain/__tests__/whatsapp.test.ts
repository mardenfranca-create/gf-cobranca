import { describe, expect, it } from "vitest";
import { diffDias } from "../datas";
import { lembreteDeHoje, normalizaCelular, pediuSair, renderiza, TEMPLATES } from "../whatsapp";

describe("telefone", () => {
  it("normaliza formatos brasileiros para E.164 sem +", () => {
    expect(normalizaCelular("(62) 99999-8888")).toBe("5562999998888");
    expect(normalizaCelular("+55 62 99999-8888")).toBe("5562999998888");
    expect(normalizaCelular("062999998888")).toBe("5562999998888");
    expect(normalizaCelular("62 9999-8888")).toBe("5562999998888"); // sem o nono dígito
  });
  it("rejeita fixo, vazio e lixo", () => {
    expect(normalizaCelular("62 3222-1111")).toBeNull();
    expect(normalizaCelular("")).toBeNull();
    expect(normalizaCelular("sem telefone")).toBeNull();
  });
});

describe("modelos", () => {
  it("renderiza na ordem dos parâmetros", () => {
    const t = renderiza(TEMPLATES.gf_boleto, { devedor: "Maria da Silva", credor: "Colégio WRJ", valor: 1250.5, referencia: "Mensalidade mar/2026", data: "2026-10-20", link: "https://x/y" });
    expect(t.replace(/\u00a0/g, " ")).toContain("Olá, Maria. Segue a cobrança de R$ 1.250,50 referente a Mensalidade mar/2026 (Colégio WRJ), com vencimento em 20/10/2026");
    expect(t).toContain("https://x/y");
    expect(t).not.toContain("{{");
  });
  it("todo modelo tem parâmetros sequenciais e sem buraco", () => {
    for (const t of Object.values(TEMPLATES)) {
      const ns = [...t.corpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      expect(ns).toEqual([...Array(ns.length)].map((_, i) => i + 1));
      expect(t.params({ devedor: "A B", credor: "C", valor: 1, referencia: "r", data: "2026-01-01", link: "l" })).toHaveLength(ns.length);
    }
  });
  it("reconhece SAIR", () => {
    expect(pediuSair("SAIR")).toBe(true);
    expect(pediuSair(" parar. ")).toBe(true);
    expect(pediuSair("quero sair do acordo")).toBe(false);
  });
});

describe("régua automática", () => {
  const dias = { notif1: 1, recontato: 5 };
  const base = { id: "c1", fase: "regua", exc_tipo: null, wa_optout: false, telefone: "62999998888", entrada_em: "2026-10-01", ultima_mov_em: "2026-10-01" };
  it("D+1 manda o 1º lembrete, D+6 o 2º, depois nada", () => {
    expect(lembreteDeHoje(base, new Set(), "2026-10-01", dias, diffDias)).toBeNull();
    expect(lembreteDeHoje(base, new Set(), "2026-10-02", dias, diffDias)).toBe("gf_lembrete_1");
    expect(lembreteDeHoje(base, new Set(["gf_lembrete_1"]), "2026-10-06", dias, diffDias)).toBeNull();
    expect(lembreteDeHoje(base, new Set(["gf_lembrete_1"]), "2026-10-07", dias, diffDias)).toBe("gf_lembrete_2");
    expect(lembreteDeHoje(base, new Set(["gf_lembrete_1", "gf_lembrete_2"]), "2026-10-20", dias, diffDias)).toBeNull();
  });
  it("atraso não duplica: caso velho sem nada enviado recebe só o 1º hoje", () => {
    expect(lembreteDeHoje(base, new Set(), "2026-10-30", dias, diffDias)).toBe("gf_lembrete_1");
  });
  it("não manda com opt-out, exceção, sem celular ou fora da fase regua", () => {
    expect(lembreteDeHoje({ ...base, wa_optout: true }, new Set(), "2026-10-02", dias, diffDias)).toBeNull();
    expect(lembreteDeHoje({ ...base, exc_tipo: "aguardando" }, new Set(), "2026-10-02", dias, diffDias)).toBeNull();
    expect(lembreteDeHoje({ ...base, telefone: null }, new Set(), "2026-10-02", dias, diffDias)).toBeNull();
    expect(lembreteDeHoje({ ...base, fase: "neg" }, new Set(), "2026-10-02", dias, diffDias)).toBeNull();
  });
});
