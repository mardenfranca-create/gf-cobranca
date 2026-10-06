"use server";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { exigeEquipe } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { listaCasos, listaClientes, listaRegua, parcelasDosCasos } from "@/lib/data";
import { addDias, fmtData, hojeISO } from "@/lib/domain/datas";
import { colunasExcecao, colunasProxima, derivaProxima, mapaRegua } from "@/lib/domain/regua";
import { hashLinhas, normalizaPlanilha, reconcilia, type LinhaClassificada, type Reconciliacao } from "@/lib/domain/reconcile";
import { parseTrello } from "@/lib/domain/trello";
import type { Caso } from "@/lib/domain/types";

export type Previa = {
  ok: true;
  arquivo: string;
  clienteFixo: string | null;
  hash: string;
  jaImportada: boolean;
  resumo: Reconciliacao["resumo"];
  linhas: (Omit<LinhaClassificada, "caso"> & { caso_id: string | null; caso_fase: string | null })[];
  ausentes: { id: string; devedor: string; fase: string }[];
} | { ok: false; erro: string };

async function lerMatriz(file: File): Promise<unknown[][]> {
  const nome = file.name.toLowerCase();
  if (/\.xlsx?$|\.xlsm$/.test(nome)) {
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });
  }
  const txt = await file.text();
  const linhas = txt.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  const sep = linhas[0]?.includes(";") ? ";" : ",";
  return linhas.map((l) => l.split(sep).map((c) => c.trim()));
}

/** Passo 1: lê a planilha e devolve a reconciliação para o operador conferir. Não grava nada. */
export async function previaPlanilha(fd: FormData): Promise<Previa> {
  await exigeEquipe();
  const file = fd.get("arquivo");
  if (!(file instanceof File) || !file.size) return { ok: false, erro: "Escolha um arquivo .xlsx ou .csv." };
  const clienteFixo = String(fd.get("cliente") ?? "").trim() || null;
  const hoje = hojeISO();
  const { linhas, faltam, cabecalho } = normalizaPlanilha(await lerMatriz(file), hoje);
  if (faltam.length) return { ok: false, erro: `Faltam colunas: ${faltam.join(", ")}. Cabeçalho lido: ${cabecalho.join(", ")}.` };
  const [abertos, clientes] = await Promise.all([listaCasos({ abertos: true }), listaClientes()]);
  const parcelas = await parcelasDosCasos(abertos.map((c) => c.id));
  const rec = reconcilia(linhas, abertos, parcelas, clientes, clienteFixo);
  const hash = await hashLinhas(linhas, clienteFixo);
  const sb = await supabaseServer();
  const { data: ja } = await sb.from("importacoes").select("id").eq("hash", hash).maybeSingle();
  return {
    ok: true, arquivo: file.name, clienteFixo, hash, jaImportada: !!ja, resumo: rec.resumo,
    linhas: rec.linhas.map(({ caso, ...l }) => ({ ...l, caso_id: caso?.id ?? null, caso_fase: caso?.fase ?? null })),
    ausentes: rec.ausentes.map((c) => ({ id: c.id, devedor: c.devedor, fase: c.fase })),
  };
}

/** Passo 2: aplica a reconciliação. Idempotente pelo hash: a mesma planilha não entra duas vezes. */
export async function aplicarPlanilha(fd: FormData): Promise<{ ok: boolean; msg: string }> {
  const u = await exigeEquipe();
  const previa = JSON.parse(String(fd.get("previa"))) as Extract<Previa, { ok: true }>;
  const marcarAusentes = fd.get("ausentes") === "on";
  const sb = await supabaseServer();
  const { data: ja } = await sb.from("importacoes").select("id").eq("hash", previa.hash).maybeSingle();
  if (ja) return { ok: false, msg: "Esta planilha já foi importada. Nada foi alterado." };
  const regua = mapaRegua(await listaRegua());
  const hoje = hojeISO();
  const stamp = `planilha ${previa.arquivo} de ${fmtData(hoje)}`;
  const n = { novos: 0, consolidados: 0, baixas: 0, excecoes: 0, ausentes: 0 };
  const ev = (caso_id: string, tipo: string, texto: string) => sb.from("eventos").insert({ caso_id, autor: u.nome, autor_id: u.id, tipo, texto, visivel_cliente: true });

  for (const l of previa.linhas.filter((x) => !x.erros.length && x.cliente_id)) {
    const cid = l.cliente_id!;
    if (l.kind === "novo" || (l.kind === "excecao" && !l.caso_id)) {
      const base = { fase: "regua" as const, fase_nota: "Régua automática", ultima_mov_em: new Date().toISOString() };
      const prox = l.kind === "excecao" ? { data: addDias(hoje, regua.excecao?.dias ?? 30), tipo: "decidir" as const, nota: "Revisar exceção: Não cobrar", auto: true } : derivaProxima({ ...base, exc_tipo: null, exc_revisao: null }, regua, hoje);
      const { data: novo, error } = await sb.from("casos").insert({
        cliente_id: cid, devedor: l.devedor, documento: l.documento, referencia: l.referencia.split(" - ")[0] || "Título em cobrança", detalhe: l.referencia.split(" - ")[1] ?? null,
        valor_original: l.valor, valor_atualizado: l.valor, valor_fonte: "planilha", ...base, responsavel: "Ana Paula", ...colunasProxima(prox),
        ...(l.kind === "excecao" ? colunasExcecao("nao_cobrar", "Planilha: " + (l.situacao || "não cobrar"), hoje, undefined, regua) : {}),
        telefone: l.telefone || null, email: l.email || null, entrada_em: hoje, pendencias: [],
      }).select("id").single();
      if (error) throw new Error(error.message);
      await sb.from("parcelas").insert({ caso_id: novo.id, referencia: l.referencia, valor: l.valor!, vencimento: l.vencimento! });
      await ev(novo.id, "importacao", `Caso aberto via ${stamp}. Primeira notificação agendada na régua.`);
      if (l.kind === "excecao") n.excecoes++; else n.novos++;
    } else if (l.caso_id && l.kind === "consolida") {
      const { data: c } = await sb.from("casos").select("valor_original, valor_atualizado").eq("id", l.caso_id).single();
      await sb.from("parcelas").upsert({ caso_id: l.caso_id, referencia: l.referencia, valor: l.valor!, vencimento: l.vencimento! }, { onConflict: "caso_id,referencia,vencimento", ignoreDuplicates: true });
      await sb.from("casos").update({ valor_original: (c?.valor_original ?? 0) + l.valor!, valor_atualizado: (c?.valor_atualizado ?? 0) + l.valor!, valor_fonte: "planilha (consolidado)", ultima_mov_em: new Date().toISOString() }).eq("id", l.caso_id);
      await ev(l.caso_id, "importacao", `${stamp}: nova parcela em aberto (${l.referencia}, R$ ${l.valor}). Caso consolidado, régua mantida.`);
      n.consolidados++;
    } else if (l.caso_id && l.kind === "igual") {
      await ev(l.caso_id, "importacao", `${stamp}: parcela ${l.referencia} confirmada em aberto.`);
    } else if (l.caso_id && l.kind === "baixa") {
      await sb.from("casos").update({ fase: "confirma", fase_nota: "Baixa informada em planilha", ...colunasProxima({ data: addDias(hoje, 1), tipo: "decidir", nota: "Conferir baixa informada na planilha", auto: true }), ultima_mov_em: new Date().toISOString() }).eq("id", l.caso_id);
      await ev(l.caso_id, "importacao", `${stamp} informa pagamento. Cobrança suspensa até conferência no extrato.`);
      n.baixas++;
    } else if (l.caso_id && l.kind === "excecao") {
      await sb.from("casos").update({ ...colunasExcecao("nao_cobrar", "Planilha: " + (l.situacao || "não cobrar"), hoje, undefined, regua), ...colunasProxima({ data: addDias(hoje, regua.excecao?.dias ?? 30), tipo: "decidir", nota: "Revisar exceção: Não cobrar", auto: true }), ultima_mov_em: new Date().toISOString() }).eq("id", l.caso_id);
      await ev(l.caso_id, "importacao", `${stamp} marcou "${l.situacao}". Régua pausada.`);
      n.excecoes++;
    }
  }
  if (marcarAusentes) {
    for (const a of previa.ausentes) {
      await sb.from("casos").update({ fase: "confirma", fase_nota: "Ausente na planilha do cliente", ...colunasProxima({ data: addDias(hoje, 1), tipo: "decidir", nota: "Ausente na planilha: conferir se foi pago", auto: true }), ultima_mov_em: new Date().toISOString() }).eq("id", a.id);
      await ev(a.id, "importacao", `${stamp} não traz este devedor. Possível pagamento: conferir antes de retomar.`);
      n.ausentes++;
    }
  }
  await sb.from("importacoes").insert({ cliente_id: previa.clienteFixo, origem: "planilha", arquivo: previa.arquivo, hash: previa.hash, linhas: previa.linhas.length, resumo: n, criado_por: u.nome });
  revalidatePath("/", "layout");
  return { ok: true, msg: `Aplicado: ${n.novos} novos, ${n.consolidados} consolidados, ${n.baixas + n.ausentes} para conferência de baixa, ${n.excecoes} em exceção.` };
}

/** Carga do Trello pela aba Importar. Idempotente por cartão (origem.trello_id). */
export async function importarTrello(fd: FormData): Promise<{ ok: boolean; msg: string }> {
  const u = await exigeEquipe();
  const file = fd.get("arquivo");
  if (!(file instanceof File) || !file.size) return { ok: false, msg: "Escolha o JSON exportado do Trello." };
  let board: Parameters<typeof parseTrello>[0];
  try { board = JSON.parse(await file.text()); } catch { return { ok: false, msg: "Arquivo inválido: não é um JSON do Trello." }; }
  if (!board.cards || !board.lists) return { ok: false, msg: "JSON sem cartões ou listas. Exporte o quadro, não um cartão." };
  const r = await cargaTrello(board, u.nome);
  revalidatePath("/", "layout");
  return { ok: true, msg: `${r.inseridos} casos importados, ${r.ignorados} já existiam, ${r.semCaso} cartões de base documental ignorados.` };
}

export async function cargaTrello(board: Parameters<typeof parseTrello>[0], autor: string, sbOverride?: Awaited<ReturnType<typeof supabaseServer>>) {
  const sb = sbOverride ?? (await supabaseServer());
  const regua = mapaRegua(await listaRegua().catch(async () => { const { data } = await sb.from("regua").select("*"); return data ?? []; }));
  const hoje = hojeISO();
  const parsed = parseTrello(board, new Date());
  for (const c of parsed.clientes) await sb.from("clientes").upsert({ id: c.id, nome: c.nome, nome_curto: c.nome_curto, tipo: c.tipo }, { onConflict: "id", ignoreDuplicates: true });
  const { data: existentes } = await sb.from("casos").select("id, origem").not("origem", "is", null).limit(10000);
  const jaTem = new Set((existentes ?? []).map((e) => (e.origem as { trello_id?: string } | null)?.trello_id).filter(Boolean));
  let inseridos = 0, ignorados = 0;
  for (const t of parsed.casos) {
    if (jaTem.has(t.trello_id)) { ignorados++; continue; }
    const fechado = t.fase === "pago" || t.fase === "devolvido";
    const base: Partial<Caso> = { fase: t.fase, fase_nota: t.fase_nota, exc_tipo: t.excecao, exc_revisao: t.excecao ? addDias(hoje, t.excecao === "prescrito" ? 7 : regua.excecao?.dias ?? 30) : null, ultima_mov_em: t.ultima_mov_em };
    const prox = fechado ? null : derivaProxima(base as Caso, regua, hoje);
    const { data: novo, error } = await sb.from("casos").insert({
      cliente_id: t.cliente.id, devedor: t.devedor, documento: t.documento, referencia: t.referencia, detalhe: t.detalhe, valor_original: t.valor, valor_atualizado: t.valor, valor_fonte: t.valor_fonte,
      fase: t.fase, fase_nota: t.fase_nota, responsavel: fechado ? null : t.responsavel, ...colunasProxima(prox),
      ...(t.excecao ? { exc_tipo: t.excecao, exc_motivo: "Etiqueta do Trello", exc_desde: hoje, exc_revisao: base.exc_revisao ?? undefined } : {}),
      // origem.trello_id garante idempotência da carga,
      telefone: t.telefone, email: t.email, origem: { trello_id: t.trello_id, trello_url: t.url ?? undefined, trello_list: t.lista, etiquetas: t.etiquetas },
      pendencias: t.pendencias, entrada_em: t.entrada_em, ultima_mov_em: t.ultima_mov_em, encerrado_em: fechado ? t.ultima_mov_em : null,
    }).select("id").single();
    if (error) throw new Error(`${t.devedor}: ${error.message}`);
    if (t.eventos.length) await sb.from("eventos").insert(t.eventos.map((e) => ({ caso_id: novo.id, data: e.data, autor: e.autor, tipo: "trello", texto: e.texto, visivel_cliente: e.autor !== "Trello" })));
    inseridos++;
  }
  await sb.from("importacoes").insert({ origem: "trello", arquivo: board.name ?? "trello.json", hash: `trello-${Date.now()}`, linhas: parsed.casos.length, resumo: { ...parsed.resumo, inseridos, ignorados }, criado_por: autor });
  return { inseridos, ignorados, semCaso: parsed.ignorados.length };
}
