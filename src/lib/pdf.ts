/**
 * Gerador de PDF mínimo, sem dependências: texto (Helvetica/Times, WinAnsi), linhas, retângulos, várias páginas.
 * Suficiente para relatórios tabulares com timbrado. Medidas em pontos (1/72 pol.); origem no canto superior esquerdo.
 */

export type Fonte = "F1" | "F2" | "F3" | "F4"; // Helvetica, Helvetica-Bold, Helvetica-Oblique, Times-Bold
export type RGB = [number, number, number];

const FONTES: Record<Fonte, string> = { F1: "Helvetica", F2: "Helvetica-Bold", F3: "Helvetica-Oblique", F4: "Times-Bold" };

// Larguras AFM (por 1000) dos caracteres 32..126.
const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const W_TIMESB = [250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520];

// Caracteres fora do Latin-1 que o WinAnsi representa.
const WINANSI: Record<string, number> = { "€": 0x80, "…": 0x85, "†": 0x86, "•": 0x95, "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "™": 0x99, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "š": 0x9a, "Œ": 0x8c, "œ": 0x9c, "Ž": 0x8e, "ž": 0x9e, "Ÿ": 0x9f, "ƒ": 0x83, "‚": 0x82, "„": 0x84, "‹": 0x8b, "›": 0x9b, "˜": 0x98 };

/** Converte texto em bytes WinAnsi; o que não existe vira "?". Espaço inseparável vira espaço. */
export function paraWinAnsi(s: string): number[] {
  const out: number[] = [];
  for (const ch of s.normalize("NFC")) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0xa0) out.push(32);
    else if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) out.push(cp);
    else if (WINANSI[ch] != null) out.push(WINANSI[ch]);
    else out.push(63);
  }
  return out;
}

function larguraChar(byte: number, fonte: Fonte): number {
  const tabela = fonte === "F2" ? W_BOLD : fonte === "F4" ? W_TIMESB : W_REG;
  if (byte >= 32 && byte <= 126) return tabela[byte - 32];
  if (byte >= 0xc0) {
    // acentuados: largura da letra-base
    const base = "AAAAAAACEEEEIIIIDNOOOOO×OUUUUYÞßaaaaaaaceeeeiiiidnooooo÷ouuuuyþy"[byte - 0xc0];
    const b = base.charCodeAt(0);
    return b >= 32 && b <= 126 ? tabela[b - 32] : 556;
  }
  if (byte === 0x97) return 1000; // —
  if (byte === 0x96) return 556; // –
  if (byte === 0xb7 || byte === 0x95) return 278; // · •
  return 556;
}

export function larguraTexto(s: string, tamanho: number, fonte: Fonte = "F1"): number {
  return (paraWinAnsi(s).reduce((w, b) => w + larguraChar(b, fonte), 0) * tamanho) / 1000;
}

/** Quebra o texto em linhas que caibam na largura. */
export function quebraLinhas(s: string, largura: number, tamanho: number, fonte: Fonte = "F1"): string[] {
  const linhas: string[] = [];
  for (const paragrafo of s.split("\n")) {
    const palavras = paragrafo.split(/\s+/).filter(Boolean);
    let atual = "";
    for (const p of palavras) {
      const tent = atual ? `${atual} ${p}` : p;
      if (larguraTexto(tent, tamanho, fonte) <= largura || !atual) atual = tent;
      else { linhas.push(atual); atual = p; }
    }
    linhas.push(atual);
  }
  return linhas;
}

/** Encurta com "…" até caber. */
export function encurta(s: string, largura: number, tamanho: number, fonte: Fonte = "F1"): string {
  if (larguraTexto(s, tamanho, fonte) <= largura) return s;
  let t = s;
  while (t.length > 1 && larguraTexto(t + "…", tamanho, fonte) > largura) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();
const cor = (c: RGB) => `${num(c[0] / 255)} ${num(c[1] / 255)} ${num(c[2] / 255)}`;

function escapaBytes(bytes: number[]): string {
  let s = "";
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += "\\" + String.fromCharCode(b);
    else if (b < 32 || b > 126) s += "\\" + b.toString(8).padStart(3, "0");
    else s += String.fromCharCode(b);
  }
  return s;
}

export class Pdf {
  readonly largura: number;
  readonly altura: number;
  private paginas: string[][] = [];
  private atual: string[] = [];
  readonly titulo: string;

  constructor(opts: { titulo: string; largura?: number; altura?: number }) {
    this.titulo = opts.titulo;
    this.largura = opts.largura ?? 595.28; // A4
    this.altura = opts.altura ?? 841.89;
    this.novaPagina();
  }

  get numeroPagina() { return this.paginas.length; }

  novaPagina() {
    this.atual = [];
    this.paginas.push(this.atual);
  }

  /** Desenha em uma página já criada (para rodapé com "página X de Y" após saber o total). */
  emPagina(n: number, fn: () => void) {
    const guard = this.atual;
    this.atual = this.paginas[n - 1];
    fn();
    this.atual = guard;
  }

  texto(x: number, y: number, s: string, o: { tamanho?: number; fonte?: Fonte; cor?: RGB; alinhar?: "esq" | "dir" | "centro"; maxLargura?: number } = {}) {
    const tamanho = o.tamanho ?? 10;
    const fonte = o.fonte ?? "F1";
    let t = s;
    if (o.maxLargura) t = encurta(t, o.maxLargura, tamanho, fonte);
    const w = larguraTexto(t, tamanho, fonte);
    const px = o.alinhar === "dir" ? x - w : o.alinhar === "centro" ? x - w / 2 : x;
    this.atual.push(`BT /${fonte} ${num(tamanho)} Tf ${cor(o.cor ?? [10, 10, 10])} rg ${num(px)} ${num(this.altura - y)} Td (${escapaBytes(paraWinAnsi(t))}) Tj ET`);
    return w;
  }

  /** Parágrafo com quebra automática; devolve a altura usada. */
  paragrafo(x: number, y: number, s: string, largura: number, o: { tamanho?: number; fonte?: Fonte; cor?: RGB; entrelinha?: number } = {}): number {
    const tamanho = o.tamanho ?? 10;
    const el = o.entrelinha ?? tamanho * 1.4;
    const linhas = quebraLinhas(s, largura, tamanho, o.fonte ?? "F1");
    linhas.forEach((l, i) => this.texto(x, y + i * el, l, o));
    return linhas.length * el;
  }

  linha(x1: number, y1: number, x2: number, y2: number, o: { cor?: RGB; espessura?: number } = {}) {
    this.atual.push(`${cor(o.cor ?? [10, 10, 10])} RG ${num(o.espessura ?? 0.5)} w ${num(x1)} ${num(this.altura - y1)} m ${num(x2)} ${num(this.altura - y2)} l S`);
  }

  retangulo(x: number, y: number, w: number, h: number, o: { preenche?: RGB; borda?: RGB; espessura?: number } = {}) {
    const ops: string[] = [];
    if (o.preenche) ops.push(`${cor(o.preenche)} rg`);
    if (o.borda) ops.push(`${cor(o.borda)} RG ${num(o.espessura ?? 0.5)} w`);
    const op = o.preenche && o.borda ? "B" : o.preenche ? "f" : "S";
    this.atual.push(`${ops.join(" ")} ${num(x)} ${num(this.altura - y - h)} ${num(w)} ${num(h)} re ${op}`);
  }

  /** Serializa o documento. */
  bytes(): Buffer {
    const objetos: Buffer[] = [];
    const add = (s: string | Buffer) => { objetos.push(typeof s === "string" ? Buffer.from(s, "latin1") : s); return objetos.length; };
    // 1 catálogo, 2 páginas (preenchido depois), 3..6 fontes, 7 info
    add(""); add("");
    const fontIds = (Object.keys(FONTES) as Fonte[]).map((f) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONTES[f]} /Encoding /WinAnsiEncoding >>`));
    const data = new Date();
    const d = `D:${data.toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z`;
    const info = add(`<< /Title (${escapaBytes(paraWinAnsi(this.titulo))}) /Producer (gf-cobranca) /Creator (Gontijo Freitas) /CreationDate (${d}) >>`);
    const recursos = `<< /Font << ${(Object.keys(FONTES) as Fonte[]).map((f, i) => `/${f} ${fontIds[i]} 0 R`).join(" ")} >> >>`;
    const pageIds: number[] = [];
    for (const ops of this.paginas) {
      const conteudo = Buffer.from(ops.join("\n"), "latin1");
      const streamId = add(Buffer.concat([Buffer.from(`<< /Length ${conteudo.length} >>\nstream\n`, "latin1"), conteudo, Buffer.from("\nendstream", "latin1")]));
      pageIds.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.largura)} ${num(this.altura)}] /Resources ${recursos} /Contents ${streamId} 0 R >>`));
    }
    objetos[0] = Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "latin1");
    objetos[1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>`, "latin1");

    const partes: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    const offsets: number[] = [];
    let pos = partes[0].length;
    objetos.forEach((obj, i) => {
      offsets.push(pos);
      const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), obj, Buffer.from("\nendobj\n", "latin1")]);
      partes.push(b);
      pos += b.length;
    });
    const xref = [`xref`, `0 ${objetos.length + 1}`, `0000000000 65535 f `, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n `)].join("\n");
    partes.push(Buffer.from(`${xref}\ntrailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`, "latin1"));
    return Buffer.concat(partes);
  }
}
