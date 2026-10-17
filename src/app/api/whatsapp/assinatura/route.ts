import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { assinaWebhook, assinaturaWebhook, WhatsAppError } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Assinatura da conta do WhatsApp (WABA) ao app da Meta. Só admin logado.
 * GET: mostra a WABA e os apps assinados. POST: assina o app do token (idempotente).
 * Sem essa assinatura o webhook não recebe status de entrega nem respostas, mesmo com a URL verificada no painel.
 */
async function admin() {
  const u = await usuarioAtual();
  return u && u.papel === "admin" ? u : null;
}
const erro = (e: unknown) => {
  const msg = e instanceof WhatsAppError ? e.message : (e as Error).message;
  return NextResponse.json({ ok: false, erro: msg, detalhes: e instanceof WhatsAppError ? e.detalhes : undefined }, { status: e instanceof WhatsAppError && e.status >= 400 ? 502 : 500 });
};

export async function GET() {
  if (!(await admin())) return NextResponse.json({ erro: "só admin" }, { status: 401 });
  try {
    const s = await assinaturaWebhook();
    return NextResponse.json({ ok: true, ...s, assinado: s.apps.length > 0, dica: s.apps.length ? "Webhook ligado." : "Nenhum app assinado: faça POST nesta mesma URL (logado como admin)." });
  } catch (e) { return erro(e); }
}

export async function POST() {
  if (!(await admin())) return NextResponse.json({ erro: "só admin" }, { status: 401 });
  try {
    const r = await assinaWebhook();
    const s = await assinaturaWebhook();
    return NextResponse.json({ ...r, apps: s.apps });
  } catch (e) { return erro(e); }
}
