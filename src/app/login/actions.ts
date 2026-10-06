"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function entrar(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const next = String(formData.get("next") ?? "/");
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) redirect(`/login?erro=${encodeURIComponent("E-mail ou senha incorretos.")}&next=${encodeURIComponent(next)}`);
  redirect(next.startsWith("/") ? next : "/");
}

export async function sair() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}
