import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/domain/datas";
import { leituraAgente } from "@/lib/domain/agente";
import type { Caso, Cliente, Parcela, Proposta } from "@/lib/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Leitura SÓ DE CONSULTA para o agente de Cobrança do OpenClaw (notebook do escritório).
 * GET /api/agente/excecoes  com  Authorization: Bearer <AGENTE_TOKEN>
 * Devolve a fila do dia (mesma regra da tela /fila), atenção de prescrição, acordos em atraso e
 * propostas fora da alçada esperando o cliente. Não grava nada. Sem AGENTE_TOKEN configurado, recusa tudo.
 */
function autorizado(req: NextRequest): boolean {
  const segredo = (process.env.AGENTE_TOKEN ?? "").trim();
  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!segredo || !recebido) return false;
  const a = Buffer.from(segredo);
  const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const sb = supabaseAdmin();

  const { data: casos, error } = await sb.from("casos").select("*").not("fase", "in", "(pago,devolvido)").limit(5000);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const ids = (casos ?? []).map((c) => c.id);

  const [{ data: clientes }, { data: parcelas }, { data: propostas }] = await Promise.all([
    sb.from("clientes").select("*"),
    ids.length ? sb.from("parcelas").select("*").in("caso_id", ids).eq("paga", false) : Promise.resolve({ data: [] }),
    ids.length ? sb.from("propostas").select("*").in("caso_id", ids).eq("status", "pending") : Promise.resolve({ data: [] }),
  ]);
  const mapa = Object.fromEntries(((clientes ?? []) as Cliente[]).map((c) => [c.id, c]));

  const leitura = leituraAgente(
    (casos ?? []) as Caso[],
    mapa,
    (parcelas ?? []) as Parcela[],
    (propostas ?? []) as Proposta[],
    hojeISO(),
  );
  return NextResponse.json(leitura, { headers: { "cache-control": "no-store" } });
}
