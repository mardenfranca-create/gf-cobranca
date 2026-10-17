"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

/** Troca da própria senha. Vale para equipe e cliente: a sessão atual autoriza a mudança. */
export async function trocarSenha(fd: FormData) {
  const nova = String(fd.get("nova") ?? "");
  const conf = String(fd.get("confirma") ?? "");
  const voltar = String(fd.get("voltar") ?? "/");
  const erro = (m: string) => redirect(`/senha?erro=${encodeURIComponent(m)}&voltar=${encodeURIComponent(voltar)}`);
  if (nova.length < 8) erro("A senha precisa ter pelo menos 8 caracteres.");
  if (nova !== conf) erro("As duas senhas não conferem.");
  if (!/[a-zA-Z]/.test(nova) || !/\d/.test(nova)) erro("Use letras e números.");
  const sb = await supabaseServer();
  const { error } = await sb.auth.updateUser({ password: nova });
  if (error) erro(/same|different/i.test(error.message) ? "A nova senha precisa ser diferente da atual." : `Não foi possível trocar: ${error.message}`);
  redirect(`${voltar.startsWith("/") ? voltar : "/"}?ok=${encodeURIComponent("Senha alterada.")}`);
}
