/**
 * Importador do quadro Trello "Mediação e Conciliação - GF Advogados".
 * Puro: recebe o JSON exportado e devolve casos, parcelas e eventos prontos para o banco.
 * Usado na carga inicial (scripts/carga-trello.ts) e na aba Importar.
 */
import { addDias, isoDe } from "./datas";
import type { Fase, TipoExcecao } from "./types";

type Regra = [RegExp, Fase | null, string];
const LISTAS: Regra[] = [
  [/^ESTOQUE|^Dr Marden documentos/i, null, "Cartão de base documental, não é caso"],
  [/^X$/i, null, "Lista técnica"],
  [/FAZER NOTIFICA/i, "neg", "Notificação extrajudicial pendente"],
  [/COBRANÇA INICIAL/i, "neg", "Cobrança inicial"],
  [/JÁ NOTIFICADOS/i, "neg", "Notificado extrajudicialmente"],
  [/RESTRIÇÃO ALTA/i, "neg", "Restrição alta no SPC"],
  [/SEM RETORNO/i, "neg", "Sem retorno do devedor"],
  [/FREQUENTEMENTE INADIMPLENTES/i, "neg", "Reincidente"],
  [/TERMO DE ACORDO|ASSINATURA DIGITAL|FAZER +BOLETOS/i, "acordo", "Acordo em formalização"],
  [/Acompanhar Pagamento/i, "acordo", "Acordo em pagamento"],
  [/ANALISAR PARA ENTRAR|VERIFICAR SE É PARA JUDICIALIZAR|AGUARDA DOCUMENTO PARA JUDICIALIZAR|JUDICIALIZAR- DOCUMENTOS/i, "analise", "Análise para judicializar"],
  [/Contatos sem sucesso/i, "analise", "Contatos inválidos ou sem sucesso"],
  [/Protocolo Feito|ENVIADO PARA AÇÃO JUDICIAL|Correção e Protocolo/i, "judicial", "Ação judicial"],
  [/Pagamento Efetuado/i, "pago", "Pago"],
  [/Devolvidos Cliente/i, "devolvido", "Devolvido ao cliente"],
  [/LIMBO DIVERSOS/i, "devolvido", "Arquivado (histórico)"],
];

export type ClienteTrello = { id: string; nome: string; nome_curto: string; tipo: "escola" | "contab" | "b2b" | "assoc" };
const ETIQUETA_CLIENTE: Record<string, ClienteTrello> = {
  RECMED: { id: "recmed", nome: "RECMED", nome_curto: "RECMED", tipo: "b2b" },
  Lobe: { id: "lobe", nome: "Lobe Consultoria", nome_curto: "Lobe", tipo: "contab" },
  WRJ: { id: "wrj", nome: "Colégio WRJ", nome_curto: "WRJ", tipo: "escola" },
  WINNICOTT: { id: "winnicott", nome: "Colégio Winnicott", nome_curto: "Winnicott", tipo: "escola" },
  "Vila Colonial": { id: "vila", nome: "Associação Vila Colonial", nome_curto: "Vila Colonial", tipo: "assoc" },
  "SHOP FRANCHISING": { id: "shop", nome: "Shop Franchising", nome_curto: "Shop", tipo: "b2b" },
  "GRUPO SHOP": { id: "shop", nome: "Shop Franchising", nome_curto: "Shop", tipo: "b2b" },
  AGROPOP: { id: "shop", nome: "Shop Franchising", nome_curto: "Shop", tipo: "b2b" },
  DROGARIA: { id: "shop", nome: "Shop Franchising", nome_curto: "Shop", tipo: "b2b" },
  "BOLOS DO CERRADO": { id: "bolos", nome: "Bolos do Cerrado", nome_curto: "Bolos do Cerrado", tipo: "b2b" },
  BAR: { id: "bar", nome: "BAR", nome_curto: "BAR", tipo: "b2b" },
  "Condômina Ed Amazônia": { id: "amazonia", nome: "Condomínio Ed. Amazônia", nome_curto: "Ed. Amazônia", tipo: "assoc" },
};
const SEM_CLIENTE: ClienteTrello = { id: "sem_cliente", nome: "Sem etiqueta de cliente", nome_curto: "Sem cliente", tipo: "b2b" };

const ETIQUETA_EXCECAO: Record<string, TipoExcecao> = {
  "NÃO COBRAR": "nao_cobrar",
  "NÃO COBRAR! SEM CONTRATO": "sem_contrato",
  Prescrito: "prescrito",
  "Aguardando Documentos Cliente": "aguardando",
};

const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const PHONE = /\(?\b(\d{2})\)?\s?(9?\d{4})[-\s]?(\d{4})\b/g;
const MONEY = /R\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:,\d{2}))/g;
const MONEY_EQ = /=\s*R?\$?\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d{4,},\d{2})/;
const MONEY_CTX = /(d[ií]vida(?: atualizada| original)?|valor (?:total|atualizado|da d[ií]vida)|totais? calculados?|total)[^\d]{0,40}R?\$?\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d{4,}(?:,\d{2})?)/i;

const brNum = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? n : NaN;
};
const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`‌\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const digits = (s: string) => s.replace(/\D/g, "");
const dataDoId = (id: string) => new Date(parseInt(id.slice(0, 8), 16) * 1000);
export const formataDoc = (d: string) => {
  d = digits(d);
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return d;
};

function mapeiaLista(nome: string) {
  for (const [re, fase, nota] of LISTAS) if (re.test(nome)) return { fase, nota };
  return { fase: "neg" as Fase, nota: "Lista não mapeada: " + nome };
}

function parseNome(name: string) {
  let s = name.trim();
  let codigo: string | null = null, doc: string | null = null, aluno: string | null = null, lote: string | null = null;
  const m0 = s.match(/^(\d{6})\s*-?\s*/);
  if (m0) { codigo = m0[1]; s = s.slice(m0[0].length); }
  const md = s.match(CNPJ) || s.match(CPF) || s.match(/\d{14}/);
  if (md) doc = formataDoc(md[0]);
  s = s.replace(new RegExp(CNPJ.source, "g"), "").replace(new RegExp(CPF.source, "g"), "").replace(/\d{14}/g, "").replace(/[;,]\s*(?=[;,]|$)/g, "");
  const ma = s.match(/[-–]?\s*(?:ALUN[OA]S?|ex-alun[oa]|\(2 Filhos\))\s*:?\s*(\d{5})?\s*[-–]?\s*(.+)$/i);
  if (ma) { aluno = ((ma[1] ? ma[1] + " " : "") + ma[2]).replace(/[\[\]]/g, " ").replace(/\s+/g, " ").trim(); s = s.slice(0, ma.index); }
  const ml = s.match(/\b(\d{2})\s*[- ]?\s*L\s?(\d{2})\b/i);
  if (ml) { lote = `Quadra ${ml[1]} · Lote ${ml[2]}`; s = s.slice(0, ml.index); }
  s = s.replace(/\bCNPJ\b|SEM CNPJ|[-–;:]+\s*$/gi, "").replace(/\s+/g, " ").trim();
  return { devedor: s || name.trim(), codigo, doc, aluno, lote };
}

function extraiValor(textos: string[]) {
  for (const t of textos) { const e = t.match(MONEY_EQ); if (e) { const v = brNum(e[1]); if (v > 50) return { valor: v, fonte: "Trello: soma calculada" }; } }
  for (const t of textos) { const m = t.match(MONEY_CTX); if (m) { const v = brNum(m[2]); if (v > 50) return { valor: v, fonte: "Trello: " + m[1].toLowerCase() }; } }
  let best = 0, fonte: string | null = null;
  textos.forEach((t, i) => { let m: RegExpExecArray | null; MONEY.lastIndex = 0; while ((m = MONEY.exec(t))) { const v = brNum(m[1]); if (v > best) { best = v; fonte = i === 0 ? "Trello: descrição" : "Trello: comentário"; } } });
  return best > 0 ? { valor: best, fonte } : { valor: null, fonte: null };
}

const nomeCurto = (n: string | null | undefined) => {
  if (!n) return null;
  n = n.replace(/\s+/g, " ").trim();
  if (/ana paula/i.test(n)) return "Ana Paula";
  if (/leticia/i.test(n)) return "Letícia";
  if (/jaqueline/i.test(n)) return "Jaqueline";
  return n.split(" ")[0];
};

/* ---- tipos do JSON do Trello (só o que usamos) ---- */
type TrelloBoard = {
  name?: string;
  lists: { id: string; name: string; closed: boolean; pos: number }[];
  cards: { id: string; name: string; desc: string; closed: boolean; idList: string; idMembers?: string[]; idChecklists?: string[]; labels?: { name: string }[]; dateLastActivity: string; shortUrl?: string }[];
  members?: { id: string; fullName: string }[];
  actions?: { type: string; date: string; data: { card?: { id: string }; text?: string }; memberCreator?: { fullName: string } }[];
  checklists?: { id: string; checkItems: { name: string; state: string }[] }[];
};

export type CasoTrello = {
  trello_id: string;
  cliente: ClienteTrello;
  devedor: string;
  documento: string | null;
  referencia: string;
  detalhe: string;
  valor: number | null;
  valor_fonte: string | null;
  fase: Fase;
  fase_nota: string;
  lista: string;
  etiquetas: string[];
  excecao: TipoExcecao | null;
  telefone: string | null;
  email: string | null;
  responsavel: string;
  entrada_em: string;
  ultima_mov_em: string;
  url: string | null;
  pendencias: string[];
  eventos: { data: string; autor: string; texto: string }[];
};

export function parseTrello(board: TrelloBoard, hoje: Date = new Date()) {
  const listas = Object.fromEntries(board.lists.map((l) => [l.id, l]));
  const membros = Object.fromEntries((board.members ?? []).map((m) => [m.id, m.fullName]));
  const comentarios: Record<string, { d: Date; by: string; what: string }[]> = {};
  for (const a of board.actions ?? []) {
    if (a.type === "commentCard" && a.data.card) (comentarios[a.data.card.id] ??= []).push({ d: new Date(a.date), by: nomeCurto(a.memberCreator?.fullName) ?? "Trello", what: clean(a.data.text).slice(0, 400) });
  }
  const checklists = Object.fromEntries((board.checklists ?? []).map((c) => [c.id, c]));
  const hojeISO = isoDe(hoje);

  const casos: CasoTrello[] = [];
  const ignorados: { nome: string; lista: string; motivo: string }[] = [];
  for (const c of board.cards.filter((x) => !x.closed)) {
    const L = listas[c.idList];
    const { fase, nota } = mapeiaLista(L.name);
    if (!fase) { ignorados.push({ nome: c.name, lista: L.name, motivo: nota }); continue; }
    const etiquetas = (c.labels ?? []).map((l) => l.name);
    const cliente = etiquetas.map((n) => ETIQUETA_CLIENTE[n]).find(Boolean) ?? SEM_CLIENTE;
    const excecao = etiquetas.map((n) => ETIQUETA_EXCECAO[n]).find(Boolean) ?? null;
    const nm = parseNome(c.name);
    const desc = clean(c.desc);
    const cms = (comentarios[c.id] ?? []).sort((a, b) => +b.d - +a.d);
    const val = extraiValor([desc, ...cms.map((x) => x.what)]);
    const doc = nm.doc ?? (() => { const m = desc.match(CNPJ) || desc.match(CPF); return m ? formataDoc(m[0]) : null; })();
    const fones: string[] = []; let pm: RegExpExecArray | null; PHONE.lastIndex = 0;
    while ((pm = PHONE.exec(desc)) && fones.length < 2) { const f = `(${pm[1]}) ${pm[2]}-${pm[3]}`; if (!fones.includes(f)) fones.push(f); }
    const email = desc.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;
    const criado = dataDoId(c.id), ultima = new Date(c.dateLastActivity);
    const parado = Math.max(0, Math.round((+hoje - +ultima) / 864e5));
    const resp = [...new Set((c.idMembers ?? []).map((id) => nomeCurto(membros[id])).filter((n): n is string => !!n && n !== "Marden"))];
    const eventos = cms.slice(0, 12).map((x) => ({ data: x.d.toISOString(), autor: x.by, texto: x.what || "(anexo)" }));
    for (const id of c.idChecklists ?? []) {
      const ck = checklists[id];
      if (ck) for (const i of ck.checkItems.filter((i) => i.state === "complete").slice(-3)) eventos.push({ data: ultima.toISOString(), autor: "Trello", texto: "Checklist: " + clean(i.name) });
    }
    eventos.push({ data: criado.toISOString(), autor: "Trello", texto: `Cartão criado no Trello (lista na importação: ${L.name})` });
    eventos.sort((a, b) => b.data.localeCompare(a.data));
    const pend: string[] = [];
    if (val.valor == null) pend.push("sem valor");
    if (!doc) pend.push("sem CPF/CNPJ");
    if (!fones.length && !email) pend.push("sem contato");
    if (cliente.id === "sem_cliente") pend.push("sem etiqueta de cliente");
    if (fase !== "pago" && fase !== "devolvido" && parado > 60) pend.push(`parado há ${parado} dias`);
    const referencia = nm.aluno ? `Mensalidades · ${nm.aluno}` : nm.lote ? nm.lote : cliente.tipo === "contab" ? "Honorários contábeis" : cliente.id === "recmed" ? `Duplicatas${nm.codigo ? " · pedido " + nm.codigo : ""}` : "Título em cobrança";
    casos.push({
      trello_id: c.id, cliente, devedor: nm.devedor, documento: doc, referencia, detalhe: nota, valor: val.valor, valor_fonte: val.fonte, fase, fase_nota: nota, lista: L.name, etiquetas, excecao,
      telefone: fones[0] ?? null, email, responsavel: resp.find((r) => ["Ana Paula", "Letícia", "Jaqueline", "Lucas"].includes(r)) ?? "Ana Paula",
      entrada_em: isoDe(criado), ultima_mov_em: ultima.toISOString(), url: c.shortUrl ?? null, pendencias: pend, eventos,
    });
  }
  const clientes = [...new Map(casos.map((c) => [c.cliente.id, c.cliente])).values()];
  const resumo = {
    cartoes: board.cards.length, abertos: board.cards.filter((c) => !c.closed).length, casos: casos.length, ignorados: ignorados.length,
    comValor: casos.filter((c) => c.valor != null).length, comDoc: casos.filter((c) => c.documento).length,
    porFase: casos.reduce<Record<string, number>>((a, c) => ((a[c.fase] = (a[c.fase] ?? 0) + 1), a), {}),
    hoje: hojeISO, excecaoRevisaoPadrao: addDias(hojeISO, 30),
  };
  return { clientes, casos, ignorados, resumo };
}
