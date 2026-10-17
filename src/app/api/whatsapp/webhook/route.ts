import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assinaturaValida, whatsappEnv } from "@/lib/whatsapp";
import { pediuSair } from "@/lib/domain/whatsapp";
import { colunasProxima, marca } from "@/lib/domain/regua";
import { hojeISO } from "@/lib/domain/datas";
import { isAberto, type Caso } from "@/lib/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verificação do webhook pela Meta (uma vez, ao cadastrar a URL no app). */
export async function GET(req: NextRequest) {
  const env = whatsappEnv();
  const sp = req.nextUrl.searchParams;
  if (sp.get("hub.mode") === "subscribe" && env.verifyToken && sp.get("hub.verify_token") === env.verifyToken) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  if (!sp.has("hub.mode")) return NextResponse.json({ webhook: "gf-cobranca/whatsapp", configurado: env.webhookOk, envio: env.ok });
  return NextResponse.json({ erro: "verify token inválido" }, { status: 403 });
}

type Status = { id: string; status: string; recipient_id?: string; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] };
type Msg = { from: string; id: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string } } };

/** Status de entrega e respostas do devedor. Assinatura obrigatória (App Secret). Responde 200 sempre que a assinatura for válida. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!assinaturaValida(raw, req.headers.get("x-hub-signature-256"))) return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  let body: { entry?: { changes?: { value?: { statuses?: Status[]; messages?: Msg[] } }[] }[] };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ erro: "JSON inválido" }, { status: 400 }); }
  const sb = supabaseAdmin();
  const hoje = hojeISO();
  let n = 0;
  for (const entry of body.entry ?? []) for (const ch of entry.changes ?? []) {
    const v = ch.value ?? {};
    for (const st of v.statuses ?? []) {
      const erro = st.errors?.[0] ? `${st.errors[0].code ?? ""} ${st.errors[0].title ?? st.errors[0].message ?? ""} ${st.errors[0].error_data?.details ?? ""}`.trim() : null;
      const status = ["sent", "delivered", "read", "failed"].includes(st.status) ? st.status : null;
      if (!status) continue;
      // Não rebaixa: "read" não volta para "delivered" se os eventos chegarem fora de ordem.
      const { data: m } = await sb.from("mensagens").select("id, caso_id, status, template").eq("wa_id", st.id).maybeSingle();
      if (!m) continue;
      const ordem = ["queued", "sent", "delivered", "read"];
      if (status !== "failed" && ordem.indexOf(status) < ordem.indexOf(m.status)) continue;
      await sb.from("mensagens").update({ status, erro }).eq("id", m.id);
      if (status === "failed") await sb.from("eventos").insert({ caso_id: m.caso_id, autor: "WhatsApp", tipo: "whatsapp", texto: `WhatsApp não entregue (${m.template ?? "mensagem"}): ${erro ?? "sem detalhe"}. Conferir o número.`, visivel_cliente: false });
      n++;
    }
    for (const msg of v.messages ?? []) {
      const texto = msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? `[${msg.type}]`;
      const { data: ja } = await sb.from("mensagens").select("id").eq("wa_id", msg.id).maybeSingle();
      if (ja) continue;
      // Acha o caso pelo celular: o mais recente que recebeu mensagem desse número; senão, qualquer caso aberto com o telefone.
      const { data: ultima } = await sb.from("mensagens").select("caso_id").eq("telefone", msg.from).eq("direcao", "saida").order("criado_em", { ascending: false }).limit(1).maybeSingle();
      let casoId = ultima?.caso_id ?? null;
      if (!casoId) {
        const semDdi = msg.from.replace(/^55/, "");
        const { data: cands } = await sb.from("casos").select("id, telefone, fase").not("fase", "in", "(pago,devolvido)").limit(2000);
        casoId = (cands ?? []).find((c) => (c.telefone ?? "").replace(/\D/g, "").endsWith(semDdi.slice(-8)))?.id ?? null;
      }
      if (!casoId) continue;
      await sb.from("mensagens").insert({ caso_id: casoId, direcao: "entrada", telefone: msg.from, texto, wa_id: msg.id, status: "received", origem: "webhook" });
      const { data: c } = await sb.from("casos").select("*").eq("id", casoId).single();
      const caso = c as Caso | null;
      if (pediuSair(texto)) {
        await sb.from("casos").update({ wa_optout: true }).eq("id", casoId);
        await sb.from("eventos").insert({ caso_id: casoId, autor: "WhatsApp", tipo: "whatsapp", texto: `Devedor respondeu "${texto.trim()}": mensagens automáticas bloqueadas. Cobrança segue por outros canais.`, visivel_cliente: false });
      } else {
        if (caso && isAberto(caso)) await sb.from("casos").update({ ...colunasProxima(marca(hoje, 0, "recontatar", "Devedor respondeu no WhatsApp: responder hoje")), ultima_mov_em: new Date().toISOString() }).eq("id", casoId);
        await sb.from("eventos").insert({ caso_id: casoId, autor: "WhatsApp", tipo: "contato", texto: `Devedor respondeu no WhatsApp: "${texto.slice(0, 500)}"`, visivel_cliente: true });
      }
      n++;
    }
  }
  return NextResponse.json({ ok: true, processados: n });
}
