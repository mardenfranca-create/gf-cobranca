import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type EstadoRegua = { pausada: boolean; por: string | null; em: string | null; fonte: "banco" | "sem-tabela" };

/**
 * Pausa geral da régua automática, guardada no banco (tabela configuracoes, chave regua_pausada).
 * Fail-safe: se a tabela não existir ou a leitura falhar, considera PAUSADA. Nada sai sozinho por engano.
 */
export async function estadoRegua(sb: SupabaseClient<Database>): Promise<EstadoRegua> {
  const { data, error } = await sb.from("configuracoes").select("valor, atualizado_por, atualizado_em").eq("chave", "regua_pausada").maybeSingle();
  if (error || !data) return { pausada: true, por: null, em: null, fonte: "sem-tabela" };
  return { pausada: data.valor !== false, por: data.atualizado_por, em: data.atualizado_em, fonte: "banco" };
}
