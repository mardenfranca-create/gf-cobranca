import type { Metadata } from "next";
import Link from "next/link";
import { exigeEquipe } from "@/lib/auth";
import { mapaClientes } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import { fmtDataHora } from "@/lib/domain/datas";
import { agrupaConversas, filtraConversas, fmtTelefone, type CasoResumo } from "@/lib/domain/inbox";
import { canonizaTelefone, TEMPLATES } from "@/lib/domain/whatsapp";
import { MENSAGEM_STATUS, type Mensagem } from "@/lib/domain/types";
import { whatsappEnv } from "@/lib/whatsapp";
import { estadoRegua } from "@/lib/config/regua";
import { alternarOptOut, enviarWhatsApp, responderWhatsApp, vincularNumero } from "@/lib/actions/whatsapp";
import { AutoRefresh, MarcarLida, RolaParaFim } from "@/components/WhatsAppInbox";
import { PageHead, Pill } from "@/components/ui";

export const metadata: Metadata = { title: "WhatsApp" };

const COLS = "id, devedor, cliente_id, responsavel, fase, wa_optout, telefone";

export default async function WhatsAppPage(props: PageProps<"/whatsapp">) {
  const u = await exigeEquipe();
  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const sel = str("c") ? canonizaTelefone(str("c")) : "";
  const so = str("so") || "todas";
  const q = str("q");
  const busca = str("busca");
  const wa = whatsappEnv();
  const sb = await supabaseServer();
  const regua = await estadoRegua(sb);
  const reguaLigada = !regua.pausada && wa.reguaAuto && wa.ok;

  const [{ data: msgsRaw, error }, clientes] = await Promise.all([
    sb.from("mensagens").select("*").order("criado_em", { ascending: false }).limit(3000),
    mapaClientes(),
  ]);
  const mensagens = (msgsRaw ?? []) as Mensagem[];
  const casoIds = [...new Set(mensagens.map((m) => m.caso_id).filter(Boolean))] as string[];
  const { data: casosRaw } = casoIds.length ? await sb.from("casos").select(COLS).in("id", casoIds) : { data: [] };
  const casos = Object.fromEntries(((casosRaw ?? []) as CasoResumo[]).map((c) => [c.id, c]));
  const conversas = agrupaConversas(mensagens, casos, new Date());
  // Agenda: nome para números sem caso (tabela contatos; vazia se a migration 0008 não existir).
  const semCasoTels = conversas.filter((c) => !c.caso).map((c) => c.telefone);
  const { data: agendaRaw } = semCasoTels.length ? await sb.from("contatos").select("telefone, nome, etiquetas").in("telefone", semCasoTels.slice(0, 1000)) : { data: [] };
  const agenda = new Map((agendaRaw ?? []).map((a) => [a.telefone, a]));
  const nomeDe = (tel: string) => agenda.get(tel)?.nome ?? null;
  const lista = filtraConversas(conversas, so, q);
  const atual = sel ? conversas.find((c) => c.telefone === sel) ?? null : null;
  const fio = atual ? mensagens.filter((m) => canonizaTelefone(m.telefone) === atual.telefone).sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1)) : [];
  const aguardando = conversas.filter((c) => c.aguardando).length;
  const semCaso = conversas.filter((c) => !c.caso).length;

  // Candidatos para vincular um número sem caso.
  let candidatos: CasoResumo[] = [];
  if (atual && !atual.caso) {
    let qc = sb.from("casos").select(COLS).not("fase", "in", "(pago,devolvido)").order("devedor").limit(20);
    if (busca.trim()) qc = qc.ilike("devedor", `%${busca.trim()}%`);
    candidatos = ((await qc).data ?? []) as CasoResumo[];
  }

  const href = (p: Record<string, string>) => {
    const u2 = new URLSearchParams();
    const all = { so, q, c: sel, ...p };
    for (const [k, v] of Object.entries(all)) if (v) u2.set(k, v);
    return `/whatsapp?${u2}`;
  };
  const voltar = href({});
  const chip = (key: string, label: string, n?: number) => <Link key={key} href={href({ so: key })} className="chip" aria-current={so === key ? "true" : undefined}>{label}{n != null && <small className="num">{n}</small>}</Link>;
  const ok = str("ok"); const erro = str("erro");

  return (
    <>
      <AutoRefresh />
      <PageHead eyebrow="WhatsApp" titulo="Conversas com os devedores" sub="Tudo que entra e sai pelo número do escritório, em um lugar só. Quem está esperando resposta aparece primeiro. Dentro de 24h da última mensagem do devedor dá para responder livre; fora, só modelo aprovado.">
        <div className="actions" style={{ alignItems: "center" }}>
          {!wa.ok && <div className="verdict warn">WhatsApp não configurado na Vercel. Dá para ler, mas não enviar.</div>}
          <span className={`pill ${reguaLigada ? "ph-quebra" : "ph-devolvido"}`}>Régua automática {reguaLigada ? "LIGADA" : "pausada"}</span>
          {u.papel === "admin" && <Link className="btn ghost sm" href="/painel">{reguaLigada ? "Pausar no Painel" : "Painel"}</Link>}
        </div>
      </PageHead>
      {error && <div className="verdict out" style={{ marginBottom: 12 }}>Não foi possível ler as mensagens: {error.message}. As migrations 0004 e 0006 já foram aplicadas?</div>}
      {ok && <div className="verdict in" style={{ marginBottom: 12 }}>{ok}</div>}
      {erro && <div className="verdict out" style={{ marginBottom: 12 }}>{erro}</div>}

      <div className="wa-wrap">
        <aside className="wa-list">
          <form className="toolbar" method="get" style={{ marginBottom: 10 }}>
            <input type="hidden" name="so" value={so} />
            {sel && <input type="hidden" name="c" value={sel} />}
            <input className="search" name="q" defaultValue={q} type="search" placeholder="Nome, texto ou número" aria-label="Buscar conversas" />
          </form>
          <div className="chips" style={{ marginBottom: 10 }}>
            {chip("todas", "Todas", conversas.length)}
            {chip("aguardando", "Esperando resposta", aguardando)}
            {chip("abertas", "Janela aberta")}
            {chip("sem_caso", "Sem caso", semCaso)}
          </div>
          <div className="wa-items">
            {lista.length === 0 && <div className="empty">Nenhuma conversa{q ? " com essa busca" : ""}.</div>}
            {lista.map((c) => (
              <Link key={c.telefone} href={href({ c: c.telefone })} className="wa-item" aria-current={atual?.telefone === c.telefone ? "true" : undefined} data-aguardando={c.aguardando ? "" : undefined}>
                <div className="wa-item-top">
                  <b>{c.caso?.devedor ?? nomeDe(c.telefone) ?? fmtTelefone(c.telefone)}</b>
                  <span className="meta num">{fmtDataHora(c.ultima.criado_em).replace(/^(\d\d\/\d\d)\/\d{4}/, "$1")}</span>
                </div>
                <div className="wa-item-sub">
                  <span className="meta">{c.caso ? `${clientes[c.caso.cliente_id]?.nome_curto ?? c.caso.cliente_id} · ${c.caso.responsavel ?? "sem responsável"}` : nomeDe(c.telefone) ? `agenda${agenda.get(c.telefone)?.etiquetas?.length ? ` · ${agenda.get(c.telefone)!.etiquetas.join(", ")}` : ""} · sem caso` : "número sem caso"}</span>
                  {c.naoLidas > 0 && <span className="count num">{c.naoLidas}</span>}
                </div>
                <div className="wa-item-preview">{c.ultima.direcao === "saida" ? "Você: " : ""}{c.ultima.texto}</div>
              </Link>
            ))}
          </div>
        </aside>

        <section className="wa-conv">
          {!atual ? (
            <div className="empty" style={{ margin: "auto" }}>{conversas.length ? "Escolha uma conversa ao lado." : "Nenhuma mensagem ainda. Envie um modelo por um caso ou aguarde o devedor responder."}</div>
          ) : (
            <>
              <MarcarLida telefone={atual.telefone} pendentes={atual.naoLidas} />
              <RolaParaFim chave={`${atual.telefone}:${fio.length}:${atual.ultima.id}`} />
              <header className="wa-head">
                <div>
                  <div className="wa-title">{atual.caso?.devedor ?? nomeDe(atual.telefone) ?? "Número sem caso"} <span className="meta num">{fmtTelefone(atual.telefone)}</span></div>
                  <div className="meta">
                    {atual.caso ? <>{clientes[atual.caso.cliente_id]?.nome ?? atual.caso.cliente_id} · {atual.caso.responsavel ?? "sem responsável"} · <Pill fase={atual.caso.fase} /> · <Link href={`/casos/${atual.caso.id}`}>abrir caso</Link></> : (nomeDe(atual.telefone) ? "Contato da agenda, sem caso de cobrança. Vincule a um caso para responder por aqui." : "Chegou pelo webhook sem combinar com nenhum caso. Vincule abaixo para responder.")}
                  </div>
                </div>
                <div className="wa-head-side">
                  {atual.janelaAte ? <span className="pill ph-pago">Janela aberta até {fmtDataHora(atual.janelaAte)}</span> : <span className="pill ph-devolvido">Fora da janela de 24h</span>}
                  {atual.caso?.wa_optout && <span className="pill ph-quebra">Bloqueado (SAIR)</span>}
                </div>
              </header>

              <div className="wa-chat" id="wa-chat">
                {fio.map((m) => {
                  const st = MENSAGEM_STATUS[m.status] ?? { label: m.status, cls: "ph-confirma" };
                  return (
                    <div key={m.id} className={`wa-msg ${m.direcao}`}>
                      <div className="wa-bubble">
                        <div className="wa-text">{m.texto}</div>
                        <div className="wa-meta num">{m.direcao === "saida" ? `${m.criado_por ?? m.origem} · ` : ""}{fmtDataHora(m.criado_em)}{m.direcao === "saida" && <> · <span className={`pill ${st.cls}`}>{st.label}</span></>}{m.template && <> · {TEMPLATES[m.template]?.rotulo ?? m.template}</>}</div>
                        {m.erro && <div className="err">{m.erro}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <footer className="wa-composer">
                {!atual.caso ? (
                  <form action={vincularNumero} className="wa-form">
                    <input type="hidden" name="telefone" value={atual.telefone} />
                    <div className="frow">
                      <div className="field" style={{ flex: 1 }}><label>Buscar caso pelo devedor</label><div className="inp"><input name="busca" defaultValue={busca} placeholder="Nome do devedor" form="busca-caso" /></div></div>
                      <div className="field" style={{ flex: 2 }}><label>Vincular a</label><div className="inp"><select name="caso_id" required defaultValue=""><option value="">Escolha o caso…</option>{candidatos.map((c) => <option key={c.id} value={c.id}>{c.devedor} · {clientes[c.cliente_id]?.nome_curto ?? c.cliente_id}{c.telefone ? ` · ${c.telefone}` : " · sem telefone"}</option>)}</select></div></div>
                      <div className="field"><label>&nbsp;</label><button className="btn" type="submit">Vincular</button></div>
                    </div>
                    <small className="meta">Vincular grava o número no caso (se estiver vazio) e move as mensagens para o histórico dele.</small>
                  </form>
                ) : atual.caso.wa_optout ? (
                  <form action={alternarOptOut} className="wa-form">
                    <input type="hidden" name="caso_id" value={atual.caso.id} /><input type="hidden" name="voltar" value={voltar} />
                    <div className="verdict warn">O devedor pediu SAIR. Mensagens bloqueadas para este número.</div>
                    <div className="actions"><button className="btn ghost sm" type="submit">Liberar mensagens</button></div>
                  </form>
                ) : atual.janelaAte ? (
                  <form action={responderWhatsApp} className="wa-form">
                    <input type="hidden" name="caso_id" value={atual.caso.id} /><input type="hidden" name="voltar" value={voltar} />
                    <div className="wa-row">
                      <textarea name="texto" required minLength={2} rows={2} placeholder="Escreva como numa conversa. Fica no histórico do caso e o cliente vê." disabled={!wa.ok} />
                      <button className="btn" type="submit" disabled={!wa.ok}>Enviar</button>
                    </div>
                    <details className="wa-alt"><summary className="meta">Ou enviar um modelo aprovado</summary>
                      <ModeloForm casoId={atual.caso.id} voltar={voltar} ativo={wa.ok} />
                    </details>
                  </form>
                ) : (
                  <div className="wa-form">
                    <div className="meta">Fora da janela de 24h: a Meta só aceita modelo aprovado. Quando o devedor responder, o texto livre libera.</div>
                    <ModeloForm casoId={atual.caso.id} voltar={voltar} ativo={wa.ok} />
                  </div>
                )}
                {!atual.caso && <form id="busca-caso" method="get"><input type="hidden" name="c" value={atual.telefone} /><input type="hidden" name="so" value={so} />{q && <input type="hidden" name="q" value={q} />}</form>}
              </footer>
            </>
          )}
        </section>
      </div>
      <p className="meta" style={{ marginTop: 10 }}>Atualiza sozinha a cada 20 segundos. Conectado como {u.nome}.</p>
    </>
  );
}

function ModeloForm({ casoId, voltar, ativo }: { casoId: string; voltar: string; ativo: boolean }) {
  return (
    <form action={enviarWhatsApp} className="wa-row" style={{ marginTop: 8 }}>
      <input type="hidden" name="caso_id" value={casoId} /><input type="hidden" name="voltar" value={voltar} />
      <div className="inp" style={{ flex: 1 }}><select name="template" required defaultValue="">
        <option value="">Modelo…</option>
        {Object.values(TEMPLATES).map((t) => <option key={t.nome} value={t.nome}>{t.rotulo}</option>)}
      </select></div>
      <button className="btn ghost" type="submit" disabled={!ativo}>Enviar modelo</button>
    </form>
  );
}
