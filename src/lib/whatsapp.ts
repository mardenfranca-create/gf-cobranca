import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** Cliente da WhatsApp Cloud API (Meta). Token e ids só no servidor. */
export function whatsappEnv() {
  const token = (process.env.WHATSAPP_TOKEN ?? "").trim();
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  const verifyToken = (process.env.WHATSAPP_VERIFY_TOKEN ?? "").trim();
  const appSecret = (process.env.WHATSAPP_APP_SECRET ?? "").trim();
  const version = (process.env.WHATSAPP_API_VERSION ?? "v21.0").trim();
  const base = (process.env.WHATSAPP_BASE_URL ?? `https://graph.facebook.com/${version}`).trim().replace(/\/+$/, "");
  const reguaAuto = (process.env.WHATSAPP_REGUA_AUTOMATICA ?? "").trim().toLowerCase() === "true";
  return { token, phoneId, verifyToken, appSecret, base, version, reguaAuto, ok: token.length > 20 && /^\d{6,}$/.test(phoneId), webhookOk: verifyToken.length >= 8 && appSecret.length >= 16 };
}

export class WhatsAppError extends Error {
  constructor(message: string, public status: number, public detalhes?: unknown) { super(message); }
}

/** Envia um modelo aprovado. Devolve o id da mensagem (wamid). */
export async function enviaTemplate(to: string, nome: string, params: string[]): Promise<string> {
  const env = whatsappEnv();
  if (!env.ok) throw new WhatsAppError("WhatsApp não configurado (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID).", 0);
  const body = {
    messaging_product: "whatsapp", to, type: "template",
    template: { name: nome, language: { code: "pt_BR" }, components: params.length ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] : [] },
  };
  const r = await fetch(`${env.base}/${env.phoneId}/messages`, { method: "POST", headers: { authorization: `Bearer ${env.token}`, "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = (await r.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string; code?: number; error_data?: { details?: string } } } | null;
  if (!r.ok || !data?.messages?.[0]?.id) {
    const e = data?.error;
    throw new WhatsAppError(`Meta recusou (${r.status}${e?.code ? ` / ${e.code}` : ""}): ${e?.error_data?.details ?? e?.message ?? "sem detalhe"}`, r.status, data);
  }
  return data.messages[0].id;
}

/** Envia texto livre. Só é aceito pela Meta dentro de 24h após a última mensagem do devedor (janela de atendimento). */
export async function enviaTexto(to: string, texto: string): Promise<string> {
  const env = whatsappEnv();
  if (!env.ok) throw new WhatsAppError("WhatsApp não configurado (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID).", 0);
  const r = await fetch(`${env.base}/${env.phoneId}/messages`, { method: "POST", headers: { authorization: `Bearer ${env.token}`, "content-type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { preview_url: true, body: texto.slice(0, 4096) } }), cache: "no-store" });
  const data = (await r.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string; code?: number; error_data?: { details?: string } } } | null;
  if (!r.ok || !data?.messages?.[0]?.id) {
    const e = data?.error;
    const fora = e?.code === 131047 || /24|window|re-engagement/i.test(`${e?.message ?? ""} ${e?.error_data?.details ?? ""}`);
    throw new WhatsAppError(fora ? "Fora da janela de 24h: o devedor precisa ter respondido nas últimas 24 horas. Use um modelo." : `Meta recusou (${r.status}${e?.code ? ` / ${e.code}` : ""}): ${e?.error_data?.details ?? e?.message ?? "sem detalhe"}`, r.status, data);
  }
  return data.messages[0].id;
}

/** Confere a assinatura X-Hub-Signature-256 do webhook (HMAC-SHA256 do corpo bruto com o App Secret). */
export function assinaturaValida(rawBody: string, header: string | null): boolean {
  const env = whatsappEnv();
  if (!env.appSecret || !header?.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", env.appSecret).update(rawBody, "utf8").digest("hex");
  const recebido = header.slice(7);
  if (esperado.length !== recebido.length) return false;
  return timingSafeEqual(Buffer.from(esperado, "hex"), Buffer.from(recebido, "hex"));
}
