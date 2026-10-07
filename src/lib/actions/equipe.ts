"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigeAdmin } from "@/lib/auth";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import type { Papel } from "@/lib/domain/types";

/**
 * Gestão de usuários pela mesa (só admin). Usa a chave de serviço no servidor para falar com o Auth do Supabase;
 * o perfil (nome, papel, cliente) nasce pelo gatilho `cria_perfil` e é reforçado aqui para não depender de metadata.
 */

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const volta = (msg: string, ok: boolean, senha?: string) => redirect(`/equipe?${ok ? "ok" : "erro"}=${encodeURIComponent(msg)}${senha ? `&senha=${encodeURIComponent(senha)}` : ""}`);

function senhaTemporaria() {
  const base = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return "GF-" + Array.from(bytes, (b) => base[b % base.length]).join("");
}

function admin() {
  try { return supabaseAdmin(); } catch { return null; }
}

export async function criarUsuario(fd: FormData) {
  await exigeAdmin();
  const nome = s(fd, "nome"), email = s(fd, "email").toLowerCase(), papel = s(fd, "papel") as Papel;
  const cliente_id = papel === "cliente" ? s(fd, "cliente_id") : null;
  if (!nome || !email.includes("@")) volta("Informe nome e e-mail válidos.", false);
  if (!["admin", "operador", "cliente"].includes(papel)) volta("Papel inválido.", false);
  if (papel === "cliente" && !cliente_id) volta("Usuário de cliente precisa da carteira.", false);
  const adm = admin();
  if (!adm) volta("SUPABASE_SERVICE_ROLE_KEY não está configurada na Vercel. Sem ela, crie o usuário em Authentication → Users no Supabase.", false);
  const senha = s(fd, "senha") || senhaTemporaria();
  const { data, error } = await adm!.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome, papel, cliente_id: cliente_id ?? "" } });
  if (error) volta(/already|exists|registered/i.test(error.message) ? `${email} já existe no Supabase. Use "Redefinir senha" ou ajuste o papel abaixo.` : `Supabase recusou: ${error.message}`, false);
  const { error: e2 } = await adm!.from("perfis").upsert({ id: data.user!.id, nome, papel, cliente_id, ativo: true }, { onConflict: "id" });
  if (e2) volta(`Usuário criado, mas o perfil falhou: ${e2.message}`, false);
  revalidatePath("/equipe");
  volta(`${nome} criado como ${papel}. Senha temporária abaixo: envie por um canal seguro e peça para trocar no primeiro acesso.`, true, senha);
}

export async function redefinirSenha(fd: FormData) {
  await exigeAdmin();
  const id = s(fd, "id");
  const adm = admin();
  if (!adm) volta("SUPABASE_SERVICE_ROLE_KEY não está configurada na Vercel.", false);
  const senha = senhaTemporaria();
  const { error } = await adm!.auth.admin.updateUserById(id, { password: senha });
  if (error) volta(`Supabase recusou: ${error.message}`, false);
  volta("Senha redefinida. Nova senha temporária abaixo.", true, senha);
}

export async function alterarPerfil(fd: FormData) {
  const u = await exigeAdmin();
  const id = s(fd, "id"), nome = s(fd, "nome"), papel = s(fd, "papel") as Papel, ativo = fd.get("ativo") === "on";
  const cliente_id = papel === "cliente" ? s(fd, "cliente_id") || null : null;
  if (id === u.id && (papel !== "admin" || !ativo)) volta("Você não pode rebaixar nem desativar o próprio usuário.", false);
  if (papel === "cliente" && !cliente_id) volta("Usuário de cliente precisa da carteira.", false);
  const sb = await supabaseServer();
  const { error } = await sb.from("perfis").update({ nome, papel, cliente_id, ativo }).eq("id", id);
  if (error) volta(error.message, false);
  revalidatePath("/", "layout");
  volta(`${nome}: ${ativo ? papel : "desativado"}.`, true);
}
