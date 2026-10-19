"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigeAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

/** Liga ou pausa a régua automática. Só admin. Fica registrado quem mexeu e quando. */
export async function alternarRegua(fd: FormData) {
  const u = await exigeAdmin();
  const pausar = String(fd.get("acao")) === "pausar";
  const voltar = String(fd.get("voltar") || "/painel");
  const sb = await supabaseServer();
  const { error } = await sb.from("configuracoes").upsert({ chave: "regua_pausada", valor: pausar, atualizado_por: u.nome, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
  revalidatePath("/", "layout");
  if (error) redirect(`${voltar}?erro=${encodeURIComponent(`Não foi possível gravar: ${error.message}. A migration 0009 foi aplicada?`)}`);
  redirect(`${voltar}?ok=${encodeURIComponent(pausar ? "Régua automática pausada. Nenhum lembrete sai sozinho até alguém ligar de novo." : "Régua automática ligada. Lembretes saem nos dias úteis às 9h.")}`);
}
