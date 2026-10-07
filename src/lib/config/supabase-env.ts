/** Lê e normaliza as variáveis do Supabase. Tolera barra no final e espaços acidentais. */
export function supabaseEnv() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  return { url, anon, ok: /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && anon.length > 20 };
}
