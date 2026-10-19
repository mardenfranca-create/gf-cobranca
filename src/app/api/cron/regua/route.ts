import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { estadoRegua } from "@/lib/config/regua";
import { whatsappEnv } from "@/lib/whatsapp";
import { enviaMensagemCaso } from "@/lib/whatsapp-envio";
import { datasVencimentoLembrete, lembreteDeHoje, MAX_FALHAS_REGUA } from "@/lib/domain/whatsapp";
import { colunasProxima, marca } from "@/lib/domain/regua";
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
  const sb = supabaseAdmin();
  // Duas travas: a variável na Vercel E o botão no Painel (banco). Qualquer uma desligada = só simula.
  const pausa = await estadoRegua(sb);
  const simular = !env.reguaAuto || !env.ok || pausa.pausada || req.nextUrl.searchParams.get("simular") === "1";
  const hoje = hojeISO();
  const { data: regua } = await sb.from("regua").select("chave, dias");
  const dias = { notif1: regua?.find((r) => r.chave === "notif1")?.dias ?? 1, recontato: regua?.find((r) => r.chave === "recontato")?.dias ?? 5 };
  const { data: clientes } = await sb.from("clientes").select("*");
  const cli = Object.fromEntries(((clientes ?? []) as Cliente[]).map((c) => [c.id, c]));
  const resultado: { caso: string; devedor: string; template: string; ok?: boolean; msg?: string }[] = [];

  // 1) régua de lembretes
  const { data: emRegua } = await sb.from("casos").select("*").eq("fase", "regua").eq("wa_optout", false).is("exc_tipo", null).not("telefone", "is", null).limit(2000);
  const ids = (emRegua ?? []).map((c) => c.id);
  const { data: enviadas } = ids.length ? await sb.from("mensagens").select("caso_id, template, status, origem").in("caso_id", ids).eq("direcao", "saida") : { data: [] };
  const porCaso = new Map<string, Set<string>>();
  const falhas = new Map<string, number>();
  for (const m of enviadas ?? []) {
    if (!m.caso_id) continue;
    if (m.status === "failed") { if (m.origem === "regua") falhas.set(m.caso_id, (falhas.get(m.caso_id) ?? 0) + 1); continue; }
    if (!porCaso.has(m.caso_id)) porCaso.set(m.caso_id, new Set());
    if (m.template) porCaso.get(m.caso_id)!.add(m.template);
  }
  for (const c of (emRegua ?? []) as Caso[]) {
    const jaFalhou = falhas.get(c.id) ?? 0;
    const t = lembreteDeHoje(c, porCaso.get(c.id) ?? new Set(), hoje, dias, diffDias, jaFalhou);
    if (!t) continue;
    const item: { caso: string; devedor: string; template: string; ok?: boolean; msg?: string } = { caso: c.id, devedor: c.devedor, template: t };
    if (!simular) {
      Object.assign(item, await enviaMensagemCaso(sb, c, cli[c.cliente_id] ?? { nome_curto: "o credor" }, t, {}, "regua", "Régua automática"));
      // Segunda falha de entrega: a régua para de tentar e o caso cai na Fila para alguém conferir o número.
      if (item.ok === false && jaFalhou + 1 >= MAX_FALHAS_REGUA) {
        await sb.from("casos").update({ ...colunasProxima(marca(hoje, 0, "recontatar", "WhatsApp não entregue duas vezes: conferir o celular e cobrar por outro canal")), ultima_mov_em: new Date().toISOString() }).eq("id", c.id);
        await sb.from("eventos").insert({ caso_id: c.id, autor: "Régua automática", tipo: "whatsapp", texto: "Régua automática pausada para este caso: o WhatsApp não foi entregue duas vezes. Conferir o celular.", visivel_cliente: false });
      }
    }
    resultado.push(item);
  }

  // 2) parcelas de acordo vencendo em 3 dias (na sexta, também as de terça e quarta: o cron não roda no fim de semana)
  const { data: cobs } = await sb.from("cobrancas").select("*").in("vencimento", datasVencimentoLembrete(hoje, addDias)).eq("status", "PENDING").not("invoice_url", "is", null).limit(500);
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
  return NextResponse.json({ hoje, simulado: simular, regua_automatica: env.reguaAuto, pausada_no_painel: pausa.pausada, total: resultado.length, enviados: resultado.filter((r) => r.ok).length, falhas: resultado.filter((r) => r.ok === false).length, itens: resultado });
}
