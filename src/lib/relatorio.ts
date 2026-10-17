import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/domain/datas";
import { montaRelatorio, type DadosRelatorio } from "@/lib/domain/relatorio";
import type { Caso, Cobranca, Evento } from "@/lib/domain/types";

/** Carrega tudo de um cliente e monta o relatório do mês. Passa pelo RLS do usuário logado. */
export async function dadosRelatorio(clienteId: string, mes: string): Promise<{ dados: DadosRelatorio; casos: Caso[] }> {
  const sb = await supabaseServer();
  const { data: casos, error } = await sb.from("casos").select("*").eq("cliente_id", clienteId).limit(5000);
  if (error) throw error;
  const lista = (casos ?? []) as Caso[];
  const ids = lista.map((c) => c.id);
  const inicio = `${mes}-01T00:00:00`;
  const fim = `${mes}-31T23:59:59`;
  let eventos: Evento[] = [];
  let cobrancas: Cobranca[] = [];
  if (ids.length) {
    const [ev, cb] = await Promise.all([
      sb.from("eventos").select("*").in("caso_id", ids).gte("data", inicio).lte("data", fim).order("data", { ascending: false }).limit(3000),
      sb.from("cobrancas").select("*").in("caso_id", ids).limit(3000),
    ]);
    eventos = (ev.data ?? []) as Evento[];
    cobrancas = (cb.data ?? []) as Cobranca[];
  }
  return { dados: montaRelatorio(mes, lista, eventos, cobrancas, hojeISO()), casos: lista };
}

export const mesValido = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
