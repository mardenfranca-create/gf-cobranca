/** Importação de telefones a partir de exportações de contatos (Digisac, Google Contatos, planilha nome+telefone). Puro. */
import type { Caso, Cliente } from "./types";

export type Contato = { nome: string; telefone: string; atendente: string; departamento: string; arquivo: string; linha: number };

/** CSV simples com aspas e vírgula/ponto e vírgula. */
export function parseCsv(texto: string): string[][] {
  const sep = (texto.split("\n")[0].match(/;/g)?.length ?? 0) > (texto.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let campo = "", atual: string[] = [], aspas = false;
  const t = texto.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { atual.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; atual.push(campo); linhas.push(atual); atual = []; campo = ""; }
    else campo += c;
  }
  if (campo || atual.length) { atual.push(campo); linhas.push(atual); }
  return linhas.filter((l) => l.some((v) => v.trim()));
}

export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Nome comparável: maiúsculas, sem acento, sem pontuação, sem palavras vazias (LTDA, ME, EIRELI...). */
export function normalizaNome(s: string): string {
  return semAcento(s).toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\b(LTDA|ME|EPP|EIRELI|SA|S A|CIA|LTDA ME|SOCIEDADE|EMPRESARIAL|INDIVIDUAL|DE|DA|DO|DAS|DOS|E)\b/g, " ").replace(/\s+/g, " ").trim();
}

/** Telefone em dígitos E.164 sem +. Aceita DDI em coluna separada. */
export function telefoneE164(ddi: string, numero: string): string | null {
  const n = numero.replace(/\D/g, "");
  const d = ddi.replace(/\D/g, "") || "55";
  if (!n) return null;
  if (d !== "55") return `${d}${n}`;
  let local = n.startsWith("55") && n.length >= 12 ? n.slice(2) : n;
  if (local.length === 10 && /^[1-9]{2}[6-9]/.test(local)) local = `${local.slice(0, 2)}9${local.slice(2)}`; // celular sem o 9
  if (local.length < 10 || local.length > 11) return null;
  return `55${local}`;
}

/** Lê uma exportação. Reconhece o formato do Digisac (Nome, DDI, Telefone, Atendente Padrão, Departamento Padrão) e qualquer CSV com colunas nome/telefone. */
export function leContatos(texto: string, arquivo: string): { contatos: Contato[]; erro?: string } {
  const linhas = parseCsv(texto);
  if (linhas.length < 2) return { contatos: [], erro: `${arquivo}: arquivo vazio.` };
  const cab = linhas[0].map((h) => normalizaNome(h));
  const idx = (...nomes: string[]) => cab.findIndex((h) => nomes.includes(h));
  const iNome = idx("NOME", "NAME", "CONTATO", "DEVEDOR", "FIRST NAME");
  const iTel = idx("TELEFONE", "PHONE", "CELULAR", "PHONE 1 VALUE", "NUMERO", "WHATSAPP");
  const iDdi = idx("DDI");
  const iAt = idx("ATENDENTE PADRAO", "ATENDENTE");
  const iDep = idx("DEPARTAMENTO PADRAO", "DEPARTAMENTO");
  if (iNome < 0 || iTel < 0) return { contatos: [], erro: `${arquivo}: não achei as colunas nome e telefone (cabeçalho: ${linhas[0].join(", ")}).` };
  const contatos: Contato[] = [];
  linhas.slice(1).forEach((l, i) => {
    const tel = telefoneE164(iDdi >= 0 ? l[iDdi] ?? "" : "", l[iTel] ?? "");
    const nome = (l[iNome] ?? "").trim();
    if (!tel || !nome) return;
    contatos.push({ nome, telefone: tel, atendente: (iAt >= 0 ? l[iAt] : "")?.trim() ?? "", departamento: (iDep >= 0 ? l[iDep] : "")?.trim() ?? "", arquivo, linha: i + 2 });
  });
  return { contatos };
}

export type CasoTel = Pick<Caso, "id" | "cliente_id" | "devedor" | "telefone" | "fase">;
export type Cruzamento = {
  contato: Contato;
  caso: CasoTel | null;
  cliente_id: string | null;        // cliente deduzido pelo nome do contato (LOBE, ASVC...)
  kind: "preencher" | "igual" | "diferente" | "ambiguo" | "sem_caso";
  forca: "exata" | "contida" | "parcial" | null;
  candidatos: CasoTel[];            // quando ambíguo
  cobranca: boolean;                // contato marcado como cobrança (departamento/atendente) ou com cliente no nome
};

const ultimos8 = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "").slice(-8);

/** Cruza contatos com casos abertos. Casa por telefone já existente, depois por nome (segmentos "EMPRESA - CLIENTE - pessoa"). */
export function cruzaContatos(contatos: Contato[], casos: CasoTel[], clientes: Pick<Cliente, "id" | "nome" | "nome_curto">[]): Cruzamento[] {
  const porTel = new Map<string, CasoTel[]>();
  for (const c of casos) { const k = ultimos8(c.telefone); if (k.length === 8) (porTel.get(k) ?? porTel.set(k, []).get(k)!).push(c); }
  const normCasos = casos.map((c) => ({ c, n: normalizaNome(c.devedor) }));
  const marcas = clientes.map((cl) => ({ id: cl.id, tokens: [cl.id, cl.nome_curto, cl.nome].map(normalizaNome).filter((t) => t.length >= 3) }));

  return contatos.map((ct) => {
    const nomeN = normalizaNome(ct.nome);
    const cliente_id = marcas.find((m) => m.tokens.some((t) => new RegExp(`(^| )${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(nomeN)))?.id ?? null;
    const cobranca = /COBRAN|FINANCEIR/.test(normalizaNome(ct.departamento)) || !!ct.atendente || !!cliente_id;
    // 1) telefone já cadastrado em algum caso
    const mesmoTel = porTel.get(ultimos8(ct.telefone)) ?? [];
    if (mesmoTel.length) return { contato: ct, caso: mesmoTel[0], cliente_id, kind: "igual", forca: "exata", candidatos: mesmoTel, cobranca };
    // 2) nome: segmentos separados por " - ", "/", "|"
    const segs = ct.nome.split(/\s[-–|/]\s|\s-\s|\s\/\s/).map(normalizaNome).filter((s) => s.length >= 4);
    const universo = cliente_id ? normCasos.filter((x) => x.c.cliente_id === cliente_id) : normCasos;
    const exatos = universo.filter((x) => segs.includes(x.n) || x.n === nomeN);
    let achados = exatos, forca: Cruzamento["forca"] = exatos.length ? "exata" : null;
    if (!achados.length) {
      const contidos = universo.filter((x) => x.n.length >= 6 && (nomeN.includes(x.n) || segs.some((s) => s.length >= 6 && x.n.includes(s))));
      if (contidos.length) { achados = contidos; forca = "contida"; }
    }
    if (!achados.length) {
      // duas primeiras palavras do devedor (≥ 3 letras cada) presentes no nome do contato
      const parciais = universo.filter((x) => { const p = x.n.split(" ").filter((w) => w.length >= 3).slice(0, 2); return p.length === 2 && p.every((w) => nomeN.split(" ").includes(w)); });
      if (parciais.length) { achados = parciais; forca = "parcial"; }
    }
    if (!achados.length) return { contato: ct, caso: null, cliente_id, kind: "sem_caso", forca: null, candidatos: [], cobranca };
    if (achados.length > 1) return { contato: ct, caso: null, cliente_id, kind: "ambiguo", forca, candidatos: achados.map((x) => x.c), cobranca };
    const caso = achados[0].c;
    const temTel = ultimos8(caso.telefone).length === 8;
    return { contato: ct, caso, cliente_id, kind: temTel ? "diferente" : "preencher", forca, candidatos: [caso], cobranca };
  });
}

export function resumoCruzamento(lista: Cruzamento[]) {
  const n = (k: Cruzamento["kind"]) => lista.filter((x) => x.kind === k).length;
  return { total: lista.length, preencher: n("preencher"), igual: n("igual"), diferente: n("diferente"), ambiguo: n("ambiguo"), sem_caso: n("sem_caso"), cobrancaSemCaso: lista.filter((x) => x.kind === "sem_caso" && x.cobranca).length };
}
