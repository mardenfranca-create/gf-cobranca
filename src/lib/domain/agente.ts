import { addDias, diffDias } from "./datas";
import { montaFila, type Tarefa } from "./fila";
import { isAberto, type Caso, type Cliente, type Cobranca, type Parcela, type Proposta } from "./types";

/**
 * Leitura para o agente de Cobrança do OpenClaw (GET /api/agente/excecoes).
 * Puro: recebe o que a rota carregou do banco e devolve só o que exige atenção.
 * A fila vem de `montaFila` (a mesma da tela /fila), para o agente e a Ana verem a mesma coisa.
 *
 * Vencimentos vêm de duas fontes: `parcelas` (títulos cobrados, importados do cliente) e `cobrancas`
 * (boletos/Pix emitidos no Asaas, onde ficam as parcelas dos acordos).
 */

/** Quatro anos (com um dia bissexto) a partir do vencimento: só sinaliza, não calcula prazo prescricional. */
export const DIAS_ATENCAO_PRESCRICAO = 4 * 365 + 1;

/** Status do Asaas que encerram a cobrança (paga, devolvida ou cancelada). */
const COBRANCA_FECHADA = new Set([
  "RECEIVED",
  "CONFIRMED",
  "RECEIVED_IN_CASH",
  "DUNNING_RECEIVED",
  "REFUNDED",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_DONE",
  "DELETED",
  "CANCELLED",
]);

export function cobrancaEmAberto(c: Pick<Cobranca, "status" | "pago_em">): boolean {
  return !c.pago_em && !COBRANCA_FECHADA.has(c.status);
}

export type ItemAgente = {
  caso_id: string;
  cliente: string;
  devedor: string;
  valor: number | null;
  fase: Caso["fase"];
  responsavel: string | null;
  proxima_data: string | null;
  dias_sem_movimento: number;
};

export type Leitura = {
  hoje: string;
  resumo: {
    casos_abertos: number;
    valor_aberto: number;
    tarefas: number;
    por_grupo: Record<string, number>;
    /** Casos abertos sem nenhum vencimento cadastrado (nem parcela nem cobrança): a prescrição não pode ser avaliada neles. */
    casos_sem_vencimento: number;
  };
  fila: (ItemAgente & { grupo: Tarefa["g"]; prioridade: Tarefa["p"]; titulo: string; descricao: string })[];
  atencao_prescricao: (ItemAgente & { vencimento_mais_antigo: string; anos: number; fonte: "parcela" | "cobranca" })[];
  acordo_em_atraso: (ItemAgente & { parcelas_vencidas: number; valor_vencido: number | null; vencimento_mais_antigo: string; fonte: "parcelas" | "asaas" | "ambos" | "cadastro" })[];
  propostas_aguardando_cliente: (ItemAgente & { proposta_total: number; enviada_em: string; dias: number })[];
};

const valorDe = (c: Caso) => c.valor_atualizado ?? c.valor_original ?? null;

function item(c: Caso, clientes: Record<string, Cliente>, hoje: string): ItemAgente {
  return {
    caso_id: c.id,
    cliente: clientes[c.cliente_id]?.nome_curto ?? c.cliente_id,
    devedor: c.devedor,
    valor: valorDe(c),
    fase: c.fase,
    responsavel: c.responsavel,
    proxima_data: c.proxima_data,
    dias_sem_movimento: diffDias(hoje, c.ultima_mov_em.slice(0, 10)),
  };
}

const porValor = <T extends { valor: number | null; dias_sem_movimento: number }>(a: T, b: T) =>
  (b.valor ?? 0) - (a.valor ?? 0) || b.dias_sem_movimento - a.dias_sem_movimento;

type Vencimento = { caso_id: string; vencimento: string; valor: number; fonte: "parcela" | "cobranca" };

export function leituraAgente(
  casos: Caso[],
  clientes: Record<string, Cliente>,
  parcelas: Parcela[],
  propostas: Proposta[],
  hoje: string,
  cobrancas: Cobranca[] = [],
): Leitura {
  const abertos = casos.filter(isAberto);
  const porId = new Map(abertos.map((c) => [c.id, c]));

  const tarefas = montaFila(abertos, clientes, hoje);
  const fila = tarefas
    .map((t) => ({ ...item(t.caso, clientes, hoje), grupo: t.g, prioridade: t.p, titulo: t.titulo, descricao: t.descricao }))
    .sort(porValor);
  const por_grupo: Record<string, number> = {};
  for (const t of tarefas) por_grupo[t.g] = (por_grupo[t.g] ?? 0) + 1;

  // Casos com algum vencimento cadastrado (aberto ou não): o resto não tem como ser avaliado para prescrição.
  const comVencimento = new Set<string>();
  // Vencimentos em aberto, por caso aberto.
  const emAberto = new Map<string, Vencimento[]>();
  const anotar = (v: Vencimento) => (emAberto.get(v.caso_id) ?? emAberto.set(v.caso_id, []).get(v.caso_id)!).push(v);
  for (const p of parcelas) {
    if (!porId.has(p.caso_id)) continue;
    comVencimento.add(p.caso_id);
    if (!p.paga && !p.retirada_em) anotar({ caso_id: p.caso_id, vencimento: p.vencimento, valor: p.valor, fonte: "parcela" });
  }
  for (const c of cobrancas) {
    if (!porId.has(c.caso_id)) continue;
    comVencimento.add(c.caso_id);
    if (cobrancaEmAberto(c)) anotar({ caso_id: c.caso_id, vencimento: c.vencimento, valor: c.valor, fonte: "cobranca" });
  }

  const limitePrescricao = addDias(hoje, -DIAS_ATENCAO_PRESCRICAO);
  const atencao_prescricao: Leitura["atencao_prescricao"] = [];
  const acordo_em_atraso: Leitura["acordo_em_atraso"] = [];
  for (const [casoId, vs] of emAberto) {
    const c = porId.get(casoId)!;
    const maisAntigo = vs.reduce((m, v) => (v.vencimento < m.vencimento ? v : m), vs[0]);
    if (maisAntigo.vencimento <= limitePrescricao && c.exc_tipo !== "prescrito") {
      atencao_prescricao.push({
        ...item(c, clientes, hoje),
        vencimento_mais_antigo: maisAntigo.vencimento,
        anos: Math.floor(diffDias(hoje, maisAntigo.vencimento) / 365.25),
        fonte: maisAntigo.fonte,
      });
    }
    // Acordo: parcelas do acordo (Asaas) vencidas, em qualquer fase aberta; parcelas importadas só contam na fase "acordo".
    const vencidas = vs.filter((v) => v.vencimento < hoje && (v.fonte === "cobranca" || c.fase === "acordo"));
    if (vencidas.length && (c.fase === "acordo" || vencidas.some((v) => v.fonte === "cobranca"))) {
      const fontes = new Set(vencidas.map((v) => v.fonte));
      acordo_em_atraso.push({
        ...item(c, clientes, hoje),
        parcelas_vencidas: vencidas.length,
        valor_vencido: Math.round(vencidas.reduce((s, v) => s + v.valor, 0) * 100) / 100,
        vencimento_mais_antigo: vencidas.reduce((m, v) => (v.vencimento < m ? v.vencimento : m), vencidas[0].vencimento),
        fonte: fontes.size === 2 ? "ambos" : fontes.has("cobranca") ? "asaas" : "parcelas",
      });
    }
  }

  // Terceira fonte: o acordo anotado no próprio caso ({parc, paid, next}), que é o que a mesa preenche no dia a dia.
  const jaListados = new Set(acordo_em_atraso.map((a) => a.caso_id));
  for (const c of abertos) {
    const a = c.acordo;
    if (c.fase !== "acordo" || !a?.next || jaListados.has(c.id)) continue;
    if (a.next < hoje && (a.paid ?? 0) < (a.parc ?? 0)) {
      acordo_em_atraso.push({
        ...item(c, clientes, hoje),
        parcelas_vencidas: 1,
        valor_vencido: null,
        vencimento_mais_antigo: a.next,
        fonte: "cadastro",
      });
    }
  }

  const propostas_aguardando_cliente = propostas
    .filter((p) => p.status === "pending" && p.fora_alcada && porId.has(p.caso_id))
    .map((p) => ({
      ...item(porId.get(p.caso_id)!, clientes, hoje),
      proposta_total: p.total,
      enviada_em: p.enviada_em.slice(0, 10),
      dias: diffDias(hoje, p.enviada_em.slice(0, 10)),
    }));

  return {
    hoje,
    resumo: {
      casos_abertos: abertos.length,
      valor_aberto: Math.round(abertos.reduce((s, c) => s + (valorDe(c) ?? 0), 0) * 100) / 100,
      tarefas: tarefas.length,
      por_grupo,
      casos_sem_vencimento: abertos.filter((c) => !comVencimento.has(c.id)).length,
    },
    fila,
    atencao_prescricao: atencao_prescricao.sort(porValor),
    acordo_em_atraso: acordo_em_atraso.sort(porValor),
    propostas_aguardando_cliente: propostas_aguardando_cliente.sort((a, b) => b.dias - a.dias),
  };
}
