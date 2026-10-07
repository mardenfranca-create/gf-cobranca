import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { addDias, brl, fmtData, hojeISO } from "@/lib/domain/datas";
import { classificaEvento, statusPorEvento } from "@/lib/domain/asaas";
import { colunasProxima, marca } from "@/lib/domain/regua";
import { isAberto, type Caso, type Cobranca } from "@/lib/domain/types";
import type { AsaasPayment } from "@/lib/asaas";

type SB = SupabaseClient<Database>;

/**
 * Aplica no caso o que aconteceu com uma cobrança no Asaas. Usado pelo webhook (chave de serviço) e pela
 * sincronização manual (sessão da equipe). Sempre grava evento; nunca apaga nada.
 */
export async function aplicaEventoCobranca(sb: SB, evento: string, payment: AsaasPayment, autor = "Asaas"): Promise<string> {
  const efeito = classificaEvento(evento);
  const { data: cob } = await sb.from("cobrancas").select("*").eq("asaas_id", payment.id).maybeSingle();
  if (!cob) return "cobrança desconhecida (não emitida por este sistema)";
  const cobranca = cob as Cobranca;
  const novoStatus = statusPorEvento(evento, payment.status ?? cobranca.status);
  const pagoEm = payment.clientPaymentDate ?? payment.paymentDate ?? payment.confirmedDate ?? null;
  await sb.from("cobrancas").update({
    status: novoStatus,
    valor_pago: efeito === "pago" ? (payment.value ?? cobranca.valor) : efeito === "estornado" ? null : cobranca.valor_pago,
    pago_em: efeito === "pago" ? (pagoEm ? new Date(pagoEm).toISOString() : new Date().toISOString()) : efeito === "estornado" ? null : cobranca.pago_em,
  }).eq("id", cobranca.id);
  if (efeito === "ignorar") return `evento ${evento} registrado, sem efeito no caso`;

  const { data: c } = await sb.from("casos").select("*").eq("id", cobranca.caso_id).single();
  if (!c) return "caso não encontrado";
  const caso = c as Caso;
  const hoje = hojeISO();
  const rotulo = cobranca.tipo === "parcela" ? `parcela ${cobranca.parcela_n}/${cobranca.parcelas}` : cobranca.tipo === "entrada" ? "entrada do acordo" : "cobrança";
  const ev = (tipo: string, texto: string, visivel = true) => sb.from("eventos").insert({ caso_id: caso.id, autor, tipo, texto, visivel_cliente: visivel, dados: { asaas_id: payment.id, evento } });
  const agora = new Date().toISOString();

  if (efeito === "pago") {
    const { data: todas } = await sb.from("cobrancas").select("status, tipo").eq("caso_id", caso.id).neq("status", "DELETED");
    const pendentes = (todas ?? []).filter((x) => !["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(x.status)).length;
    const texto = `Pagamento confirmado pelo Asaas: ${rotulo}, ${brl(payment.value ?? cobranca.valor)} em ${fmtData((pagoEm ?? hoje).slice(0, 10))}${payment.billingType ? ` (${payment.billingType === "PIX" ? "Pix" : "boleto"})` : ""}.`;
    if (!isAberto(caso)) { await ev("pagamento", texto + " Caso já estava encerrado."); return "pago (caso já encerrado)"; }
    if (pendentes === 0) {
      await sb.from("casos").update({ fase: "pago", acordo: caso.acordo ? { ...caso.acordo, paid: caso.acordo.parc } : null, ...colunasProxima(null), ultima_mov_em: agora, encerrado_em: agora }).eq("id", caso.id);
      await ev("pagamento", texto + " Todas as cobranças quitadas. Caso encerrado automaticamente.");
      return "pago: caso encerrado";
    }
    const acordo = caso.acordo ? { ...caso.acordo, paid: Math.min(caso.acordo.parc, caso.acordo.paid + (cobranca.tipo === "parcela" ? 1 : 0)), next: addDias(hoje, 30) } : null;
    await sb.from("casos").update({ acordo, fase: caso.fase === "confirma" ? "acordo" : caso.fase, ...colunasProxima(marca(hoje, 30, "acordo", `Próxima cobrança do acordo (${pendentes} em aberto)`)), ultima_mov_em: agora }).eq("id", caso.id);
    await ev("pagamento", texto + ` Restam ${pendentes} em aberto.`);
    return `pago: restam ${pendentes}`;
  }
  if (efeito === "vencido") {
    if (isAberto(caso) && !caso.exc_tipo) await sb.from("casos").update({ ...colunasProxima(marca(hoje, 0, "recontatar", `${rotulo[0].toUpperCase() + rotulo.slice(1)} vencida sem pagamento: cobrar o devedor`)), ultima_mov_em: agora }).eq("id", caso.id);
    await ev("asaas", `${rotulo[0].toUpperCase() + rotulo.slice(1)} de ${brl(cobranca.valor)} venceu em ${fmtData(cobranca.vencimento)} sem pagamento (Asaas).`, false);
    return "vencido: tarefa criada";
  }
  if (efeito === "cancelado") { await ev("asaas", `Cobrança ${rotulo} de ${brl(cobranca.valor)} cancelada no Asaas.`, false); return "cancelado"; }
  if (efeito === "estornado") {
    if (isAberto(caso) || caso.fase === "pago") await sb.from("casos").update({ fase: "neg", fase_nota: "Pagamento estornado no Asaas", ...colunasProxima(marca(hoje, 0, "decidir", "Pagamento estornado/contestado no Asaas: verificar e retomar cobrança")), ultima_mov_em: agora, encerrado_em: null }).eq("id", caso.id);
    await ev("pagamento", `Pagamento de ${brl(cobranca.valor)} (${rotulo}) estornado ou contestado no Asaas (${evento}). Cobrança reaberta.`);
    return "estornado: caso reaberto";
  }
  return "sem efeito";
}
