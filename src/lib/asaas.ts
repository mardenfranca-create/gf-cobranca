import "server-only";
import type { Caso } from "@/lib/domain/types";

/**
 * Cliente HTTP do Asaas (API v3). Chave e ambiente vêm só do servidor (Vercel), nunca do navegador.
 * URLs e nomes de cabeçalho são configuráveis por variável para absorver mudanças da API sem mexer em código.
 */
export function asaasEnv() {
  const key = (process.env.ASAAS_API_KEY ?? "").trim();
  const env = (process.env.ASAAS_ENV ?? "sandbox").trim().toLowerCase();
  const base = (process.env.ASAAS_BASE_URL ?? (env === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3")).trim().replace(/\/+$/, "");
  const webhookToken = (process.env.ASAAS_WEBHOOK_TOKEN ?? "").trim();
  return { key, env, base, webhookToken, ok: key.length > 10, webhookOk: webhookToken.length >= 8 };
}

export class AsaasError extends Error {
  constructor(message: string, public status: number, public detalhes?: unknown) { super(message); }
}

export async function asaasFetch<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const env = asaasEnv();
  if (!env.ok) throw new AsaasError("ASAAS_API_KEY não configurada na Vercel.", 0);
  const headers: Record<string, string> = { accept: "application/json", access_token: env.key, "User-Agent": "gf-cobranca" };
  let body: BodyInit | undefined;
  if (init.json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(init.json); }
  const r = await fetch(`${env.base}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) }, body: body ?? init.body, cache: "no-store" });
  const txt = await r.text();
  let data: unknown = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!r.ok) {
    const erros = (data as { errors?: { description?: string }[] } | null)?.errors;
    const msg = erros?.map((e) => e.description).filter(Boolean).join("; ") || (typeof data === "string" ? data.slice(0, 200) : `HTTP ${r.status}`);
    throw new AsaasError(`Asaas recusou (${r.status}): ${msg}`, r.status, data);
  }
  return data as T;
}

export type AsaasCustomer = { id: string; name: string; cpfCnpj?: string };
export type AsaasPayment = {
  id: string; customer: string; status: string; value: number; netValue?: number; dueDate: string; billingType?: string;
  invoiceUrl?: string; bankSlipUrl?: string; externalReference?: string; description?: string;
  paymentDate?: string | null; clientPaymentDate?: string | null; confirmedDate?: string | null; deleted?: boolean;
};

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Garante o devedor cadastrado como "customer" no Asaas (busca por CPF/CNPJ antes de criar). */
export async function garanteCustomer(caso: Pick<Caso, "id" | "devedor" | "documento_digits" | "email" | "telefone" | "asaas_customer_id">): Promise<string> {
  if (caso.asaas_customer_id) return caso.asaas_customer_id;
  const doc = digits(caso.documento_digits);
  if (!(doc.length === 11 || doc.length === 14)) throw new AsaasError("O devedor precisa de CPF ou CNPJ válido para emitir cobrança.", 0);
  const lista = await asaasFetch<{ data?: AsaasCustomer[] }>(`/customers?cpfCnpj=${doc}&limit=1`);
  const existente = lista.data?.[0];
  if (existente) return existente.id;
  const criado = await asaasFetch<AsaasCustomer>("/customers", {
    method: "POST",
    json: { name: caso.devedor.slice(0, 100), cpfCnpj: doc, email: caso.email || undefined, mobilePhone: digits(caso.telefone) || undefined, externalReference: caso.id, notificationDisabled: false },
  });
  return criado.id;
}

export type NovaCobranca = { customer: string; valor: number; vencimento: string; descricao: string; externalReference: string; descontoPct?: number; descontoAteDias?: number };

/** Cria uma cobrança com boleto e Pix (billingType UNDEFINED deixa o devedor escolher). Multa 2% e juros 1% a.m. (limite legal do CDC). */
export async function criaCobranca(c: NovaCobranca): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>("/payments", {
    method: "POST",
    json: {
      customer: c.customer, billingType: "UNDEFINED", value: Math.round(c.valor * 100) / 100, dueDate: c.vencimento,
      description: c.descricao.slice(0, 500), externalReference: c.externalReference,
      fine: { value: 2 }, interest: { value: 1 },
      ...(c.descontoPct ? { discount: { value: c.descontoPct, type: "PERCENTAGE", dueDateLimitDays: c.descontoAteDias ?? 0 } } : {}),
    },
  });
}

export const buscaCobranca = (id: string) => asaasFetch<AsaasPayment>(`/payments/${id}`);
export const cancelaCobranca = (id: string) => asaasFetch<{ deleted: boolean; id: string }>(`/payments/${id}`, { method: "DELETE" });
export async function pixCopiaECola(id: string): Promise<string | null> {
  try { const r = await asaasFetch<{ payload?: string }>(`/payments/${id}/pixQrCode`); return r.payload ?? null; } catch { return null; }
}
