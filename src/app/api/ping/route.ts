// Rota de aquecimento: o VPS do escritório chama a cada 4 minutos em horário comercial
// (deploy/aquecer.cron) para a função da Vercel não esfriar. Sem sessão, sem banco:
// só confirma que a função está de pé. Liberada no proxy junto com os webhooks.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
}
