/**
 * Carga inicial da carteira a partir do JSON exportado do Trello.
 * Uso: SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... npx tsx scripts/carga-trello.ts caminho/para/trello.json
 * Idempotente: cartões já importados (origem.trello_id) são ignorados.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cargaTrello } from "../src/lib/actions/importar";
import type { Database } from "../src/lib/supabase/database.types";

async function main() {
  const arquivo = process.argv[2];
  if (!arquivo) throw new Error("Informe o caminho do JSON do Trello.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  const sb = createClient<Database>(url, key, { auth: { persistSession: false } });
  const board = JSON.parse(readFileSync(arquivo, "utf8"));
  // Carga com chave de serviço: passa por cima do RLS e não exige usuário logado.
  const r = await cargaTrello(board, "Carga inicial", sb as never);
  console.log(`Casos inseridos: ${r.inseridos} · já existiam: ${r.ignorados} · cartões de base documental ignorados: ${r.semCaso}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
