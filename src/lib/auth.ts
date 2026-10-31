import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Papel } from "@/lib/domain/types";

export type Usuario = { id: string; email: string; nome: string; papel: Papel; cliente_id: string | null };

/**
 * Camada de acesso: lê a sessão e o perfil. Toda página e ação começa aqui.
 * Uma vez por request (`cache`): layout e página que chamam juntos dividem a mesma leitura.
 * `getClaims()` confere a assinatura do token com a chave pública do projeto (ES256, guardada em memória),
 * sem ida ao servidor de Auth; o perfil `ativo` continua lido do banco a cada request, então desativar
 * alguém em /usuarios corta o acesso na hora.
 */
export const usuarioAtual = cache(async (): Promise<Usuario | null> => {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const { data: perfil } = await sb.from("perfis").select("nome, papel, cliente_id, ativo").eq("id", claims.sub).maybeSingle();
  if (!perfil || !perfil.ativo) return null;
  return { id: claims.sub, email: claims.email ?? "", nome: perfil.nome, papel: perfil.papel, cliente_id: perfil.cliente_id };
});

export async function exigeEquipe(): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  if (u.papel === "cliente") redirect("/portal");
  return u;
}

export async function exigeAdmin(): Promise<Usuario> {
  const u = await exigeEquipe();
  if (u.papel !== "admin") throw new Error("Só administradores podem fazer isso.");
  return u;
}

export async function exigeCliente(): Promise<Usuario & { cliente_id: string }> {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  if (u.papel !== "cliente" || !u.cliente_id) redirect("/fila");
  return u as Usuario & { cliente_id: string };
}
