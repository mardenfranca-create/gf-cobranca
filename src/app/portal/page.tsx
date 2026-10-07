import type { Metadata } from "next";
import Link from "next/link";
import { exigeCliente } from "@/lib/auth";
import { clientePorId, listaCasos, propostasPendentes, ultimosEventos } from "@/lib/data";
import { brl, compacto, fmtData, fmtDataHora, hojeISO } from "@/lib/domain/datas";
import { EXCECOES, FASES, FASES_ABERTAS, isAberto, type Fase } from "@/lib/domain/types";
import { PageHead, Pill } from "@/components/ui";

export const metadata: Metadata = { title: "Portal do cliente" };

export default async function PortalPage() {
  const u = await exigeCliente();
  const hoje = hojeISO();
  const [cliente, casos, pendentes, eventos] = await Promise.all([clientePorId(u.cliente_id), listaCasos({ cliente: u.cliente_id }), propostasPendentes(u.cliente_id), ultimosEventos(10)]);
  const abertos = casos.filter(isAberto);
  const saldo = abertos.reduce((s, c) => s + (c.valor_atualizado ?? 0), 0);
  const mes = hoje.slice(0, 7);
  const pagosMes = casos.filter((c) => c.fase === "pago" && (c.encerrado_em ?? "").startsWith(mes));
  const recuperadoMes = pagosMes.reduce((s, c) => s + (c.valor_atualizado ?? 0), 0);
  const aConferir = abertos.filter((c) => c.fase === "confirma");
  const aguardando = abertos.filter((c) => c.exc_tipo === "aguardando");
  const emAcordo = abertos.filter((c) => c.fase === "acordo");
  const porFase = FASES_ABERTAS.map((f) => ({ f, n: abertos.filter((c) => c.fase === f).length, v: abertos.filter((c) => c.fase === f).reduce((s, c) => s + (c.valor_atualizado ?? 0), 0) })).filter((x) => x.n > 0);
  const maxN = Math.max(1, ...porFase.map((x) => x.n));
  const devedor = Object.fromEntries(casos.map((c) => [c.id, c.devedor]));
  const precisa = pendentes.length + aguardando.length;

  return (
    <>
      <PageHead eyebrow={`${cliente?.nome ?? u.cliente_id} · ${hoje.split("-").reverse().join("/")}`} titulo="Sua carteira em cobrança" sub="Tudo o que a equipe do Gontijo Freitas está fazendo pela sua inadimplência, em tempo real. O que depende de você aparece primeiro." />
      <div className="kpis">
        <div className="kpi"><div className="lbl">Em cobrança</div><div className="val num">{compacto(saldo)}</div><div className="foot"><b>{abertos.length}</b> {abertos.length === 1 ? "caso aberto" : "casos abertos"}{abertos.some((c) => c.valor_atualizado == null) && <> · <b>{abertos.filter((c) => c.valor_atualizado == null).length}</b> sem valor informado</>}</div></div>
        <div className="kpi"><div className="lbl">Recuperado em {mes.split("-").reverse().join("/")}</div><div className="val num">{compacto(recuperadoMes)}</div><div className="foot"><b>{pagosMes.length}</b> {pagosMes.length === 1 ? "caso encerrado como pago" : "casos encerrados como pagos"}</div></div>
        <div className="kpi"><div className="lbl">Precisa de você</div><div className={`val num ${precisa ? "alert" : ""}`}>{precisa}</div><div className="foot"><b>{pendentes.length}</b> {pendentes.length === 1 ? "proposta" : "propostas"} · <b>{aguardando.length}</b> aguardando orientação</div></div>
        <div className="kpi"><div className="lbl">Acordos em pagamento</div><div className="val num">{emAcordo.length}</div><div className="foot"><b>{aConferir.length}</b> {aConferir.length === 1 ? "pagamento em conferência" : "pagamentos em conferência"}</div></div>
      </div>

      {precisa > 0 && (
        <section>
          <div className="group-h"><h2>Precisa de você</h2><span>{precisa} · decisões que travam a cobrança até você responder</span></div>
          <div className="tasks">
            {pendentes.map((p) => (
              <Link key={p.id} href="/portal/aprovacoes" className="task" data-p="alta">
                <div className="stripe" />
                <div className="body"><div className="t">Aprovar ou recusar proposta · {p.caso.devedor}</div><div className="d">{p.desconto_pct}% de desconto · {p.parcelas}× · entrada {p.entrada_pct}% · total {brl(p.total)} · enviada em {fmtData(p.enviada_em.slice(0, 10))}</div></div>
                <div className="side"><span className="cl">fora da alçada</span><b className="num">{brl(p.caso.valor_atualizado ?? 0, false)}</b><Pill fase={p.caso.fase} /></div>
              </Link>
            ))}
            {aguardando.map((c) => (
              <Link key={c.id} href={`/portal/casos/${c.id}`} className="task" data-p="media">
                <div className="stripe" />
                <div className="body"><div className="t">Orientar a equipe · {c.devedor}</div><div className="d">{EXCECOES.aguardando} desde {fmtData(c.exc_desde)}{c.exc_motivo ? ` · ${c.exc_motivo}` : ""}. A régua está pausada até sua resposta.</div></div>
                <div className="side"><span className="cl">{c.referencia}</span><b className="num">{c.valor_atualizado == null ? "sem valor" : brl(c.valor_atualizado, false)}</b></div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid two" style={{ marginTop: 22 }}>
        <div className="panel">
          <div className="panel-head"><h2>Onde está cada caso</h2><p>casos abertos por etapa da cobrança</p></div>
          {porFase.length === 0 && <div className="empty">Nenhum caso em aberto. Envie uma planilha para iniciar a cobrança.</div>}
          <div className="blist">
            {porFase.map(({ f, n, v }) => (
              <Link key={f} href={`/portal/carteira?fase=${f}`} className="brow" style={{ textDecoration: "none" }}>
                <div className="name"><Pill fase={f as Fase} /></div>
                <div className="v num">{n}<small>{v ? brl(v, false) : "sem valor"}</small></div>
                <div className="track"><i style={{ width: `${Math.round((n / maxN) * 100)}%`, background: "var(--bar)" }} /></div>
              </Link>
            ))}
          </div>
          <p className="blist-note">{FASES.regua.label}: notificações automáticas. {FASES.neg.label}: contato humano da equipe. {FASES.confirma.label}: pagamento informado, em conferência no extrato.</p>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Últimas movimentações</h2><p>registradas pela equipe</p></div>
          <ol className="tl">
            {eventos.map((e) => (
              <li key={e.id}><span /><div><div className="when num">{fmtDataHora(e.data)} · {e.autor}</div><div className="what"><Link href={`/portal/casos/${e.caso_id}`} style={{ fontWeight: 600, textDecoration: "none" }}>{devedor[e.caso_id] ?? "Caso"}</Link> · {e.texto}</div></div></li>
            ))}
            {eventos.length === 0 && <li><span /><div className="meta">Sem registros ainda.</div></li>}
          </ol>
        </div>
      </div>
    </>
  );
}
