import { diffDias } from "./datas";
import { EXCECOES, FOLLOWUPS, isAberto, type Caso, type Cliente } from "./types";

export type Prioridade = "alta" | "media" | "baixa";
export type Grupo = "agenda" | "conferir" | "negociar" | "decidir" | "aguardar" | "completar";

export type Tarefa = {
  caso: Caso;
  cliente: string;
  p: Prioridade;
  g: Grupo;
  titulo: string;
  descricao: string;
};

export const GRUPOS: { g: Grupo; label: string; dica: string }[] = [
  { g: "agenda", label: "Follow-ups de hoje e atrasados", dica: "Vêm da agenda. Registre a ação e o caso pula para a próxima data." },
  { g: "conferir", label: "Conferir pagamentos", dica: "Dinheiro parado por falta de baixa é o erro mais caro da mesa." },
  { g: "negociar", label: "Negociar", dica: "Casos que precisam de contato humano hoje." },
  { g: "decidir", label: "Decidir próximo passo", dica: "Protesto, judicial, devolução ou nova rodada." },
  { g: "aguardar", label: "Aguardando o cliente", dica: "Nada a fazer além de lembrar. O cliente decide no portal." },
  { g: "completar", label: "Completar cadastro", dica: "Sem valor, sem documento ou sem próxima ação: o sistema não deixa esquecer." },
];

/** Monta a fila do dia a partir das regras. Puro: recebe casos e devolve tarefas. */
export function montaFila(casos: Caso[], clientes: Record<string, Cliente>, hoje: string): Tarefa[] {
  const tarefas: Tarefa[] = [];
  for (const c of casos) {
    if (!isAberto(c)) continue;
    const cli = clientes[c.cliente_id];
    const base = { caso: c, cliente: cli?.nome_curto ?? c.cliente_id };
    const parado = diffDias(hoje, c.ultima_mov_em.slice(0, 10));

    if (c.exc_tipo) {
      if (c.proxima_data && c.proxima_data <= hoje) {
        tarefas.push({ ...base, p: "media", g: "decidir", titulo: `Revisar exceção: ${EXCECOES[c.exc_tipo]}`, descricao: `Régua pausada desde ${c.exc_desde}${c.exc_motivo ? " · " + c.exc_motivo : ""}. Manter a exceção ou retomar a cobrança?` });
      }
      continue;
    }
    if (!c.proxima_data || !c.proxima_tipo) {
      tarefas.push({ ...base, p: "alta", g: "completar", titulo: "Sem próxima ação definida", descricao: "Nenhum caso aberto pode ficar sem responsável, ação e data." });
      continue;
    }
    if (c.proxima_data <= hoje) {
      const atraso = diffDias(hoje, c.proxima_data);
      tarefas.push({ ...base, p: atraso > 0 ? "alta" : "media", g: "agenda", titulo: (atraso > 0 ? `Atrasado ${atraso} ${atraso === 1 ? "dia" : "dias"}: ` : "Hoje: ") + (c.proxima_nota ?? ""), descricao: `${FOLLOWUPS[c.proxima_tipo]} marcado para ${c.proxima_data.split("-").reverse().join("/")}. ${c.fase_nota ?? ""}` });
      continue;
    }
    if (c.fase === "confirma") tarefas.push({ ...base, p: "alta", g: "conferir", titulo: "Conferir pagamento informado", descricao: "Cliente diz que recebeu direto. Conferir no extrato e encerrar ou retomar." });
    else if (c.fase === "quebra") tarefas.push({ ...base, p: "alta", g: "decidir", titulo: "Acordo quebrado: renegociar ou protestar", descricao: `Última movimentação há ${parado} dias.` });
    else if (c.fase === "neg" && c.valor_atualizado == null) tarefas.push({ ...base, p: "media", g: "completar", titulo: "Sem valor no caso: levantar a dívida", descricao: `Não dá para notificar nem propor acordo sem o valor.${!c.documento_digits ? " Também falta CPF/CNPJ." : ""}` });
    else if (c.fase === "analise" && parado >= 90) tarefas.push({ ...base, p: "alta", g: "decidir", titulo: "Decidir: judicializar ou devolver", descricao: `Parado na análise há ${parado} dias.${!c.documento_digits ? " Falta CPF/CNPJ para a inicial." : ""}` });
    if (c.fase !== "analise" && !c.documento_digits && c.valor_atualizado != null) tarefas.push({ ...base, p: "baixa", g: "completar", titulo: "Sem CPF/CNPJ: completar cadastro", descricao: "Protesto e negativação exigem o documento do devedor." });
  }
  const P: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 };
  return tarefas.sort((a, b) => P[a.p] - P[b.p] || (b.caso.valor_atualizado ?? 0) - (a.caso.valor_atualizado ?? 0));
}
