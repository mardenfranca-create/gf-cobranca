import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { whatsappEnv } from "@/lib/whatsapp";
import { enviaMensagemCaso } from "@/lib/whatsapp-envio";
import { lembreteDeHoje } from "@/lib/domain/whatsapp";
import { addDias, diffDias, hojeISO } from "@/lib/domain/datas";
import type { Caso, Cliente, Cobranca } from "@/lib/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Régua automática diária (Vercel Cron, dias úteis 9h de Brasília). Protegida por CRON_SECRET.
 * 1) Casos em "regua": 1º e 2º lembrete conforme os dias da régua (notif1, recontato).
 * 2) Acordos: lembrete 3 dias antes do vencimento de cada cobrança em aberto no Asaas.
 * Só roda de verdade com WHATSAPP_REGUA_AUTOMATICA=true; senão, simula e devolve o que enviaria.
 */
export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const env = whatsappEnv();
  const simular = !env.reguaAuto || !env.ok || req.nextUrl.searchParams.get("simular") === "1";
  const sb = supabaseAdmin();
  const hoje = hojeISO();
  const { data: regua } = await sb.from("regua").select("chave, dias");
  const dias = { notif1: regua?.find((r) => r.chave === "notif1")?.dias ?? 1, recontato: regua?.find((r) => r.chave === "recontato")?.dias ?? 5 };
  const { data: clientes } = await sb.from("clientes").select("*");
  const cli = Object.fromEntries(((clientes ?? []) as Cliente[]).map((c) => [c.id, c]));
  const resultado: { caso: string; devedor: string; template: string; ok?: boolean; msg?: string }[] = [];

  // 1) régua de lembretes
  const { data: emRegua } = await sb.from("casos").select("*").eq("fase", "regua").eq("wa_optout", false).is("exc_tipo", null).not("telefone", "is", null).limit(2000);
  const ids = (emRegua ?? []).map((c) => c.id);
  const { data: enviadas } = ids.length ? await sb.from("mensagens").select("caso_id, template").in("caso_id", ids).eq("direcao", "saida").neq("status", "failed") : { data: [] };
  const porCaso = new Map<string, Set<string>>();
  for (const m of enviadas ?? []) { if (!m.caso_id) continue; if (!porCaso.has(m.caso_id)) porCaso.set(m.caso_id, new Set()); if (m.template) porCaso.get(m.caso_id)!.add(m.template); }
  for (const c of (emRegua ?? []) as Caso[]) {
    const t = lembreteDeHoje(c, porCaso.get(c.id) ?? new Set(), hoje, dias, diffDias);
    if (!t) continue;
    const item = { caso: c.id, devedor: c.devedor, template: t };
    if (!simular) Object.assign(item, await enviaMensagemCaso(sb, c, cli[c.cliente_id] ?? { nome_curto: "o credor" }, t, {}, "regua", "Régua automática"));
    resultado.push(item);
  }

  // 2) parcelas de acordo vencendo em 3 dias
  const alvo = addDias(hoje, 3);
  const { data: cobs } = await sb.from("cobrancas").select("*").eq("vencimento", alvo).eq("status", "PENDING").not("invoice_url", "is", null).limit(500);
  for (const cob of (cobs ?? []) as Cobranca[]) {
    const { data: jaLembrou } = await sb.from("mensagens").select("id").eq("caso_id", cob.caso_id).eq("template", "gf_vencimento").gte("criado_em", addDias(hoje, -5)).limit(1);
    if (jaLembrou?.length) continue;
    const { data: c } = await sb.from("casos").select("*").eq("id", cob.caso_id).single();
    const caso = c as Caso | null;
    if (!caso || caso.wa_optout || caso.fase === "pago" || caso.fase === "devolvido") continue;
    const item = { caso: caso.id, devedor: caso.devedor, template: "gf_vencimento" };
    if (!simular) Object.assign(item, await enviaMensagemCaso(sb, caso, cli[caso.cliente_id] ?? { nome_curto: "o credor" }, "gf_vencimento", { valor: cob.valor, data: cob.vencimento, link: cob.invoice_url }, "cron", "Régua automática"));
    resultado.push(item);
  }
  return NextResponse.json({ hoje, simulado: simular, regua_automatica: env.reguaAuto, total: resultado.length, enviados: resultado.filter((r) => r.ok).length, falhas: resultado.filter((r) => r.ok === false).length, itens: resultado });
}
