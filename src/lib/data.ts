import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import type { Caso, Cliente, Evento, Parcela, Proposta, ReguaItem } from "@/lib/domain/types";

/** Leituras de dados da mesa. Todas passam pelo RLS do usuário logado. */

export async function listaClientes(): Promise<Cliente[]> {
  const sb = await supabaseServer();
  const { data, error } = await sb.from("clientes").select("*").eq("ativo", true).order("nome");
  if (error) throw error;
  return data as Cliente[];
}

export async function mapaClientes(): Promise<Record<string, Cliente>> {
  return Object.fromEntries((await listaClientes()).map((c) => [c.id, c]));
}

export async function listaRegua(): Promise<ReguaItem[]> {
  const sb = await supabaseServer();
  const { data, error } = await sb.from("regua").select("*").order("ordem");
  if (error) throw error;
  return data as ReguaItem[];
}

export async function listaCasos(filtro: { cliente?: string | null; abertos?: boolean } = {}): Promise<Caso[]> {
  const sb = await supabaseServer();
  let q = sb.from("casos").select("*").order("ultima_mov_em", { ascending: true });
  if (filtro.cliente) q = q.eq("cliente_id", filtro.cliente);
  if (filtro.abertos) q = q.not("fase", "in", "(pago,devolvido)");
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return data as Caso[];
}

export async function casoPorId(id: string): Promise<{ caso: Caso; eventos: Evento[]; parcelas: Parcela[]; propostas: Proposta[] } | null> {
  const sb = await supabaseServer();
  const { data: caso } = await sb.from("casos").select("*").eq("id", id).maybeSingle();
  if (!caso) return null;
  const [{ data: eventos }, { data: parcelas }, { data: propostas }] = await Promise.all([
    sb.from("eventos").select("*").eq("caso_id", id).order("data", { ascending: false }).limit(200),
    sb.from("parcelas").select("*").eq("caso_id", id).order("vencimento"),
    sb.from("propostas").select("*").eq("caso_id", id).order("enviada_em", { ascending: false }),
  ]);
  return { caso: caso as Caso, eventos: (eventos ?? []) as Evento[], parcelas: (parcelas ?? []) as Parcela[], propostas: (propostas ?? []) as Proposta[] };
}

export async function parcelasDosCasos(ids: string[]): Promise<Record<string, { referencia: string; vencimento: string }[]>> {
  if (!ids.length) return {};
  const sb = await supabaseServer();
  const { data } = await sb.from("parcelas").select("caso_id, referencia, vencimento").in("caso_id", ids);
  const out: Record<string, { referencia: string; vencimento: string }[]> = {};
  for (const p of data ?? []) (out[p.caso_id] ??= []).push({ referencia: p.referencia, vencimento: p.vencimento });
  return out;
}

export async function clientePorId(id: string): Promise<Cliente | null> {
  const sb = await supabaseServer();
  const { data } = await sb.from("clientes").select("*").eq("id", id).maybeSingle();
  return (data as Cliente | null) ?? null;
}

/** Propostas pendentes (fora da alçada) que esperam decisão do cliente. O RLS restringe à carteira do usuário. */
export async function propostasPendentes(cliente?: string | null): Promise<(Proposta & { caso: Caso })[]> {
  const sb = await supabaseServer();
  const { data, error } = await sb.from("propostas").select("*").eq("status", "pending").order("enviada_em", { ascending: true }).limit(500);
  if (error) throw error;
  const props = (data ?? []) as Proposta[];
  if (!props.length) return [];
  const { data: casos } = await sb.from("casos").select("*").in("id", props.map((p) => p.caso_id));
  const porId = Object.fromEntries(((casos ?? []) as Caso[]).map((c) => [c.id, c]));
  return props.map((p) => ({ ...p, caso: porId[p.caso_id] })).filter((p) => p.caso && (!cliente || p.caso.cliente_id === cliente));
}

/** Últimos eventos visíveis ao usuário (o RLS já filtra visivel_cliente para o cliente). */
export async function ultimosEventos(limite = 12): Promise<Evento[]> {
  const sb = await supabaseServer();
  const { data, error } = await sb.from("eventos").select("*").order("data", { ascending: false }).limit(limite);
  if (error) throw error;
  return (data ?? []) as Evento[];
}

export type Ajuste = { id: string; cliente_id: string; autor: string; campo: string; antes: unknown; depois: unknown; criado_em: string };
export async function listaAjustes(cliente_id: string, limite = 20): Promise<Ajuste[]> {
  const sb = await supabaseServer();
  const { data, error } = await sb.from("ajustes_cliente").select("*").eq("cliente_id", cliente_id).order("criado_em", { ascending: false }).limit(limite);
  if (error) {
    // Tabela ainda não criada (migration 0002 não aplicada): não derruba a página.
    if (/ajustes_cliente/.test(error.message)) return [];
    throw error;
  }
  return (data ?? []) as Ajuste[];
}
