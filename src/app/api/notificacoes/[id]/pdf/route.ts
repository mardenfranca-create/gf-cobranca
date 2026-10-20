import { NextResponse, type NextRequest } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { gerarNotificacaoPdf } from "@/lib/notificacao-pdf";
import type { Notificacao } from "@/lib/domain/notificacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PDF da notificação. Dois acessos: equipe/cliente logado (RLS), ou link com token (?t=) para a Meta baixar o anexo.
 * O token é único por notificação e só serve para este PDF.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/notificacoes/[id]/pdf">) {
  const { id } = await ctx.params;
  const t = req.nextUrl.searchParams.get("t");
  let n: Notificacao | null = null;
  if (t && /^[0-9a-f]{36}$/.test(t)) {
    const { data } = await supabaseAdmin().from("notificacoes").select("*").eq("id", id).eq("token", t).maybeSingle();
    n = (data as Notificacao | null) ?? null;
  } else {
    const u = await usuarioAtual();
    if (!u) return new NextResponse("Entre no sistema para abrir o PDF.", { status: 401 });
    const sb = await supabaseServer();
    const { data } = await sb.from("notificacoes").select("*").eq("id", id).maybeSingle();
    n = (data as Notificacao | null) ?? null;
  }
  if (!n) return new NextResponse("Notificação não encontrada.", { status: 404 });
  const pdf = gerarNotificacaoPdf(n);
  return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `${req.nextUrl.searchParams.get("baixar") ? "attachment" : "inline"}; filename="notificacao-${id.slice(0, 8)}.pdf"`, "cache-control": "private, no-store" } });
}
