/** Tipos de domínio. Espelham o schema em supabase/migrations/0001_init.sql. */

export type Fase =
  | "regua"
  | "neg"
  | "acordo"
  | "quebra"
  | "analise"
  | "protesto"
  | "judicial"
  | "confirma"
  | "pago"
  | "devolvido";

export type TipoFollowup = "notif" | "promessa" | "recontatar" | "acordo" | "judicial" | "decidir";
export type TipoExcecao = "nao_cobrar" | "sem_contrato" | "aguardando" | "negociando" | "contestacao" | "prescrito";
export type Papel = "admin" | "operador" | "cliente";

export const FASES: Record<Fase, { label: string; fonte: string }> = {
  regua: { label: "Régua automática", fonte: "Asaas" },
  neg: { label: "Em negociação", fonte: "Mesa" },
  acordo: { label: "Acordo em pagamento", fonte: "Mesa" },
  quebra: { label: "Acordo quebrado", fonte: "Mesa" },
  analise: { label: "Análise para judicializar", fonte: "Mesa" },
  protesto: { label: "Protestado", fonte: "CENPROT" },
  judicial: { label: "Judicial", fonte: "Astrea" },
  confirma: { label: "Pagamento a confirmar", fonte: "Portal" },
  pago: { label: "Pago", fonte: "Asaas" },
  devolvido: { label: "Devolvido / arquivado", fonte: "Mesa" },
};
export const FASES_ABERTAS: Fase[] = ["regua", "neg", "acordo", "quebra", "analise", "protesto", "judicial", "confirma"];
export const FASES_FECHADAS: Fase[] = ["pago", "devolvido"];

export const FOLLOWUPS: Record<TipoFollowup, string> = {
  notif: "Fim do prazo da notificação",
  promessa: "Promessa de pagamento",
  recontatar: "Recontatar",
  acordo: "Retorno sobre acordo",
  judicial: "Prazo judicial",
  decidir: "Decisão interna",
};

export const EXCECOES: Record<TipoExcecao, string> = {
  nao_cobrar: "Não cobrar",
  sem_contrato: "Não cobrar: sem contrato",
  aguardando: "Aguardando orientação do cliente",
  negociando: "Cliente negociando diretamente",
  contestacao: "Dívida contestada",
  prescrito: "Possível prescrição",
};

export type ReguaItem = { chave: string; rotulo: string; dias: number; nota: string; ordem: number };

export type Cliente = {
  id: string;
  nome: string;
  nome_curto: string;
  tipo: "escola" | "contab" | "b2b" | "assoc";
  limites: { desc: number; parc: number; ent: number; min: number };
  honorarios: { extra: number; jud: number };
  protesto_dias: number;
  contato: string | null;
  ativo: boolean;
};

export type Caso = {
  id: string;
  cliente_id: string;
  devedor: string;
  documento: string | null;
  documento_digits: string;
  referencia: string;
  detalhe: string | null;
  valor_original: number | null;
  valor_atualizado: number | null;
  valor_fonte: string | null;
  fase: Fase;
  fase_nota: string | null;
  responsavel: string | null;
  proxima_data: string | null; // ISO date
  proxima_tipo: TipoFollowup | null;
  proxima_nota: string | null;
  proxima_auto: boolean;
  exc_tipo: TipoExcecao | null;
  exc_motivo: string | null;
  exc_desde: string | null;
  exc_revisao: string | null;
  telefone: string | null;
  email: string | null;
  processo: string | null;
  acordo: { parc: number; paid: number; next: string } | null;
  origem: { trello_url?: string; trello_list?: string; etiquetas?: string[] } | null;
  pendencias: string[];
  entrada_em: string;
  ultima_mov_em: string;
  encerrado_em: string | null;
};

export type Evento = {
  id: string;
  caso_id: string;
  data: string;
  autor: string;
  tipo: string;
  texto: string;
  visivel_cliente: boolean;
};

export type Parcela = {
  id: string;
  caso_id: string;
  referencia: string;
  competencia: string | null;
  valor: number;
  vencimento: string;
  paga: boolean;
};

export type Proposta = {
  id: string;
  caso_id: string;
  desconto_pct: number;
  parcelas: number;
  entrada_pct: number;
  total: number;
  nota: string | null;
  fora_alcada: boolean;
  status: "pending" | "approved" | "rejected" | "closed";
  enviada_em: string;
};

export const EQUIPE = ["Ana Paula", "Letícia", "Jaqueline", "Lucas", "Marden"] as const;

export const isAberto = (c: Pick<Caso, "fase">) => !FASES_FECHADAS.includes(c.fase);
