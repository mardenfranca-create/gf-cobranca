import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { asaasEnv, type AsaasPayment } from "@/lib/asaas";
import { aplicaEventoCobranca } from "@/lib/asaas-efeitos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook do Asaas. Configure no painel do Asaas: URL https://SEU-DOMINIO/api/asaas/webhook, token = ASAAS_WEBHOOK_TOKEN.
 * Regras: token obrigatório; cada evento é processado uma vez (idempotente por id); responde 200 mesmo para eventos
 * sem efeito, para o Asaas não pausar a fila. Erro interno responde 500 para o Asaas reenviar.
 */
export async function POST(req: NextRequest) {
  const env = asaasEnv();
  if (!env.webhookOk) return NextResponse.json({ erro: "ASAAS_WEBHOOK_TOKEN não configurado" }, { status: 503 });
  const token = req.headers.get("asaas-access-token") ?? req.headers.get("access_token") ?? "";
  if (token !== env.webhookToken) return NextResponse.json({ erro: "token inválido" }, { status: 401 });

  let body: { id?: string; event?: string; payment?: AsaasPayment };
  try { body = await req.json(); } catch { return NextResponse.json({ erro: "JSON inválido" }, { status: 400 }); }
  const evento = body.event ?? "";
  const payment = body.payment;
  const eventoId = body.id ?? (payment?.id ? `${evento}:${payment.id}:${payment.status ?? ""}` : null);
  if (!eventoId || !evento) return NextResponse.json({ erro: "evento sem id/event" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: ja } = await sb.from("asaas_eventos").select("id").eq("id", eventoId).maybeSingle();
  if (ja) return NextResponse.json({ ok: true, repetido: true });
  const { error: eIns } = await sb.from("asaas_eventos").insert({ id: eventoId, evento, payment_id: payment?.id ?? null, payload: body as Record<string, unknown> });
  if (eIns) return NextResponse.json({ erro: eIns.message }, { status: 500 });

  let resultado = "sem pagamento no payload";
  try {
    if (payment?.id) resultado = await aplicaEventoCobranca(sb, evento, payment);
  } catch (e) {
    resultado = `erro: ${(e as Error).message}`;
    await sb.from("asaas_eventos").update({ resultado }).eq("id", eventoId);
    return NextResponse.json({ erro: resultado }, { status: 500 });
  }
  await sb.from("asaas_eventos").update({ resultado }).eq("id", eventoId);
  return NextResponse.json({ ok: true, resultado });
}

export async function GET() {
  const env = asaasEnv();
  return NextResponse.json({ webhook: "gf-cobranca/asaas", configurado: env.webhookOk, ambiente: env.env });
}
