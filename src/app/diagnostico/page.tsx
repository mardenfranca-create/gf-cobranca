import { supabaseEnv } from "@/lib/config/supabase-env";

/** Página pública de diagnóstico de configuração. Não expõe segredos: só o host da URL e o prefixo da chave. */
export const dynamic = "force-dynamic";

export default async function Diagnostico() {
  const env = supabaseEnv();
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
  const Linha = ({ k, v, ok }: { k: string; v: string; ok?: boolean }) => (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--ink-05)" }}>
      <span className="meta">{k}</span><b className={ok === false ? "err" : ok ? "okt" : ""} style={{ fontSize: 13, overflowWrap: "anywhere" }}>{v}</b>
    </div>
  );
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
        <p className="meta" style={{ marginTop: 16 }}>Alterou uma variável na Vercel? Só vale após <b>Redeploy</b>. Esta página não mostra chaves completas.</p>
      </div>
    </main>
  );
}
