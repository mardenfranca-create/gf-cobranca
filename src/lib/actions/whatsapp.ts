"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigeEquipe } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { enviaMensagemCaso } from "@/lib/whatsapp-envio";
import { enviaTexto, WhatsAppError } from "@/lib/whatsapp";
import { canonizaTelefone, normalizaCelular, variantesTelefone } from "@/lib/domain/whatsapp";
import { colunasProxima, marca } from "@/lib/domain/regua";
import { hojeISO } from "@/lib/domain/datas";
import { TEMPLATES } from "@/lib/domain/whatsapp";
import type { Caso, Cliente } from "@/lib/domain/types";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
/** Volta para o caso ou, quando a ação veio da caixa de entrada, para a conversa (campo `voltar`). */
const volta = (id: string, msg: string, ok: boolean, voltar = ""): never => {
  const base = voltar.startsWith("/") ? voltar : `/casos/${id}`;
  redirect(`${base}${base.includes("?") ? "&" : "?"}${ok ? "ok" : "erro"}=${encodeURIComponent(msg)}`);
};

/** Envio manual de um modelo aprovado, escolhido pela operadora. */
export async function enviarWhatsApp(fd: FormData) {
  const id = s(fd, "caso_id");
  const template = s(fd, "template");
  const voltar = s(fd, "voltar");
  const u = await exigeEquipe();
  const sb = await supabaseServer();
  const { data: caso } = await sb.from("casos").select("*").eq("id", id).single();
  if (!caso) throw new Error("Caso não encontrado");
  const { data: cliente } = await sb.from("clientes").select("*").eq("id", caso.cliente_id).single();
  if (!TEMPLATES[template]) volta(id, "Escolha um modelo.", false, voltar);
  let link: string | null = null, data: string | null = null;
  if (["gf_boleto", "gf_vencimento", "gf_acordo_quebrado"].includes(template)) {
    const { data: cob } = await sb.from("cobrancas").select("invoice_url, vencimento, valor").eq("caso_id", id).neq("status", "DELETED").not("status", "in", "(RECEIVED,CONFIRMED,RECEIVED_IN_CASH)").order("vencimento").limit(1).maybeSingle();
    if (!cob?.invoice_url) volta(id, "Este modelo precisa de uma cobrança em aberto no Asaas. Emita o boleto primeiro.", false, voltar);
    link = cob!.invoice_url; data = cob!.vencimento;
    const r = await enviaMensagemCaso(sb, caso as Caso, cliente as Cliente, template, { link, data, valor: cob!.valor }, "manual", u.nome);
    revalidatePath("/", "layout");
    volta(id, r.msg, r.ok, voltar);
  }
  const r = await enviaMensagemCaso(sb, caso as Caso, cliente as Cliente, template, {}, "manual", u.nome);
  revalidatePath("/", "layout");
  volta(id, r.msg, r.ok, voltar);
}

/** Liga/desliga o bloqueio de mensagens para o devedor (ele pediu SAIR, ou a equipe decidiu). */
export async function alternarOptOut(fd: FormData) {
  const id = s(fd, "caso_id");
  const voltar = s(fd, "voltar");
  const u = await exigeEquipe();
  const sb = await supabaseServer();
  const { data: caso } = await sb.from("casos").select("wa_optout").eq("id", id).single();
  if (!caso) throw new Error("Caso não encontrado");
  const novo = !caso.wa_optout;
  await sb.from("casos").update({ wa_optout: novo }).eq("id", id);
  await sb.from("eventos").insert({ caso_id: id, autor: u.nome, autor_id: u.id, tipo: "whatsapp", texto: novo ? "Mensagens automáticas de WhatsApp bloqueadas para este devedor." : "Mensagens de WhatsApp liberadas de novo para este devedor.", visivel_cliente: false });
  revalidatePath("/", "layout");
  volta(id, novo ? "WhatsApp bloqueado para este devedor." : "WhatsApp liberado.", true, voltar);
}

/** Resposta livre ao devedor, dentro da janela de 24h aberta pela mensagem dele. Vira mensagem + evento visível ao cliente. */
export async function responderWhatsApp(fd: FormData) {
  const id = s(fd, "caso_id");
  const texto = s(fd, "texto");
  const voltar = s(fd, "voltar");
  const u = await exigeEquipe();
  if (texto.length < 2) volta(id, "Escreva a resposta.", false, voltar);
  const sb = await supabaseServer();
  const { data: caso } = await sb.from("casos").select("*").eq("id", id).single();
  if (!caso) throw new Error("Caso não encontrado");
  const to = normalizaCelular(caso.telefone);
  if (!to) volta(id, "O caso não tem celular válido.", false, voltar);
  const { data: ultima } = await sb.from("mensagens").select("criado_em, telefone").eq("caso_id", id).eq("direcao", "entrada").order("criado_em", { ascending: false }).limit(1).maybeSingle();
  if (!ultima || Date.now() - new Date(ultima.criado_em).getTime() > 24 * 3600 * 1000) volta(id, "Fora da janela de 24h: o devedor precisa ter respondido nas últimas 24 horas. Use um modelo.", false, voltar);
  const destino = canonizaTelefone(ultima!.telefone || to!);
  const { data: m } = await sb.from("mensagens").insert({ caso_id: id, direcao: "saida", telefone: destino, template: null, texto, status: "queued", origem: "manual", criado_por: u.nome }).select("id").single();
  try {
    const waId = await enviaTexto(destino, texto);
    if (m) await sb.from("mensagens").update({ wa_id: waId, status: "sent" }).eq("id", m.id);
    await sb.from("eventos").insert({ caso_id: id, autor: u.nome, autor_id: u.id, tipo: "contato", texto: `WhatsApp (resposta): "${texto}"`, visivel_cliente: true, dados: { mensagem_id: m?.id, wa_id: waId } });
    await sb.from("casos").update({ ...colunasProxima(marca(hojeISO(), 2, "recontatar", "Acompanhar retorno do devedor no WhatsApp")), ultima_mov_em: new Date().toISOString() }).eq("id", id);
  } catch (e) {
    const msg = e instanceof WhatsAppError ? e.message : (e as Error).message;
    if (m) await sb.from("mensagens").update({ status: "failed", erro: msg }).eq("id", m.id);
    volta(id, msg, false, voltar);
  }
  // Responder marca como lidas as mensagens recebidas dessa conversa.
  await sb.from("mensagens").update({ lida_em: new Date().toISOString(), lida_por: u.nome }).in("telefone", variantesTelefone(destino)).eq("direcao", "entrada").is("lida_em", null);
  revalidatePath("/", "layout");
  volta(id, "Resposta enviada por WhatsApp.", true, voltar);
}

/** Marca como lidas as mensagens recebidas de um número (ao abrir a conversa na caixa de entrada). */
export async function marcarLidas(telefone: string) {
  const u = await exigeEquipe();
  const tel = telefone.replace(/\D/g, "");
  if (tel.length < 8) return;
  const sb = await supabaseServer();
  const { data } = await sb.from("mensagens").update({ lida_em: new Date().toISOString(), lida_por: u.nome }).in("telefone", variantesTelefone(tel)).eq("direcao", "entrada").is("lida_em", null).select("id");
  if (data?.length) revalidatePath("/", "layout");
}

/** Liga um número sem caso (mensagem chegou pelo webhook) a um caso escolhido pela operadora. */
export async function vincularNumero(fd: FormData) {
  const telefone = canonizaTelefone(s(fd, "telefone"));
  const casoId = s(fd, "caso_id");
  const u = await exigeEquipe();
  const voltar = `/whatsapp?c=${telefone}`;
  if (!casoId) redirect(`${voltar}&erro=${encodeURIComponent("Escolha o caso.")}`);
  const sb = await supabaseServer();
  const { data: caso } = await sb.from("casos").select("id, devedor, telefone").eq("id", casoId).maybeSingle();
  if (!caso) redirect(`${voltar}&erro=${encodeURIComponent("Caso não encontrado.")}`);
  const { data: movidas } = await sb.from("mensagens").update({ caso_id: casoId }).in("telefone", variantesTelefone(telefone)).is("caso_id", null).select("id");
  if (!caso!.telefone) await sb.from("casos").update({ telefone }).eq("id", casoId);
  await sb.from("eventos").insert({ caso_id: casoId, autor: u.nome, autor_id: u.id, tipo: "whatsapp", texto: `Número de WhatsApp ${telefone} vinculado ao caso (${movidas?.length ?? 0} ${movidas?.length === 1 ? "mensagem" : "mensagens"}).`, visivel_cliente: false });
  revalidatePath("/", "layout");
  redirect(`${voltar}&ok=${encodeURIComponent(`Número vinculado a ${caso!.devedor}.`)}`);
}
