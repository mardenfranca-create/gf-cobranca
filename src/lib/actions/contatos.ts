"use server";
import { revalidatePath } from "next/cache";
import { exigeEquipe } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { cruzaContatos, leContatos, resumoCruzamento, type CasoTel, type Contato, type Cruzamento } from "@/lib/domain/contatos";

export type PreviaTelefones =
  | { ok: false; erro: string }
  | { ok: true; arquivos: number; lidos: number; avisos: string[]; resumo: ReturnType<typeof resumoCruzamento>; itens: Cruzamento[] };

/** Lê um ou mais arquivos de contatos e cruza com os casos abertos. Nada é gravado. */
export async function previaTelefones(fd: FormData): Promise<PreviaTelefones> {
  await exigeEquipe();
  const arquivos = fd.getAll("arquivos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!arquivos.length) return { ok: false, erro: "Escolha pelo menos um arquivo." };
  if (arquivos.length > 120) return { ok: false, erro: "Máximo de 120 arquivos por vez." };
  const contatos: Contato[] = [];
  const avisos: string[] = [];
  for (const f of arquivos) {
    const texto = Buffer.from(await f.arrayBuffer()).toString("utf-8");
    const r = leContatos(texto, f.name);
    if (r.erro) avisos.push(r.erro);
    contatos.push(...r.contatos);
  }
  // Mesmo telefone em vários arquivos (páginas repetidas): fica o primeiro.
  const vistos = new Set<string>();
  const unicos = contatos.filter((c) => (vistos.has(c.telefone) ? false : (vistos.add(c.telefone), true)));
  const sb = await supabaseServer();
  const [{ data: casos, error }, { data: clientes }] = await Promise.all([
    sb.from("casos").select("id, cliente_id, devedor, telefone, fase").not("fase", "in", "(pago,devolvido)").limit(5000),
    sb.from("clientes").select("id, nome, nome_curto"),
  ]);
  if (error) return { ok: false, erro: error.message };
  const itens = cruzaContatos(unicos, (casos ?? []) as CasoTel[], clientes ?? []);
  // Só devolve o que interessa à tela: casa com caso, ou é contato de cobrança sem caso.
  const relevantes = itens.filter((x) => x.kind !== "sem_caso" || x.cobranca);
  return { ok: true, arquivos: arquivos.length, lidos: contatos.length, avisos, resumo: resumoCruzamento(itens), itens: relevantes };
}

/** Grava os telefones escolhidos. `escolhas` = lista de "caso_id|telefone"; `sobrescrever` libera trocar telefone já cadastrado. */
export async function aplicarTelefones(fd: FormData): Promise<{ ok: boolean; msg: string }> {
  const u = await exigeEquipe();
  const escolhas = fd.getAll("escolha").map(String).filter(Boolean);
  const sobrescrever = fd.get("sobrescrever") === "on";
  if (!escolhas.length) return { ok: false, msg: "Nenhum telefone marcado." };
  const sb = await supabaseServer();
  let gravados = 0, pulados = 0;
  for (const e of escolhas) {
    const [casoId, telefone, nomeContato] = e.split("|");
    if (!casoId || !/^\d{10,15}$/.test(telefone)) { pulados++; continue; }
    const { data: caso } = await sb.from("casos").select("id, telefone, devedor").eq("id", casoId).maybeSingle();
    if (!caso) { pulados++; continue; }
    const atual = (caso.telefone ?? "").replace(/\D/g, "");
    if (atual.length >= 10 && !sobrescrever) { pulados++; continue; }
    if (atual.slice(-8) === telefone.slice(-8)) { pulados++; continue; }
    const local = telefone.startsWith("55") ? telefone.slice(2) : telefone;
    const formatado = local.length === 11 ? `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}` : telefone;
    const { error } = await sb.from("casos").update({ telefone: formatado }).eq("id", casoId);
    if (error) { pulados++; continue; }
    await sb.from("eventos").insert({ caso_id: casoId, autor: u.nome, autor_id: u.id, tipo: "cadastro", texto: `Telefone ${atual ? "atualizado" : "preenchido"} pela importação de contatos: ${formatado}${nomeContato ? ` (contato "${nomeContato}")` : ""}${atual ? ` · antes: ${caso.telefone}` : ""}.`, visivel_cliente: false });
    gravados++;
  }
  revalidatePath("/", "layout");
  return { ok: gravados > 0, msg: `${gravados} ${gravados === 1 ? "telefone gravado" : "telefones gravados"}${pulados ? ` · ${pulados} ${pulados === 1 ? "pulado" : "pulados"} (já tinha telefone, igual ao atual ou inválido)` : ""}.` };
}
