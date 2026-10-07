"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function entrar(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const next = String(formData.get("next") ?? "/");
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) {
    // Mostra a causa real (chave errada, e-mail não confirmado, senha) para a equipe conseguir diagnosticar.
    const causa: Record<string, string> = {
      invalid_credentials: "E-mail ou senha incorretos.",
      email_not_confirmed: "E-mail ainda não confirmado. No Supabase, confirme o usuário (Authentication → Users).",
      user_not_found: "Usuário não cadastrado no Supabase.",
    };
    const msg = causa[error.code ?? ""] ?? `Falha na autenticação (${error.code ?? error.status ?? "?"}): ${error.message}`;
    redirect(`/login?erro=${encodeURIComponent(msg)}&next=${encodeURIComponent(next)}`);
  }
  redirect(next.startsWith("/") ? next : "/");
}

export async function sair() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}
