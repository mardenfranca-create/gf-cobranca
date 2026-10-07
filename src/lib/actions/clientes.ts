"use server";
import { revalidatePath } from "next/cache";
import { exigeAdmin, exigeEquipe } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { listaRegua } from "@/lib/data";
import { hojeISO } from "@/lib/domain/datas";
import { colunasProxima, derivaProxima, mapaRegua } from "@/lib/domain/regua";
import type { Caso } from "@/lib/domain/types";

/** Salva os dias da régua e reprograma a próxima ação automática de todos os casos abertos (as marcadas à mão são preservadas). */
export async function salvarRegua(fd: FormData) {
  await exigeAdmin();
  const sb = await supabaseServer();
  const atual = await listaRegua();
  for (const r of atual) {
    const v = Number(fd.get(`dias_${r.chave}`));
    if (Number.isFinite(v) && v >= 0 && v !== r.dias) {
      const { error } = await sb.from("regua").update({ dias: Math.round(v) }).eq("chave", r.chave);
      if (error) throw new Error(error.message);
    }
  }
  await reprogramarAutomaticos();
  revalidatePath("/", "layout");
}

export async function reprogramarAutomaticos() {
  await exigeEquipe();
  const sb = await supabaseServer();
  const regua = mapaRegua(await listaRegua());
  const hoje = hojeISO();
  const { data: casos } = await sb.from("casos").select("*").not("fase", "in", "(pago,devolvido)").eq("proxima_auto", true).limit(5000);
  for (const c of (casos ?? []) as Caso[]) {
    const p = derivaProxima(c, regua, hoje);
    if (p && (p.data !== c.proxima_data || p.nota !== c.proxima_nota)) await sb.from("casos").update(colunasProxima(p)).eq("id", c.id);
  }
}

export async function salvarCliente(fd: FormData) {
  const u = await exigeAdmin();
  const sb = await supabaseServer();
  const id = String(fd.get("id"));
  const { data: atual } = await sb.from("clientes").select("*").eq("id", id).single();
  if (!atual) throw new Error("Cliente não encontrado");
  const num = (k: string, d: number) => { const v = Number(fd.get(k)); return Number.isFinite(v) ? v : d; };
  const novo = {
    limites: { desc: num("desc", 20), parc: num("parc", 10), ent: num("ent", 10), min: num("min", 250) },
    honorarios: { extra: num("extra", 20), jud: num("jud", 25) },
    protesto_dias: num("protesto", 45),
    contato: String(fd.get("contato") ?? "").trim() || null,
  };
  const { error } = await sb.from("clientes").update(novo).eq("id", id);
  if (error) throw new Error(error.message);
  // Registro de quem mudou o quê (tabela da migration 0002; se ainda não existir, não bloqueia o salvamento).
  const registros = (Object.keys(novo) as (keyof typeof novo)[])
    .filter((k) => JSON.stringify(novo[k]) !== JSON.stringify((atual as Record<string, unknown>)[k] ?? null))
    .map((k) => ({ cliente_id: id, autor: u.nome, autor_id: u.id, campo: k, antes: (atual as Record<string, unknown>)[k] ?? null, depois: novo[k] }));
  if (registros.length) {
    const { error: e2 } = await sb.from("ajustes_cliente").insert(registros);
    if (e2 && !/ajustes_cliente/.test(e2.message)) throw new Error(e2.message);
  }
  revalidatePath("/", "layout");
}

export async function criarCliente(fd: FormData) {
  await exigeAdmin();
  const sb = await supabaseServer();
  const nome = String(fd.get("nome") ?? "").trim();
  if (!nome) throw new Error("Informe o nome");
  const id = String(fd.get("id") ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") || nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").slice(0, 24);
  const tipo = String(fd.get("tipo") ?? "b2b") as "escola" | "contab" | "b2b" | "assoc";
  const { error } = await sb.from("clientes").insert({ id, nome, nome_curto: String(fd.get("nome_curto") ?? "").trim() || nome.split(" ").slice(0, 2).join(" "), tipo });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}
