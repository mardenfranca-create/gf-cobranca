/**
 * Tipos do banco para o cliente Supabase. Mantidos à mão e espelhando as migrations.
 * Quando o schema crescer, gere com `supabase gen types typescript` e substitua este arquivo.
 */
import type { Caso, Cliente, Evento, Parcela, Proposta, ReguaItem, Papel } from "@/lib/domain/types";

type Perfil = { id: string; nome: string; papel: Papel; cliente_id: string | null; ativo: boolean; criado_em: string };
type Ajuste = { id: string; cliente_id: string; autor: string; autor_id: string | null; campo: string; antes: unknown; depois: unknown; criado_em: string };
type Importacao = { id: string; cliente_id: string | null; origem: string; arquivo: string; hash: string; linhas: number; resumo: Record<string, unknown>; criado_por: string; criado_em: string };

type Tabela<Row, Omitidas extends keyof Row = never> = {
  Row: Row;
  Insert: Omit<Partial<Row>, Omitidas>;
  Update: Omit<Partial<Row>, Omitidas>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      clientes: Tabela<Cliente & { criado_em: string }>;
      perfis: Tabela<Perfil>;
      regua: Tabela<ReguaItem>;
      casos: Tabela<Caso & { criado_em: string; atualizado_em: string }, "documento_digits">;
      parcelas: Tabela<Parcela & { paga_em: string | null; criado_em: string }>;
      eventos: Tabela<Evento & { autor_id: string | null; dados: Record<string, unknown> | null }>;
      propostas: Tabela<Proposta & { decidida_por: string | null; decidida_em: string | null }>;
      importacoes: Tabela<Importacao>;
      ajustes_cliente: Tabela<Ajuste>;
    };
    Views: Record<string, never>;
    Functions: {
      meu_papel: { Args: Record<string, never>; Returns: Papel };
      meu_cliente: { Args: Record<string, never>; Returns: string | null };
      e_equipe: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
};
