import { parseDataBR } from "./datas";
import { isAberto, type Caso, type Cliente } from "./types";

/** Linha normalizada da planilha de casos. */
export type LinhaPlanilha = {
  linha: number;
  devedor: string;
  documento: string;
  documento_digits: string;
  referencia: string;
  valor: number | null;
  vencimento: string | null; // ISO
  telefone: string;
  email: string;
  cliente: string;
  situacao: string;
  erros: string[];
};

export type Classificacao = "novo" | "consolida" | "igual" | "baixa" | "excecao";
export type LinhaClassificada = LinhaPlanilha & { cliente_id: string | null; caso: Caso | null; kind: Classificacao };

export type Reconciliacao = {
  linhas: LinhaClassificada[];
  ausentes: Caso[]; // abertos do(s) cliente(s) que não aparecem na planilha
  resumo: { novos: number; consolidados: number; iguais: number; baixas: number; excecoes: number; erros: number; ausentes: number };
};

export const normHead = (h: unknown) =>
  String(h ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, "_");

const ALIAS: Record<string, string[]> = {
  situacao: ["situacao", "status", "cobrar", "observacao", "obs"],
  devedor: ["devedor", "nome", "responsavel", "razao_social", "cliente_devedor", "sacado", "aluno_responsavel"],
  documento: ["documento", "cpf", "cnpj", "cpf/cnpj", "cpf_cnpj", "doc"],
  referencia: ["referencia", "descricao", "historico", "titulo", "competencia", "mensalidade"],
  valor: ["valor", "valor_original", "total", "divida", "saldo"],
  vencimento: ["vencimento", "data", "data_vencimento", "venc"],
  telefone: ["telefone", "celular", "whatsapp", "fone", "contato"],
  email: ["email", "e-mail", "e_mail"],
  cliente: ["cliente", "credor", "empresa", "escola"],
};

export function parseValorBR(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
  const s = String(v ?? "")
    .trim()
    .replace(/R\$\s?/, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  return s && isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function parseVencimento(v: unknown): string | null {
  if (v instanceof Date && !isNaN(+v)) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return parseDataBR(String(v ?? ""));
}

/** Converte a matriz da planilha (linha 0 = cabeçalho) em linhas normalizadas e validadas. */
export function normalizaPlanilha(rows: unknown[][], hoje: string): { linhas: LinhaPlanilha[]; faltam: string[]; cabecalho: string[] } {
  const head = (rows[0] ?? []).map(normHead);
  const idx: Record<string, number> = {};
  for (const [k, al] of Object.entries(ALIAS)) {
    const i = head.findIndex((h) => al.includes(h));
    if (i >= 0) idx[k] = i;
  }
  const faltam = ["devedor", "documento", "referencia", "valor", "vencimento"].filter((k) => idx[k] == null);
  if (faltam.length) return { linhas: [], faltam, cabecalho: head };
  const g = (r: unknown[], k: string) => (idx[k] == null ? "" : (r[idx[k]] ?? ""));
  const linhas = rows
    .slice(1)
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.some((x) => x !== "" && x != null))
    .map(({ r, i }) => {
      const documento = String(g(r, "documento")).trim();
      const digits = documento.replace(/\D/g, "");
      const valor = parseValorBR(g(r, "valor"));
      const vencimento = parseVencimento(g(r, "vencimento"));
      const telefone = String(g(r, "telefone")).trim();
      const erros: string[] = [];
      const devedor = String(g(r, "devedor")).trim();
      if (!devedor) erros.push("devedor em branco");
      if (!(digits.length === 11 || digits.length === 14)) erros.push("documento deve ter 11 ou 14 dígitos");
      if (valor == null) erros.push("valor inválido");
      if (!vencimento) erros.push("data fora do formato DD/MM/AAAA");
      else if (vencimento >= hoje) erros.push("título ainda não venceu");
      if (telefone && telefone.replace(/\D/g, "").length < 10) erros.push("telefone sem DDD");
      return {
        linha: i + 2,
        devedor,
        documento,
        documento_digits: digits,
        referencia: String(g(r, "referencia")).trim() || "Parcela",
        valor,
        vencimento,
        telefone,
        email: String(g(r, "email")).trim(),
        cliente: String(g(r, "cliente")).trim(),
        situacao: String(g(r, "situacao")).trim(),
        erros,
      };
    });
  return { linhas, faltam: [], cabecalho: head };
}

/**
 * Compara as linhas válidas com os casos abertos. Nunca cria duplicidade:
 * o mesmo devedor (cliente + documento) com caso aberto recebe a parcela no caso existente.
 */
export function reconcilia(
  linhas: LinhaPlanilha[],
  casosAbertos: Caso[],
  parcelasPorCaso: Record<string, { referencia: string; vencimento: string }[]>,
  clientes: Cliente[],
  clienteFixo: string | null,
): Reconciliacao {
  const porNome: Record<string, string> = {};
  for (const c of clientes) {
    porNome[normHead(c.nome)] = c.id;
    porNome[normHead(c.nome_curto)] = c.id;
    porNome[normHead(c.id)] = c.id;
  }
  const classificadas: LinhaClassificada[] = linhas.map((l) => {
    const cliente_id = clienteFixo ?? porNome[normHead(l.cliente)] ?? null;
    const erros = [...l.erros];
    if (!cliente_id) erros.push(l.cliente ? `cliente "${l.cliente}" não cadastrado` : 'informe o cliente (coluna "cliente" ou filtro no topo)');
    const caso = cliente_id ? casosAbertos.find((c) => isAberto(c) && c.cliente_id === cliente_id && c.documento_digits === l.documento_digits && l.documento_digits) ?? null : null;
    const sit = normHead(l.situacao);
    let kind: Classificacao;
    if (/pag|quitad|baixa/.test(sit)) kind = "baixa";
    else if (/nao|não|suspend|cobrar|acordo_direto|negocia/.test(sit)) kind = "excecao";
    else if (caso) {
      const jaTem = (parcelasPorCaso[caso.id] ?? []).some((p) => normHead(p.referencia) === normHead(l.referencia) && p.vencimento === l.vencimento);
      kind = jaTem ? "igual" : "consolida";
    } else kind = "novo";
    return { ...l, erros, cliente_id, caso, kind };
  });
  const escopo = [...new Set(classificadas.filter((l) => l.cliente_id).map((l) => l.cliente_id!))];
  const docsNaPlanilha: Record<string, Set<string>> = {};
  for (const l of classificadas) if (l.cliente_id) (docsNaPlanilha[l.cliente_id] ??= new Set()).add(l.documento_digits);
  const ausentes = escopo.flatMap((cid) => casosAbertos.filter((c) => c.cliente_id === cid && isAberto(c) && !c.exc_tipo && c.documento_digits && !docsNaPlanilha[cid].has(c.documento_digits)));
  const ok = classificadas.filter((l) => !l.erros.length);
  const n = (k: Classificacao) => ok.filter((l) => l.kind === k).length;
  return {
    linhas: classificadas,
    ausentes,
    resumo: { novos: n("novo"), consolidados: n("consolida"), iguais: n("igual"), baixas: n("baixa"), excecoes: n("excecao"), erros: classificadas.length - ok.length, ausentes: ausentes.length },
  };
}

/** Hash estável do conteúdo da planilha (idempotência da importação). */
export async function hashLinhas(linhas: LinhaPlanilha[], clienteFixo: string | null): Promise<string> {
  const txt = JSON.stringify([clienteFixo, linhas.map((l) => [l.devedor, l.documento_digits, l.referencia, l.valor, l.vencimento, l.situacao])]);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
