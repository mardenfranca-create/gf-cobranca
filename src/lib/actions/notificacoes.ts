"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigeEquipe } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/domain/datas";
import { colunasProxima, marca } from "@/lib/domain/regua";
import { normalizaCelular } from "@/lib/domain/whatsapp";
import { aplicaAssinatura, minutaNotificacao, TEMPLATE_NOTIFICACAO, CANAIS, type Notificacao } from "@/lib/domain/notificacao";
import { enviaTemplateDocumento, WhatsAppError } from "@/lib/whatsapp";
import type { Caso, Cliente, Parcela } from "@/lib/domain/types";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const volta = (id: string, msg: string, ok: boolean): never => redirect(`/notificacoes/${id}?${ok ? "ok" : "erro"}=${encodeURIComponent(msg)}`);

/** Gera a minuta a partir do caso e manda para a fila de revisão do advogado escolhido. */
export async function gerarNotificacao(fd: FormData) {
  const casoId = s(fd, "caso_id");
  const revisor = s(fd, "revisor") || null;
  const prazo = Math.min(60, Math.max(3, Number(s(fd, "prazo_dias")) || 10));
  const u = await exigeEquipe();
  const sb = await supabaseServer();
  const [{ data: caso }, { data: parcelas }] = await Promise.all([sb.from("casos").select("*").eq("id", casoId).single(), sb.from("parcelas").select("*").eq("caso_id", casoId).order("vencimento")]);
  if (!caso) throw new Error("Caso não encontrado");
  const { data: cliente } = await sb.from("clientes").select("*").eq("id", caso.cliente_id).single();
  if (!cliente) throw new Error("Cliente não encontrado");
  const m = minutaNotificacao({ caso: caso as Caso, cliente: cliente as Cliente, parcelas: (parcelas ?? []) as Parcela[], prazoDias: prazo, hoje: hojeISO() });
  const { data: n, error } = await sb.from("notificacoes").insert({ caso_id: casoId, titulo: m.titulo, corpo: m.corpo, prazo_dias: prazo, revisor, gerada_por: u.nome, status: "minuta" }).select("id").single();
  if (error || !n) redirect(`/casos/${casoId}?erro=${encodeURIComponent(`Não foi possível gerar: ${error?.message ?? "?"}. A migration 0010 foi aplicada?`)}`);
  await sb.from("eventos").insert({ caso_id: casoId, autor: u.nome, autor_id: u.id, tipo: "notificacao", texto: `Minuta de notificação extrajudicial gerada${revisor ? ` para revisão de ${revisor}` : ""} (prazo ${prazo} dias).`, visivel_cliente: false });
  revalidatePath("/", "layout");
  redirect(`/notificacoes/${n.id}?ok=${encodeURIComponent("Minuta gerada. Revise o texto, preencha a assinatura e aprove.")}`);
}

/** Salva edições do advogado (texto, prazo, assinatura, revisor). */
export async function salvarNotificacao(fd: FormData) {
  const id = s(fd, "id");
  const u = await exigeEquipe();
  const sb = await supabaseServer();
  const { data: n } = await sb.from("notificacoes").select("status").eq("id", id).single();
  if (!n) throw new Error("Notificação não encontrada");
  if (n.status === "enviada" || n.status === "cancelada") volta(id, "Notificação já enviada ou cancelada: não dá para editar.", false);
  const corpo = s(fd, "corpo");
  if (corpo.length < 200) volta(id, "O texto ficou curto demais.", false);
  const patch = { titulo: s(fd, "titulo") || undefined, corpo, prazo_dias: Math.min(60, Math.max(3, Number(s(fd, "prazo_dias")) || 10)), advogado: s(fd, "advogado") || null, oab: s(fd, "oab") || null, revisor: s(fd, "revisor") || null, status: "minuta" as const, aprovada_por: null, aprovada_em: null };
  const { error } = await sb.from("notificacoes").update(patch).eq("id", id);
  if (error) volta(id, error.message, false);
  revalidatePath("/", "layout");
  volta(id, `Salvo por ${u.nome}. Ainda como minuta: aprove quando estiver pronta.`, true);
}

/** Aprova o texto (fica pronta para envio). Exige assinatura preenchida e sem colchetes pendentes. */
export async function aprovarNotificacao(fd: FormData) {
  const id = s(fd, "id");
  const u = await exigeEquipe();
  const sb = await supabaseServer();
  const { data: n } = await sb.from("notificacoes").select("*").eq("id", id).single();
  if (!n) throw new Error("Notificação não encontrada");
  const nn = n as Notificacao;
  if (nn.status !== "minuta") volta(id, "Só minutas podem ser aprovadas.", false);
  if (!nn.advogado) volta(id, "Preencha o nome do advogado que assina antes de aprovar.", false);
  const texto = aplicaAssinatura(nn.corpo, nn.advogado, nn.oab);
  if (/\[[^\]]+\]/.test(texto)) volta(id, "Ainda há campos entre colchetes no texto. Complete ou remova antes de aprovar.", false);
  await sb.from("notificacoes").update({ status: "aprovada", aprovada_por: u.nome, aprovada_em: new Date().toISOString() }).eq("id", id);
  await sb.from("eventos").insert({ caso_id: nn.caso_id, autor: u.nome, autor_id: u.id, tipo: "notificacao", texto: `Notificação extrajudicial aprovada por ${u.nome}${nn.advogado ? ` (assina ${nn.advogado})` : ""}.`, visivel_cliente: false });
  revalidatePath("/", "layout");
  volta(id, "Aprovada. Agora escolha como enviar.", true);
}

async function marcaEnviada(sb: Awaited<ReturnType<typeof supabaseServer>>, n: Notificacao, u: { nome: string; id: string }, canal: string, rastreio: string | null) {
  const hoje = hojeISO();
  await sb.from("notificacoes").update({ status: "enviada", enviada_por: u.nome, enviada_em: new Date().toISOString(), canal, rastreio }).eq("id", n.id);
  await sb.from("eventos").insert({ caso_id: n.caso_id, autor: u.nome, autor_id: u.id, tipo: "notificacao", texto: `Notificação extrajudicial enviada por ${CANAIS[canal] ?? canal}${rastreio ? ` (${rastreio})` : ""}. Prazo de ${n.prazo_dias} dias para regularização.`, visivel_cliente: true });
  await sb.from("casos").update({ fase_nota: "Notificado extrajudicialmente", ...colunasProxima(marca(hoje, n.prazo_dias, "notif", "Fim do prazo da notificação extrajudicial")), ultima_mov_em: new Date().toISOString() }).eq("id", n.caso_id);
}

/** Envia a notificação em PDF pelo WhatsApp (modelo gf_notificacao com cabeçalho de documento). */
export async function enviarNotificacaoWhatsApp(fd: FormData) {
  const id = s(fd, "id");
  const u = await exigeEquipe();
  const sb = await supabaseServer();
  const { data: n } = await sb.from("notificacoes").select("*").eq("id", id).single();
  if (!n) throw new Error("Notificação não encontrada");
  const nn = n as Notificacao;
  if (nn.status !== "aprovada") volta(id, "Aprove a notificação antes de enviar.", false);
  const { data: caso } = await sb.from("casos").select("*").eq("id", nn.caso_id).single();
  const { data: cliente } = await sb.from("clientes").select("*").eq("id", caso!.cliente_id).single();
  const to = normalizaCelular(caso!.telefone);
  if (!to) volta(id, "O caso não tem celular válido com DDD.", false);
  if (caso!.wa_optout) volta(id, "O devedor pediu SAIR: não envie por WhatsApp. Use correio com AR.", false);
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.APP_URL ?? "").trim().replace(/\/+$/, "") || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (!base) volta(id, "Defina APP_URL na Vercel (ex.: https://gf-cobranca.vercel.app) para a Meta conseguir baixar o PDF.", false);
  const link = `${base}/api/notificacoes/${nn.id}/pdf?t=${nn.token}`;
  const params = TEMPLATE_NOTIFICACAO.params({ devedor: caso!.devedor, credor: (cliente as Cliente).nome, referencia: caso!.referencia, prazo: nn.prazo_dias });
  const texto = TEMPLATE_NOTIFICACAO.corpo.replace(/\{\{(\d+)\}\}/g, (_, i) => params[Number(i) - 1] ?? "");
  const { data: m } = await sb.from("mensagens").insert({ caso_id: nn.caso_id, direcao: "saida", telefone: to!, template: TEMPLATE_NOTIFICACAO.nome, texto: `${texto} [PDF: notificação extrajudicial]`, status: "queued", origem: "manual", criado_por: u.nome }).select("id").single();
  try {
    const waId = await enviaTemplateDocumento(to!, TEMPLATE_NOTIFICACAO.nome, params, { link, filename: `notificacao-${(caso!.devedor as string).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf` });
    if (m) await sb.from("mensagens").update({ wa_id: waId, status: "sent" }).eq("id", m.id);
    await marcaEnviada(sb, nn, u, "whatsapp", waId);
  } catch (e) {
    const msg = e instanceof WhatsAppError ? e.message : (e as Error).message;
    if (m) await sb.from("mensagens").update({ status: "failed", erro: msg }).eq("id", m.id);
    volta(id, `Não enviou: ${msg}${/template|modelo|132001|does not exist/i.test(msg) ? " · O modelo gf_notificacao precisa estar aprovado na Meta com cabeçalho de documento." : ""}`, false);
  }
  revalidatePath("/", "layout");
  volta(id, "Notificação enviada por WhatsApp. O caso ganhou prazo de resposta.", true);
}

/** Registra envio feito fora do sistema (correio com AR, e-mail, em mãos). */
export async function registrarEnvioNotificacao(fd: FormData) {
  const id = s(fd, "id");
  const canal = s(fd, "canal");
  const rastreio = s(fd, "rastreio") || null;
  const u = await exigeEquipe();
  if (!CANAIS[canal] || canal === "whatsapp") volta(id, "Escolha o canal.", false);
  const sb = await supabaseServer();
  const { data: n } = await sb.from("notificacoes").select("*").eq("id", id).single();
  if (!n) throw new Error("Notificação não encontrada");
  if ((n as Notificacao).status !== "aprovada") volta(id, "Aprove a notificação antes de registrar o envio.", false);
  await marcaEnviada(sb, n as Notificacao, u, canal, rastreio);
  revalidatePath("/", "layout");
  volta(id, `Envio registrado (${CANAIS[canal]}).`, true);
}

export async function cancelarNotificacao(fd: FormData) {
  const id = s(fd, "id");
  const u = await exigeEquipe();
  const sb = await supabaseServer();
  const { data: n } = await sb.from("notificacoes").select("caso_id, status").eq("id", id).single();
  if (!n) throw new Error("Notificação não encontrada");
  if (n.status === "enviada") volta(id, "Já enviada: não dá para cancelar.", false);
  await sb.from("notificacoes").update({ status: "cancelada" }).eq("id", id);
  await sb.from("eventos").insert({ caso_id: n.caso_id, autor: u.nome, autor_id: u.id, tipo: "notificacao", texto: "Minuta de notificação extrajudicial cancelada.", visivel_cliente: false });
  revalidatePath("/", "layout");
  redirect(`/notificacoes?ok=${encodeURIComponent("Minuta cancelada.")}`);
}
