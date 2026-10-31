import { addDias, brl, fmtData } from "@/lib/domain/datas";
import { parcelaAberta } from "@/lib/domain/parcelas";
import type { Caso, Cliente, Parcela } from "@/lib/domain/types";

/**
 * Encaminhamento ao judicial com abertura do processo no Escala (sistema de gestão do escritório).
 *
 * A cobrança chama as ferramentas do Escala pela API (`POST /api/mcp/<ferramenta>`, token pessoal):
 * localiza o cliente credor, cadastra o devedor como parte contrária, abre o processo com o advogado
 * escolhido e cria a tarefa de distribuir a ação. Este módulo é puro: recebe uma função `chamar`
 * (injetada; em produção é `src/lib/escala.ts`) e devolve o resultado, sem lançar exceção.
 */

export const VIAS_JUDICIAIS = ["Execução (título executivo)", "Monitória", "Juizado Especial"] as const;

/** Objeto da ação no título do processo, conforme a via escolhida. */
export function objetoDaAcao(via: string): string {
  if (/execu/i.test(via)) return "Execução de título extrajudicial";
  if (/monit/i.test(via)) return "Ação monitória";
  if (/juizado/i.test(via)) return "Cobrança (Juizado Especial)";
  return "Cobrança";
}

export const tipoContato = (digitos: string): "pf" | "pj" => (digitos.length === 11 ? "pf" : "pj");

/** Comparação de nomes sem acento, caixa e pontuação ("Colégio WRJ Ltda." = "colegio wrj ltda"). */
export const normaliza = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type DadosEncaminhamento = {
  caso: Pick<Caso, "id" | "devedor" | "documento" | "documento_digits" | "telefone" | "email" | "referencia" | "detalhe" | "valor_atualizado">;
  cliente: Pick<Cliente, "id" | "nome" | "nome_curto">;
  parcelas: Pick<Parcela, "referencia" | "valor" | "vencimento" | "paga" | "retirada_em">[];
  via: string;
  advogado: string;
  hoje: string;
  /** Link do caso na cobrança, para o advogado achar os documentos e o histórico. */
  urlCobranca: string;
  /** Contato do Escala já associado a este cliente (cache em `configuracoes`), se houver. */
  contatoClienteId?: string | null;
};

export function tituloProcesso(d: Pick<DadosEncaminhamento, "cliente" | "caso" | "via">): string {
  return `${d.cliente.nome} x ${d.caso.devedor} - ${objetoDaAcao(d.via)}`;
}

/** Resumo da dívida para a descrição do processo e da tarefa. */
export function resumoDivida(d: Pick<DadosEncaminhamento, "caso" | "parcelas" | "via" | "urlCobranca">): string {
  const abertas = d.parcelas.filter(parcelaAberta);
  const linhas = [
    `Encaminhado pela Escala Cobrança (${d.via}).`,
    `Devedor: ${d.caso.devedor}${d.caso.documento ? `, ${d.caso.documento}` : ""}.`,
    `Dívida: ${d.caso.referencia}${d.caso.detalhe ? ` (${d.caso.detalhe})` : ""}. Valor em aberto: ${brl(d.caso.valor_atualizado ?? 0)}.`,
  ];
  if (abertas.length) {
    linhas.push(`Parcelas em aberto (${abertas.length}):`);
    for (const p of abertas.slice(0, 20)) linhas.push(`• ${p.referencia}: ${brl(Number(p.valor))}, venc. ${fmtData(p.vencimento)}`);
    if (abertas.length > 20) linhas.push(`• … e mais ${abertas.length - 20}.`);
  }
  linhas.push(`Histórico, contatos e documentos na cobrança: ${d.urlCobranca}`);
  return linhas.join("\n");
}

export function tarefaDistribuir(d: DadosEncaminhamento, casoEscalaId: string) {
  const execucao = /execu/i.test(d.via);
  return {
    tipo: "tarefa",
    titulo: `TAREFA: distribuir ${objetoDaAcao(d.via).toLowerCase()} - ${d.caso.devedor}`,
    descricao: [
      resumoDivida(d),
      "",
      "O que fazer:",
      execucao
        ? "1. Conferir se o título é executivo (contrato com 2 testemunhas ou assinatura eletrônica validada). Se não for, trocar a via para monitória."
        : "1. Reunir o documento da dívida e a prova da cobrança extrajudicial (histórico na cobrança).",
      "2. Atualizar o débito até a data da distribuição.",
      "3. Distribuir e lançar o número CNJ no processo do Escala.",
    ].join("\n"),
    caso_id: casoEscalaId,
    responsavel: d.advogado,
    prioridade: "alta",
    data: addDias(d.hoje, 7),
  };
}

/** Resposta de uma ferramenta do Escala, já interpretada: `dados` é o JSON devolvido em caso de sucesso. */
export type RespostaEscala = { ok: true; dados: Record<string, unknown> } | { ok: false; erro: string };
export type ChamarEscala = (ferramenta: string, args: Record<string, unknown>) => Promise<RespostaEscala>;

export type ResultadoEncaminhamento =
  | { ok: true; casoId: string; url: string; contatoClienteId: string; avisos: string[] }
  | { ok: false; erro: string };

type ContatoBusca = { id: string; nome: string; nome_fantasia?: string | null; documento?: string | null };

/**
 * Cliente credor no Escala: o contato já associado (cache), ou o único contato cujo nome (ou nome fantasia)
 * bate com o nome ou o nome curto do cliente na cobrança. Nunca cria cliente: duplicar cliente no Escala é pior
 * do que pedir para associar à mão.
 */
async function localizarCliente(d: DadosEncaminhamento, chamar: ChamarEscala): Promise<{ id: string } | { erro: string }> {
  if (d.contatoClienteId) return { id: d.contatoClienteId };
  const alvos = new Set([normaliza(d.cliente.nome), normaliza(d.cliente.nome_curto)].filter(Boolean));
  const vistos = new Map<string, ContatoBusca>();
  for (const termo of [d.cliente.nome, d.cliente.nome_curto]) {
    if (!termo || termo.trim().length < 2) continue;
    const r = await chamar("buscar_contato", { termo, limite: 15 });
    if (!r.ok) return { erro: `busca do cliente no Escala falhou: ${r.erro}` };
    for (const c of (r.dados.contatos as ContatoBusca[] | undefined) ?? []) vistos.set(c.id, c);
  }
  const lista = [...vistos.values()];
  const exatos = lista.filter((c) => alvos.has(normaliza(c.nome)) || (c.nome_fantasia && alvos.has(normaliza(c.nome_fantasia))));
  if (exatos.length === 1) return { id: exatos[0].id };
  if (exatos.length === 0 && lista.length === 1) return { id: lista[0].id };
  if (!lista.length) return { erro: `cliente "${d.cliente.nome}" não encontrado nos contatos do Escala` };
  const nomes = (exatos.length ? exatos : lista).slice(0, 5).map((c) => c.nome).join("; ");
  return { erro: `mais de um contato do Escala pode ser o cliente "${d.cliente.nome}" (${nomes}); associe o contato certo` };
}

/** Devedor no Escala: o contato com o mesmo CPF/CNPJ, ou um novo (não cliente). Falhar aqui não impede o processo. */
async function localizarOuCriarDevedor(d: DadosEncaminhamento, chamar: ChamarEscala): Promise<{ id: string } | { aviso: string }> {
  const digitos = d.caso.documento_digits;
  if (digitos && digitos.length >= 11) {
    const r = await chamar("buscar_contato", { termo: digitos, limite: 5 });
    if (r.ok) {
      const achado = ((r.dados.contatos as ContatoBusca[] | undefined) ?? []).find((c) => (c.documento ?? "").replace(/\D/g, "") === digitos);
      if (achado) return { id: achado.id };
    }
  }
  const base = {
    nome: d.caso.devedor,
    tipo: tipoContato(digitos ?? ""),
    cliente: false,
    forcar: true,
    observacoes: `Devedor encaminhado ao judicial pela Escala Cobrança: ${d.urlCobranca}`,
    ...(d.caso.telefone ? { telefone: d.caso.telefone } : {}),
    ...(d.caso.email ? { email: d.caso.email } : {}),
  };
  let r = await chamar("criar_contato", digitos ? { ...base, documento: digitos } : base);
  // O Escala recusa CPF/CNPJ inválido: cadastra sem o documento e avisa, para não travar o processo.
  if (!r.ok && digitos) {
    const semDoc = await chamar("criar_contato", base);
    if (semDoc.ok) return { id: String(semDoc.dados.id) };
    r = semDoc;
  }
  if (r.ok) return { id: String(r.dados.id) };
  return { aviso: `devedor não cadastrado no Escala (${r.erro}); inclua a parte contrária à mão` };
}

/** Abre o processo no Escala. Nunca lança: falha vira `{ ok: false, erro }` para a cobrança seguir. */
export async function abrirNoEscala(d: DadosEncaminhamento, chamar: ChamarEscala): Promise<ResultadoEncaminhamento> {
  try {
    const cliente = await localizarCliente(d, chamar);
    if ("erro" in cliente) return { ok: false, erro: cliente.erro };

    const caso = await chamar("criar_caso", {
      titulo: tituloProcesso(d),
      cliente: cliente.id,
      responsavel: d.advogado,
      tipo: "processo",
      area: "Cível",
      assunto: objetoDaAcao(d.via),
      polo: "ativo",
      descricao: resumoDivida(d),
      ...(d.caso.valor_atualizado != null && d.caso.valor_atualizado > 0 ? { valor_causa: d.caso.valor_atualizado } : {}),
    });
    if (!caso.ok) return { ok: false, erro: `o Escala recusou o processo: ${caso.erro}` };
    const casoId = String(caso.dados.id);
    const url = String(caso.dados.url ?? "");
    const avisos: string[] = [];

    const devedor = await localizarOuCriarDevedor(d, chamar);
    if ("aviso" in devedor) avisos.push(devedor.aviso);
    else {
      const env = await chamar("adicionar_envolvido", { caso_id: casoId, contato_id: devedor.id, qualificacao: "parte_contraria" });
      if (!env.ok) avisos.push(`devedor não vinculado como parte contrária (${env.erro})`);
    }

    const tarefa = await chamar("criar_atividade", tarefaDistribuir(d, casoId));
    if (!tarefa.ok) avisos.push(`tarefa de distribuição não criada (${tarefa.erro})`);

    return { ok: true, casoId, url, contatoClienteId: cliente.id, avisos };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
