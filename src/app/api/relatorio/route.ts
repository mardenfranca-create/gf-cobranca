import { NextResponse, type NextRequest } from "next/server";
import { usuarioAtual } from "@/lib/auth";
import { clientePorId } from "@/lib/data";
import { hojeISO } from "@/lib/domain/datas";
import { dadosRelatorio, mesValido } from "@/lib/relatorio";
import { gerarRelatorioPdf } from "@/lib/relatorio-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PDF do relatório mensal: /api/relatorio?cliente=wrj&mes=2026-10
 * Cliente logado só gera o próprio (o parâmetro cliente é ignorado); equipe gera de qualquer carteira.
 */
export async function GET(req: NextRequest) {
  const u = await usuarioAtual();
  if (!u) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`, req.url));
  const sp = req.nextUrl.searchParams;
  const clienteId = u.papel === "cliente" ? u.cliente_id : sp.get("cliente");
  if (!clienteId) return new NextResponse("Informe o cliente.", { status: 400 });
  const mes = mesValido(sp.get("mes")) ? sp.get("mes")! : hojeISO().slice(0, 7);
  const cliente = await clientePorId(clienteId);
  if (!cliente) return new NextResponse("Cliente não encontrado.", { status: 404 });
  const { dados, casos } = await dadosRelatorio(clienteId, mes);
  const pdf = gerarRelatorioPdf(dados, cliente, u.nome, Object.fromEntries(casos.map((c) => [c.id, c.devedor])));
  const nome = `relatorio-${cliente.id}-${mes}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${sp.get("baixar") ? "attachment" : "inline"}; filename="${nome}"`,
      "cache-control": "private, no-store",
    },
  });
}
