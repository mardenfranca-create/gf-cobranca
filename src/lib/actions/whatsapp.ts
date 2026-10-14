"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigeEquipe } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { enviaMensagemCaso } from "@/lib/whatsapp-envio";
import { TEMPLATES } from "@/lib/domain/whatsapp";
import type { Caso, Cliente } from "@/lib/domain/types";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const volta = (id: string, msg: string, ok: boolean) => redirect(`/casos/${id}?${ok ? "ok" : "erro"}=${encodeURIComponent(msg)}`);

/** Envio manual de um modelo aprovado, escolhido pela operadora. */
export async function enviarWhatsApp(fd: FormData) {
  const id = s(fd, "caso_id");
  const template = s(fd, "template");
  const u = await exigeEquipe();
  const sb = await supabaseServer();
  const { data: caso } = await sb.from("casos").select("*").eq("id", id).single();
  if (!caso) throw new Error("Caso não encontrado");
  const { data: cliente } = await sb.from("clientes").select("*").eq("id", caso.cliente_id).single();
  if (!TEMPLATES[template]) volta(id, "Escolha um modelo.", false);
  let link: string | null = null, data: string | null = null;
  if (["gf_boleto", "gf_vencimento", "gf_acordo_quebrado"].includes(template)) {
    const { data: cob } = await sb.from("cobrancas").select("invoice_url, vencimento, valor").eq("caso_id", id).neq("status", "DELETED").not("status", "in", "(RECEIVED,CONFIRMED,RECEIVED_IN_CASH)").order("vencimento").limit(1).maybeSingle();
    if (!cob?.invoice_url) volta(id, "Este modelo precisa de uma cobrança em aberto no Asaas. Emita o boleto primeiro.", false);
    link = cob!.invoice_url; data = cob!.vencimento;
    const r = await enviaMensagemCaso(sb, caso as Caso, cliente as Cliente, template, { link, data, valor: cob!.valor }, "manual", u.nome);
    revalidatePath("/", "layout");
    volta(id, r.msg, r.ok);
  }
  const r = await enviaMensagemCaso(sb, caso as Caso, cliente as Cliente, template, {}, "manual", u.nome);
  revalidatePath("/", "layout");
  volta(id, r.msg, r.ok);
}

/** Liga/desliga o bloqueio de mensagens para o devedor (ele pediu SAIR, ou a equipe decidiu). */
export async function alternarOptOut(fd: FormData) {
  const id = s(fd, "caso_id");
  const u = await exigeEquipe();
  const sb = await supabaseServer();
  const { data: caso } = await sb.from("casos").select("wa_optout").eq("id", id).single();
  if (!caso) throw new Error("Caso não encontrado");
  const novo = !caso.wa_optout;
  await sb.from("casos").update({ wa_optout: novo }).eq("id", id);
  await sb.from("eventos").insert({ caso_id: id, autor: u.nome, autor_id: u.id, tipo: "whatsapp", texto: novo ? "Mensagens automáticas de WhatsApp bloqueadas para este devedor." : "Mensagens de WhatsApp liberadas de novo para este devedor.", visivel_cliente: false });
  revalidatePath("/", "layout");
  volta(id, novo ? "WhatsApp bloqueado para este devedor." : "WhatsApp liberado.", true);
}
