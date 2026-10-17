import { supabaseEnv } from "@/lib/config/supabase-env";
import { asaasEnv } from "@/lib/asaas";
import { whatsappEnv } from "@/lib/whatsapp";

/** Página pública de diagnóstico de configuração. Não expõe segredos: só o host da URL e o prefixo da chave. */
export const dynamic = "force-dynamic";

function Linha({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--ink-05)" }}>
      <span className="meta">{k}</span><b className={ok === false ? "err" : ok ? "okt" : ""} style={{ fontSize: 13, overflowWrap: "anywhere" }}>{v}</b>
    </div>
  );
}

export default async function Diagnostico() {
  const env = supabaseEnv();
  const asaas = asaasEnv();
  const wa = whatsappEnv();
  const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.url);
  const anonTipo = env.anon.startsWith("eyJ") ? "JWT (anon legada)" : env.anon.startsWith("sb_publishable_") ? "publishable (nova)" : env.anon ? "formato não reconhecido" : "vazia";
  let auth = "não testado";
  if (urlOk) {
    try {
      const r = await fetch(`${env.url}/auth/v1/health`, { headers: { apikey: env.anon }, cache: "no-store" });
      auth = r.ok ? "OK: o servidor de autenticação respondeu" : `HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`;
    } catch (e) {
      auth = `falha de rede: ${(e as Error).message}`;
    }
  }
  return (
    <main className="wrap" style={{ paddingBlock: 40 }}>
      <div className="panel" style={{ maxWidth: 720 }}>
        <div className="eyebrow">Diagnóstico de configuração</div>
        <h1 style={{ marginBottom: 16 }}>Variáveis do Supabase</h1>
        <Linha k="NEXT_PUBLIC_SUPABASE_URL" v={env.url || "(vazia)"} ok={urlOk} />
        <Linha k="Formato esperado" v="https://SEU-PROJETO.supabase.co (sem barra no final, sem /dashboard)" />
        <Linha k="NEXT_PUBLIC_SUPABASE_ANON_KEY" v={env.anon ? `${env.anon.slice(0, 12)}… (${env.anon.length} caracteres) · ${anonTipo}` : "(vazia)"} ok={env.anon.length > 20} />
        <Linha k="SUPABASE_SERVICE_ROLE_KEY" v={process.env.SUPABASE_SERVICE_ROLE_KEY ? "definida" : "não definida (só necessária para scripts)"} />
        <Linha k="Teste de autenticação" v={auth} ok={auth.startsWith("OK")} />
        <h2 style={{ margin: "20px 0 8px" }}>Asaas</h2>
        <Linha k="ASAAS_API_KEY" v={asaas.ok ? `definida (${asaas.key.slice(0, 10)}…)` : "não definida: emissão de boletos desligada"} ok={asaas.ok} />
        <Linha k="ASAAS_ENV" v={`${asaas.env} → ${asaas.base}`} ok={asaas.env === "production" || asaas.env === "sandbox"} />
        <Linha k="ASAAS_WEBHOOK_TOKEN" v={asaas.webhookOk ? "definido" : "não definido: webhook recusa chamadas"} ok={asaas.webhookOk} />
        <Linha k="URL do webhook" v="https://SEU-DOMINIO/api/asaas/webhook (configurar no painel do Asaas com o mesmo token)" />
        <h2 style={{ margin: "20px 0 8px" }}>WhatsApp (Meta Cloud API)</h2>
        <Linha k="WHATSAPP_TOKEN" v={wa.token ? `definido (${wa.token.slice(0, 6)}…)` : "não definido: envio desligado"} ok={wa.token.length > 20} />
        <Linha k="WHATSAPP_PHONE_NUMBER_ID" v={wa.phoneId || "não definido"} ok={/^\d{6,}$/.test(wa.phoneId)} />
        <Linha k="WHATSAPP_VERIFY_TOKEN / APP_SECRET" v={wa.webhookOk ? "definidos" : "faltando: webhook de status/respostas não funciona"} ok={wa.webhookOk} />
        <Linha k="Régua automática" v={wa.reguaAuto ? "LIGADA (envia lembretes sozinha nos dias úteis às 9h)" : "desligada (o cron só simula)"} ok={wa.reguaAuto || undefined} />
        <Linha k="CRON_SECRET" v={process.env.CRON_SECRET ? "definido" : "não definido: o cron da régua recusa chamadas"} ok={!!process.env.CRON_SECRET} />
        <Linha k="URL do webhook" v={`https://SEU-DOMINIO/api/whatsapp/webhook (API ${wa.version})`} />
        <Linha k="Assinatura da WABA" v={`${process.env.WHATSAPP_WABA_ID ? `WHATSAPP_WABA_ID definido` : "WHATSAPP_WABA_ID não definido (descoberto pelo token)"} · confira em /api/whatsapp/assinatura logado como admin; sem app assinado, status e respostas não chegam`} />
        <p className="meta" style={{ marginTop: 16 }}>Alterou uma variável na Vercel? Só vale após <b>Redeploy</b>. Esta página não mostra chaves completas.</p>
      </div>
    </main>
  );
}
