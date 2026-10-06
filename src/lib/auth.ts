import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Papel } from "@/lib/domain/types";

export type Usuario = { id: string; email: string; nome: string; papel: Papel; cliente_id: string | null };

/** Camada de acesso: lê a sessão e o perfil. Toda página e ação começa aqui. */
export async function usuarioAtual(): Promise<Usuario | null> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await sb.from("perfis").select("nome, papel, cliente_id, ativo").eq("id", user.id).maybeSingle();
  if (!perfil || !perfil.ativo) return null;
  return { id: user.id, email: user.email ?? "", nome: perfil.nome, papel: perfil.papel, cliente_id: perfil.cliente_id };
}

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
