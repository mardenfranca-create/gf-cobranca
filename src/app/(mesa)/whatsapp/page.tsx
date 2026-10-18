import type { Metadata } from "next";
import Link from "next/link";
import { casosPorIds, mapaClientes, mensagensRecentes } from "@/lib/data";
import { agrupaConversas, formataCelular, restanteJanela, resumo, type Conversa } from "@/lib/domain/conversas";
import { fmtDataHora } from "@/lib/domain/datas";
import { isAberto, MENSAGEM_STATUS, type Caso, type Cliente } from "@/lib/domain/types";
import { LinkCaso, PageHead, Pill } from "@/components/ui";
import { responderWhatsApp } from "@/lib/actions/whatsapp";

export const metadata: Metadata = { title: "WhatsApp" };
export const dynamic = "force-dynamic";

const DIAS = 30;

function Status({ status }: { status: string }) {
  const st = MENSAGEM_STATUS[status] ?? { label: status, cls: "ph-confirma" };
  return <span className={`pill ${st.cls}`}>{st.label}</span>;
}

function Balao({ m, completo }: { m: Conversa["ultima"]; completo?: boolean }) {
  const entrada = m.direcao === "entrada";
  return (
    <div style={{ display: "grid", gap: 3, padding: "7px 10px", borderRadius: 4, background: entrada ? "var(--warn-bg)" : "var(--ink-05)", marginLeft: completo && !entrada ? 24 : 0, marginRight: completo && entrada ? 24 : 0 }}>
      <div className="meta num" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{entrada ? "Devedor" : m.criado_por ?? m.origem} · {fmtDataHora(m.criado_em)}</span>
        <Status status={m.status} />
      </div>
      <div style={{ fontSize: 13, whiteSpace: completo ? "pre-wrap" : "normal" }}>{completo ? m.texto : resumo(m.texto, 220)}</div>
      {m.erro && <div className="err">{m.erro}</div>}
    </div>
  );
}

function Linha({ c, caso, cliente, voltar, agora }: { c: Conversa; caso: Caso | undefined; cliente: Cliente | undefined; voltar: string; agora: Date }) {
  const podeResponder = !!c.janelaAte && !!caso && isAberto(caso) && !caso.wa_optout;
  const motivo = !caso ? "" : caso.wa_optout ? "Devedor pediu SAIR: só contato por outro canal." : !isAberto(caso) ? "Caso encerrado." : c.aguardando ? "Fora da janela de 24h: responda com um modelo pelo caso." : "Sem janela aberta: só modelos aprovados.";
  return (
    <div className="panel" style={{ display: "grid", gap: 10, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div style={{ display: "grid", gap: 2 }}>
          {caso ? <LinkCaso caso={caso}><b style={{ fontSize: 15 }}>{caso.devedor}</b></LinkCaso> : <b>Caso removido</b>}
          <span className="meta">{cliente?.nome_curto ?? caso?.cliente_id ?? "—"} · {formataCelular(c.ultima.telefone)} · {caso?.responsavel ?? "sem responsável"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {caso && <Pill fase={caso.fase} />}
          {c.janelaAte ? <span className="pill ph-acordo" title={`Texto livre aceito até ${fmtDataHora(c.janelaAte)}`}>janela {restanteJanela(c.janelaAte, agora)}</span> : c.aguardando ? <span className="pill ph-quebra">janela fechada</span> : null}
          {c.falhas > 0 && <span className="pill ph-quebra">{c.falhas} não entregue{c.falhas > 1 ? "s" : ""}</span>}
        </div>
      </div>
      <Balao m={c.ultima} />
      {c.mensagens.length > 1 && (
        <details>
          <summary className="meta" style={{ cursor: "pointer" }}>Ver conversa ({c.mensagens.length} mensagens)</summary>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {[...c.mensagens].reverse().map((x) => <Balao key={x.id} m={x} completo />)}
          </div>
        </details>
      )}
      {podeResponder ? (
        <form action={responderWhatsApp} style={{ display: "grid", gap: 8 }}>
          <input type="hidden" name="caso_id" value={c.caso_id} />
          <input type="hidden" name="voltar" value={voltar} />
          <textarea name="texto" required minLength={2} rows={2} placeholder="Responder em texto livre. O cliente vê no histórico do caso." />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {caso && <Link className="btn ghost sm" href={`/casos/${caso.id}`}>Abrir caso</Link>}
            <button className="btn sm" type="submit">Responder</button>
          </div>
        </form>
      ) : (
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <span className="meta">{motivo}</span>
          {caso && <Link className="btn ghost sm" href={`/casos/${caso.id}`}>Abrir caso</Link>}
        </div>
      )}
    </div>
  );
}

export default async function WhatsAppPage(props: PageProps<"/whatsapp">) {
  const sp = await props.searchParams;
  const cliente = typeof sp.cliente === "string" ? sp.cliente : null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const agora = new Date();
  const [mensagens, clientes] = await Promise.all([mensagensRecentes(DIAS), mapaClientes()]);
  const todas = agrupaConversas(mensagens, agora);
  const casos = await casosPorIds(todas.map((c) => c.caso_id));
  const conversas = cliente ? todas.filter((c) => casos[c.caso_id]?.cliente_id === cliente) : todas;
  const aguardando = conversas.filter((c) => c.aguardando);
  const janela = conversas.filter((c) => !c.aguardando && c.janelaAte);
  const demais = conversas.filter((c) => !c.aguardando && !c.janelaAte);
  const falhas = conversas.reduce((s, c) => s + c.falhas, 0);
  const voltar = `/whatsapp${cliente ? `?cliente=${encodeURIComponent(cliente)}` : ""}`;
  const grupo = (titulo: string, dica: string, lista: Conversa[]) => lista.length ? (
    <section key={titulo}>
      <div className="group-h"><h2>{titulo}</h2><span>{lista.length} · {dica}</span></div>
      <div style={{ display: "grid", gap: 10 }}>{lista.map((c) => <Linha key={c.caso_id} c={c} caso={casos[c.caso_id]} cliente={clientes[casos[c.caso_id]?.cliente_id ?? ""]} voltar={voltar} agora={agora} />)}</div>
    </section>
  ) : null;

  return (
    <>
      <PageHead eyebrow="Mesa de operação · WhatsApp oficial" titulo="Conversas" sub={`Tudo que saiu e entrou pelo número da cobrança nos últimos ${DIAS} dias. Dentro da janela de 24h dá para responder daqui; fora dela, só modelo aprovado, pelo caso.`} />
      <div className="kpis">
        <div className="kpi"><div className="lbl">Aguardando resposta</div><div className={`val num ${aguardando.length ? "alert" : ""}`}>{aguardando.length}</div><div className="foot">a última mensagem é do devedor</div></div>
        <div className="kpi"><div className="lbl">Janela aberta</div><div className="val num">{aguardando.filter((c) => c.janelaAte).length + janela.length}</div><div className="foot">texto livre aceito pela Meta</div></div>
        <div className="kpi"><div className="lbl">Não entregues</div><div className={`val num ${falhas ? "alert" : ""}`}>{falhas}</div><div className="foot">conferir o número no caso</div></div>
        <div className="kpi"><div className="lbl">Conversas</div><div className="val num">{conversas.length}</div><div className="foot">{mensagens.length} mensagens em {DIAS} dias</div></div>
      </div>
      {ok && <div className="verdict in" style={{ marginBottom: 12 }}>{ok}</div>}
      {erro && <div className="verdict warn" style={{ marginBottom: 12 }}>{erro}</div>}
      {conversas.length === 0 && <div className="panel empty">Nenhuma conversa nos últimos {DIAS} dias{cliente ? " nesta carteira" : ""}. Envie um modelo por um caso com celular.</div>}
      {grupo("Aguardando resposta", "responda aqui dentro da janela, ou pelo caso com um modelo", aguardando)}
      {grupo("Janela aberta, já respondida", "ainda dá para mandar texto livre", janela)}
      {grupo("Demais conversas", "só modelos aprovados", demais)}
    </>
  );
}
