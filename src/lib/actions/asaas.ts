"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigeEquipe } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { asaasEnv, buscaCobranca, cancelaCobranca, criaCobranca, garanteCustomer, pixCopiaECola, AsaasError } from "@/lib/asaas";
import { aplicaEventoCobranca } from "@/lib/asaas-efeitos";
import { brl, fmtData, hojeISO, addDias } from "@/lib/domain/datas";
import { planoParcelas } from "@/lib/domain/asaas";
import { colunasProxima, marca } from "@/lib/domain/regua";
import type { Caso, Cobranca } from "@/lib/domain/types";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").replace(",", ".")) || 0;
const volta = (id: string, msg: string, ok: boolean) => redirect(`/casos/${id}?${ok ? "ok" : "erro"}=${encodeURIComponent(msg)}`);

async function carrega(casoId: string) {
  const u = await exigeEquipe();
  const sb = await supabaseServer();
  const { data: caso } = await sb.from("casos").select("*").eq("id", casoId).single();
  if (!caso) throw new Error("Caso não encontrado");
  return { u, sb, caso: caso as Caso };
}

/** Emite uma cobrança (integral ou avulsa) com boleto + Pix e registra no caso. */
export async function emitirCobranca(fd: FormData) {
  const id = s(fd, "caso_id");
  const { u, sb, caso } = await carrega(id);
  if (!asaasEnv().ok) volta(id, "ASAAS_API_KEY não configurada na Vercel.", false);
  const valor = n(fd, "valor") || caso.valor_atualizado || 0;
  const vencimento = /^\d{4}-\d{2}-\d{2}$/.test(s(fd, "vencimento")) ? s(fd, "vencimento") : addDias(hojeISO(), 5);
  const descontoPct = Math.max(0, Math.min(90, n(fd, "desconto")));
  if (valor <= 0) volta(id, "Informe o valor da cobrança.", false);
  try {
    const customer = await garanteCustomer(caso);
    if (customer !== caso.asaas_customer_id) await sb.from("casos").update({ asaas_customer_id: customer }).eq("id", id);
    const descricao = s(fd, "descricao") || `${caso.referencia} · ${caso.devedor}`;
    const p = await criaCobranca({ customer, valor, vencimento, descricao, externalReference: `${id}:avulsa:${Date.now()}`, descontoPct: descontoPct || undefined, descontoAteDias: 0 });
    const pix = await pixCopiaECola(p.id);
    await sb.from("cobrancas").insert({ caso_id: id, asaas_id: p.id, tipo: s(fd, "tipo") === "integral" ? "integral" : "avulsa", valor, vencimento, status: p.status ?? "PENDING", invoice_url: p.invoiceUrl ?? null, boleto_url: p.bankSlipUrl ?? null, pix_copia: pix, criado_por: u.nome });
    const hoje = hojeISO();
    await sb.from("casos").update({ ...colunasProxima(marca(hoje, Math.max(1, Math.round((new Date(vencimento).getTime() - new Date(hoje).getTime()) / 86400000) + 1), "promessa", `Conferir pagamento do boleto vencido em ${fmtData(vencimento)}`)), ultima_mov_em: new Date().toISOString() }).eq("id", id);
    await sb.from("eventos").insert({ caso_id: id, autor: u.nome, autor_id: u.id, tipo: "asaas", texto: `Cobrança emitida no Asaas: ${brl(valor)}, vencimento ${fmtData(vencimento)}${descontoPct ? `, ${descontoPct}% de desconto até o vencimento` : ""}. Boleto e Pix enviados ao devedor pelo Asaas.`, visivel_cliente: true, dados: { asaas_id: p.id } });
  } catch (e) {
    volta(id, e instanceof AsaasError ? e.message : `Falha ao emitir: ${(e as Error).message}`, false);
  }
  revalidatePath("/", "layout");
  volta(id, "Cobrança emitida no Asaas. O link está em \"Cobranças no Asaas\".", true);
}

/** Emite entrada + parcelas mensais de um acordo já fechado, uma cobrança por parcela. */
export async function emitirParcelasAcordo(fd: FormData) {
  const id = s(fd, "caso_id");
  const { u, sb, caso } = await carrega(id);
  if (!asaasEnv().ok) volta(id, "ASAAS_API_KEY não configurada na Vercel.", false);
  const total = n(fd, "total") || caso.valor_atualizado || 0;
  const parcelas = Math.max(1, Math.min(60, Math.round(n(fd, "parcelas") || caso.acordo?.parc || 1)));
  const entradaPct = Math.max(0, Math.min(100, n(fd, "entrada")));
  const primeiro = /^\d{4}-\d{2}-\d{2}$/.test(s(fd, "primeiro")) ? s(fd, "primeiro") : addDias(hojeISO(), 5);
  if (total <= 0) volta(id, "Informe o total do acordo.", false);
  const { count } = await sb.from("cobrancas").select("id", { count: "exact", head: true }).eq("caso_id", id).neq("status", "DELETED").in("tipo", ["entrada", "parcela"]);
  if ((count ?? 0) > 0) volta(id, "Este caso já tem parcelas emitidas. Cancele as existentes antes de emitir de novo.", false);
  const plano = planoParcelas(total, entradaPct, parcelas, primeiro);
  let emitidas = 0;
  try {
    const customer = await garanteCustomer(caso);
    if (customer !== caso.asaas_customer_id) await sb.from("casos").update({ asaas_customer_id: customer }).eq("id", id);
    for (const item of plano) {
      const rot = item.tipo === "entrada" ? "Entrada do acordo" : item.tipo === "integral" ? "Acordo" : `Parcela ${item.n}/${parcelas} do acordo`;
      const p = await criaCobranca({ customer, valor: item.valor, vencimento: item.vencimento, descricao: `${rot} · ${caso.referencia} · ${caso.devedor}`, externalReference: `${id}:${item.tipo}:${item.n}` });
      await sb.from("cobrancas").insert({ caso_id: id, asaas_id: p.id, tipo: item.tipo === "integral" ? "parcela" : item.tipo, parcela_n: item.tipo === "entrada" ? 0 : item.n, parcelas, valor: item.valor, vencimento: item.vencimento, status: p.status ?? "PENDING", invoice_url: p.invoiceUrl ?? null, boleto_url: p.bankSlipUrl ?? null, criado_por: u.nome });
      emitidas++;
    }
    const hoje = hojeISO();
    await sb.from("casos").update({ fase: "acordo", acordo: { parc: parcelas, paid: 0, next: plano[0].vencimento }, ...colunasProxima(marca(hoje, Math.max(1, Math.round((new Date(plano[0].vencimento).getTime() - new Date(hoje).getTime()) / 86400000) + 1), "acordo", `Conferir ${plano[0].tipo === "entrada" ? "entrada" : "1ª parcela"} do acordo (Asaas baixa sozinho)`)), ultima_mov_em: new Date().toISOString() }).eq("id", id);
    await sb.from("eventos").insert({ caso_id: id, autor: u.nome, autor_id: u.id, tipo: "asaas", texto: `${plano.length} cobranças do acordo emitidas no Asaas: total ${brl(total)}${entradaPct ? `, entrada ${entradaPct}%` : ""}, ${parcelas}× a partir de ${fmtData(plano[0].vencimento)}. Baixa automática por webhook.`, visivel_cliente: true });
  } catch (e) {
    revalidatePath("/", "layout");
    volta(id, `${emitidas} de ${plano.length} emitidas antes do erro. ${e instanceof AsaasError ? e.message : (e as Error).message}`, false);
  }
  revalidatePath("/", "layout");
  volta(id, `${plano.length} cobranças emitidas no Asaas.`, true);
}

/** Consulta o Asaas e aplica o status atual (para quando o webhook não chegou). */
export async function sincronizarCobranca(fd: FormData) {
  const id = s(fd, "caso_id"), asaasId = s(fd, "asaas_id");
  const { u, sb } = await carrega(id);
  try {
    const p = await buscaCobranca(asaasId);
    const { data: cob } = await sb.from("cobrancas").select("*").eq("asaas_id", asaasId).single();
    const atual = (cob as Cobranca | null)?.status;
    const evento = p.deleted ? "PAYMENT_DELETED" : p.status === "RECEIVED" || p.status === "RECEIVED_IN_CASH" ? "PAYMENT_RECEIVED" : p.status === "CONFIRMED" ? "PAYMENT_CONFIRMED" : p.status === "OVERDUE" ? "PAYMENT_OVERDUE" : p.status === "REFUNDED" ? "PAYMENT_REFUNDED" : null;
    if (!evento || (atual && atual === p.status)) { await sb.from("cobrancas").update({ status: p.deleted ? "DELETED" : p.status, invoice_url: p.invoiceUrl ?? null, boleto_url: p.bankSlipUrl ?? null }).eq("asaas_id", asaasId); revalidatePath("/", "layout"); volta(id, `Asaas: ${p.status}. Nada mudou.`, true); return; }
    const r = await aplicaEventoCobranca(sb, evento, p, `${u.nome} (sincronização Asaas)`);
    revalidatePath("/", "layout");
    volta(id, `Sincronizado: ${r}.`, true);
  } catch (e) {
    if (e instanceof Error && /NEXT_REDIRECT/.test(e.message)) throw e;
    volta(id, e instanceof AsaasError ? e.message : (e as Error).message, false);
  }
}

export async function cancelarCobranca(fd: FormData) {
  const id = s(fd, "caso_id"), asaasId = s(fd, "asaas_id");
  const { u, sb } = await carrega(id);
  try {
    await cancelaCobranca(asaasId);
    await sb.from("cobrancas").update({ status: "DELETED" }).eq("asaas_id", asaasId);
    await sb.from("eventos").insert({ caso_id: id, autor: u.nome, autor_id: u.id, tipo: "asaas", texto: `Cobrança ${asaasId} cancelada no Asaas.${s(fd, "motivo") ? " " + s(fd, "motivo") : ""}`, visivel_cliente: false });
  } catch (e) {
    volta(id, e instanceof AsaasError ? e.message : (e as Error).message, false);
  }
  revalidatePath("/", "layout");
  volta(id, "Cobrança cancelada no Asaas.", true);
}
