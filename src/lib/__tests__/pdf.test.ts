import { describe, expect, it } from "vitest";
import { Pdf, encurta, larguraTexto, paraWinAnsi, quebraLinhas } from "../pdf";

describe("pdf mínimo", () => {
  it("codifica acentos e símbolos em WinAnsi", () => {
    expect(paraWinAnsi("ção")).toEqual([0xe7, 0xe3, 0x6f]);
    expect(paraWinAnsi("R$ 1.200,00 · —")).toContain(0x97);
    expect(paraWinAnsi("日本")).toEqual([63, 63]);
    expect(paraWinAnsi("a b")).toEqual([97, 32, 98]);
  });
  it("mede e quebra texto", () => {
    expect(larguraTexto("iiii", 10)).toBeLessThan(larguraTexto("MMMM", 10));
    expect(larguraTexto("abc", 10, "F2")).toBeGreaterThan(larguraTexto("abc", 10, "F1"));
    const linhas = quebraLinhas("um texto razoavelmente longo para caber em poucas linhas", 100, 10);
    expect(linhas.length).toBeGreaterThan(1);
    expect(linhas.every((l) => larguraTexto(l, 10) <= 100)).toBe(true);
    expect(encurta("Nome muito comprido do devedor", 60, 10)).toMatch(/…$/);
  });
  it("gera um PDF válido com várias páginas", () => {
    const pdf = new Pdf({ titulo: "Teste (1) \\ ok" });
    pdf.texto(40, 40, "Olá, relatório — página 1", { fonte: "F2" });
    pdf.retangulo(40, 60, 100, 20, { preenche: [247, 243, 236], borda: [0, 0, 0] });
    pdf.linha(40, 90, 200, 90);
    pdf.novaPagina();
    pdf.texto(40, 40, "página 2");
    pdf.emPagina(1, () => pdf.texto(40, 800, "rodapé 1 de 2"));
    const bytes = pdf.bytes();
    const s = bytes.toString("latin1");
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s).toContain("/Count 2");
    expect(s).toContain("/Title (Teste \\(1\\) \\\\ ok)");
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    const startxref = Number(s.match(/startxref\n(\d+)/)![1]);
    expect(s.slice(startxref, startxref + 4)).toBe("xref");
    const offsets = [...s.matchAll(/^(\d{10}) 00000 n /gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(s.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });
});
