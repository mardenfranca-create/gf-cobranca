import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { enviaTemplate, whatsappEnv, WhatsAppError } from "@/lib/whatsapp";
import { normalizaCelular, renderiza, TEMPLATES, type DadosMensagem } from "@/lib/domain/whatsapp";
import type { Caso, Cliente } from "@/lib/domain/types";

type SB = SupabaseClient<Database>;

/**
 * Envia um modelo aprovado para o devedor de um caso e deixa rastro: linha em `mensagens` + evento no histórico.
 * Nunca lança por falha da Meta: grava status "failed" com o erro e devolve ok=false, para a mesa decidir.
 */
export async function enviaMensagemCaso(sb: SB, caso: Pick<Caso, "id" | "devedor" | "telefone" | "wa_optout" | "referencia" | "valor_atualizado">, cliente: Pick<Cliente, "nome_curto">, templateNome: string, extra: Partial<DadosMensagem>, origem: string, autor: string): Promise<{ ok: boolean; msg: string }> {
  const t = TEMPLATES[templateNome];
  if (!t) return { ok: false, msg: `Modelo desconhecido: ${templateNome}` };
  const to = normalizaCelular(caso.telefone);
  if (!to) return { ok: false, msg: "O caso não tem celular válido com DDD." };
  if (caso.wa_optout) return { ok: false, msg: "O devedor pediu para não receber mensagens (SAIR)." };
  const dados: DadosMensagem = { devedor: caso.devedor, credor: cliente.nome_curto, valor: caso.valor_atualizado, referencia: caso.referencia, ...extra };
  const texto = renderiza(t, dados);
  const { data: m, error } = await sb.from("mensagens").insert({ caso_id: caso.id, direcao: "saida", telefone: to, template: t.nome, texto, status: "queued", origem, criado_por: autor }).select("id").single();
  if (error || !m) return { ok: false, msg: error?.message ?? "Falha ao registrar a mensagem." };
  try {
    const waId = await enviaTemplate(to, t.nome, t.params(dados));
    await sb.from("mensagens").update({ wa_id: waId, status: "sent" }).eq("id", m.id);
    await sb.from("eventos").insert({ caso_id: caso.id, autor, tipo: "whatsapp", texto: `WhatsApp enviado (${t.rotulo}): "${texto}"`, visivel_cliente: true, dados: { mensagem_id: m.id, wa_id: waId, template: t.nome } });
    return { ok: true, msg: `WhatsApp enviado: ${t.rotulo}.` };
  } catch (e) {
    const msg = e instanceof WhatsAppError ? e.message : (e as Error).message;
    await sb.from("mensagens").update({ status: "failed", erro: msg }).eq("id", m.id);
    await sb.from("eventos").insert({ caso_id: caso.id, autor, tipo: "whatsapp", texto: `Falha ao enviar WhatsApp (${t.rotulo}): ${msg}`, visivel_cliente: false, dados: { mensagem_id: m.id } });
    return { ok: false, msg };
  }
}

export const whatsappAtivo = () => whatsappEnv().ok;
