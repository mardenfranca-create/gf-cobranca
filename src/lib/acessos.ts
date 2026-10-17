import "server-only";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { supabaseAdmin } from "@/lib/supabase/server";

export type Acesso = Database["public"]["Tables"]["acessos"]["Row"];

/** Origem da requisição: IP, cidade (cabeçalhos da Vercel) e navegador. */
export async function origemRequisicao() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() || null;
  const cidade = [h.get("x-vercel-ip-city"), h.get("x-vercel-ip-country-region"), h.get("x-vercel-ip-country")]
    .filter(Boolean)
    .map((v) => decodeURIComponent(v as string))
    .join(" · ") || null;
  const user_agent = h.get("user-agent")?.slice(0, 300) ?? null;
  return { ip, cidade, user_agent };
}

/** Grava o acesso. Nunca derruba o login: qualquer falha aqui é engolida. */
export async function registraAcesso(
  sb: SupabaseClient<Database> | null,
  dados: { user_id: string | null; email: string; nome?: string | null; papel?: string | null; resultado: "ok" | "falha"; motivo?: string | null },
) {
  try {
    const origem = await origemRequisicao();
    const linha = { ...dados, nome: dados.nome ?? null, papel: dados.papel ?? null, motivo: dados.motivo ?? null, ...origem };
    // Login com sucesso: a própria sessão grava (RLS: user_id = auth.uid()). Falha: só a chave de serviço consegue.
    const cliente = dados.user_id && sb ? sb : supabaseAdmin();
    await cliente.from("acessos").insert(linha);
  } catch {
    // Sem chave de serviço ou migration 0005 ainda não aplicada: o login segue normalmente.
  }
}

/** Resumo legível do navegador/sistema a partir do user-agent. */
export function navegador(ua: string | null): string {
  if (!ua) return "—";
  const so = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const nav = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "navegador";
  return [nav, so].filter(Boolean).join(" · ");
}
