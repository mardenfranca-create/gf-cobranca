import { addDias, diffDias } from "./datas";
import { montaFila, type Tarefa } from "./fila";
import { isAberto, type Caso, type Cliente, type Parcela, type Proposta } from "./types";

/**
 * Leitura para o agente de Cobrança do OpenClaw (GET /api/agente/excecoes).
 * Puro: recebe o que a rota carregou do banco e devolve só o que exige atenção.
 * A fila vem de `montaFila` (a mesma da tela /fila), para o agente e a Ana verem a mesma coisa.
 */

/** Quatro anos (com um dia bissexto) a partir do vencimento: só sinaliza, não calcula prazo prescricional. */
export const DIAS_ATENCAO_PRESCRICAO = 4 * 365 + 1;

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
  resumo: { casos_abertos: number; valor_aberto: number; tarefas: number; por_grupo: Record<string, number> };
  fila: (ItemAgente & { grupo: Tarefa["g"]; prioridade: Tarefa["p"]; titulo: string; descricao: string })[];
  atencao_prescricao: (ItemAgente & { vencimento_mais_antigo: string; anos: number })[];
  acordo_em_atraso: (ItemAgente & { parcelas_vencidas: number; valor_vencido: number; vencimento_mais_antigo: string })[];
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

export function leituraAgente(
  casos: Caso[],
  clientes: Record<string, Cliente>,
  parcelas: Parcela[],
  propostas: Proposta[],
  hoje: string,
): Leitura {
  const abertos = casos.filter(isAberto);
  const porId = new Map(abertos.map((c) => [c.id, c]));

  const tarefas = montaFila(abertos, clientes, hoje);
  const fila = tarefas
    .map((t) => ({ ...item(t.caso, clientes, hoje), grupo: t.g, prioridade: t.p, titulo: t.titulo, descricao: t.descricao }))
    .sort(porValor);
  const por_grupo: Record<string, number> = {};
  for (const t of tarefas) por_grupo[t.g] = (por_grupo[t.g] ?? 0) + 1;

  // Parcelas em aberto (não pagas e não retiradas), agrupadas por caso aberto.
  const emAberto = new Map<string, Parcela[]>();
  for (const p of parcelas) {
    if (p.paga || p.retirada_em || !porId.has(p.caso_id)) continue;
    (emAberto.get(p.caso_id) ?? emAberto.set(p.caso_id, []).get(p.caso_id)!).push(p);
  }

  const limitePrescricao = addDias(hoje, -DIAS_ATENCAO_PRESCRICAO);
  const atencao_prescricao: Leitura["atencao_prescricao"] = [];
  const acordo_em_atraso: Leitura["acordo_em_atraso"] = [];
  for (const [casoId, ps] of emAberto) {
    const c = porId.get(casoId)!;
    const maisAntiga = ps.reduce((m, p) => (p.vencimento < m ? p.vencimento : m), ps[0].vencimento);
    if (maisAntiga <= limitePrescricao && c.exc_tipo !== "prescrito") {
      atencao_prescricao.push({
        ...item(c, clientes, hoje),
        vencimento_mais_antigo: maisAntiga,
        anos: Math.floor(diffDias(hoje, maisAntiga) / 365.25),
      });
    }
    if (c.fase === "acordo") {
      const vencidas = ps.filter((p) => p.vencimento < hoje);
      if (vencidas.length) {
        acordo_em_atraso.push({
          ...item(c, clientes, hoje),
          parcelas_vencidas: vencidas.length,
          valor_vencido: Math.round(vencidas.reduce((s, p) => s + p.valor, 0) * 100) / 100,
          vencimento_mais_antigo: vencidas.reduce((m, p) => (p.vencimento < m ? p.vencimento : m), vencidas[0].vencimento),
        });
      }
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
    },
    fila,
    atencao_prescricao: atencao_prescricao.sort(porValor),
    acordo_em_atraso: acordo_em_atraso.sort(porValor),
    propostas_aguardando_cliente: propostas_aguardando_cliente.sort((a, b) => b.dias - a.dias),
  };
}
