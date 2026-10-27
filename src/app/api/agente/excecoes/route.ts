import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/domain/datas";
import { leituraAgente } from "@/lib/domain/agente";
import type { Caso, Cliente, Cobranca, Parcela, Proposta } from "@/lib/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Leitura SÓ DE CONSULTA para o agente de Cobrança do OpenClaw (notebook do escritório).
 * GET /api/agente/excecoes  com  Authorization: Bearer <AGENTE_TOKEN>
 * Devolve a fila do dia (mesma regra da tela /fila), atenção de prescrição, acordos em atraso (parcelas e
 * cobranças do Asaas) e propostas fora da alçada esperando o cliente. Não grava nada.
 * Sem AGENTE_TOKEN configurado, recusa tudo.
 */
function autorizado(req: NextRequest): boolean {
  const segredo = (process.env.AGENTE_TOKEN ?? "").trim();
  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!segredo || !recebido) return false;
  const a = Buffer.from(segredo);
  const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}

const PAGINA = 1000; // limite padrão de linhas por resposta do PostgREST
const LOTE_IDS = 150; // ids por filtro `in` (mantém a URL curta)

type Sb = ReturnType<typeof supabaseAdmin>;

/** Lê todas as linhas de uma tabela filha para um conjunto de casos, em lotes de ids e páginas de 1000. */
async function filhosDe<T>(sb: Sb, tabela: "parcelas" | "cobrancas" | "propostas", ids: string[], extra?: (q: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const lote = ids.slice(i, i + LOTE_IDS);
    for (let de = 0; ; de += PAGINA) {
      let q = sb.from(tabela).select("*").in("caso_id", lote).order("id").range(de, de + PAGINA - 1);
      if (extra) q = extra(q);
      const { data, error } = await q;
      if (error) throw new Error(`${tabela}: ${error.message}`);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGINA) break;
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const sb = supabaseAdmin();
  try {
    const casos: Caso[] = [];
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await sb.from("casos").select("*").not("fase", "in", "(pago,devolvido)").order("id").range(de, de + PAGINA - 1);
      if (error) throw new Error(`casos: ${error.message}`);
      casos.push(...((data ?? []) as Caso[]));
      if (!data || data.length < PAGINA) break;
    }
    const ids = casos.map((c) => c.id);

    const [{ data: clientes, error: eCli }, parcelas, cobrancas, propostas] = await Promise.all([
      sb.from("clientes").select("*"),
      filhosDe<Parcela>(sb, "parcelas", ids),
      // cobrancas pode não existir se a migration 0003 não rodou: a leitura segue sem ela.
      filhosDe<Cobranca>(sb, "cobrancas", ids).catch(() => [] as Cobranca[]),
      filhosDe<Proposta>(sb, "propostas", ids, (q) => q.eq("status", "pending")),
    ]);
    if (eCli) throw new Error(`clientes: ${eCli.message}`);
    const mapa = Object.fromEntries(((clientes ?? []) as Cliente[]).map((c) => [c.id, c]));

    const leitura = leituraAgente(casos, mapa, parcelas, propostas, hojeISO(), cobrancas);
    return NextResponse.json(leitura, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "erro na leitura" }, { status: 500 });
  }
}
