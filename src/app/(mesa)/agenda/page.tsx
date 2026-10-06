import type { Metadata } from "next";
import Link from "next/link";
import { listaCasos, mapaClientes } from "@/lib/data";
import { addDias, fmtData, hojeISO } from "@/lib/domain/datas";
import { FOLLOWUPS, isAberto, type Caso } from "@/lib/domain/types";
import { LinkCaso, PageHead, Valor } from "@/components/ui";

export const metadata: Metadata = { title: "Agenda" };
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function Item({ c, nome }: { c: Caso; nome: string }) {
  return (
    <LinkCaso caso={c} className="ag-item">
      <div><div className="who">{c.devedor}</div><div className="what">{nome} · {c.proxima_nota ?? c.fase_nota}</div></div>
      <div><div className="when num">{fmtData(c.proxima_data)}</div><div className="val"><Valor caso={c} /></div></div>
    </LinkCaso>
  );
}

export default async function AgendaPage(props: PageProps<"/agenda">) {
  const sp = await props.searchParams;
  const cliente = typeof sp.cliente === "string" ? sp.cliente : null;
  const hoje = hojeISO();
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : hoje.slice(0, 7);
  const dia = typeof sp.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : hoje;
  const [casos, clientes] = await Promise.all([listaCasos({ cliente, abertos: true }), mapaClientes()]);
  const nome = (c: Caso) => clientes[c.cliente_id]?.nome_curto ?? c.cliente_id;
  const abertos = casos.filter(isAberto);
  const comData = abertos.filter((c) => c.proxima_data);
  const atrasados = comData.filter((c) => c.proxima_data! < hoje).sort((a, b) => a.proxima_data!.localeCompare(b.proxima_data!));
  const semData = abertos.filter((c) => !c.proxima_data);
  const doDia = comData.filter((c) => c.proxima_data === dia);

  const [y, m] = mes.split("-").map(Number);
  const primeiro = `${mes}-01`;
  const dow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const inicio = addDias(primeiro, -dow);
  const celulas: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDias(inicio, i);
    if (i >= 35 && !d.startsWith(mes)) break;
    celulas.push(d);
  }
  const porDia: Record<string, Caso[]> = {};
  for (const c of comData) (porDia[c.proxima_data!] ??= []).push(c);
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (cliente) p.set("cliente", cliente);
    p.set("mes", mes);
    p.set("dia", dia);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/agenda?${p.toString()}`;
  };
  const mesAnt = addDias(primeiro, -1).slice(0, 7), mesProx = addDias(primeiro, 32).slice(0, 7);

  return (
    <>
      <PageHead eyebrow="Agenda" titulo="Agenda de acompanhamento" sub="Cada caso aparece no dia do próximo follow-up. Ao registrar a ação, o caso pula para a nova data. Nenhum caso aberto fica sem data." />
      <div className="grid two">
        <div className="panel">
          <div className="cal-head">
            <Link className="nav" href={qs({ mes: mesAnt })} aria-label="Mês anterior">‹</Link>
            <h2>{MESES[m - 1]} {y}</h2>
            <Link className="nav" href={qs({ mes: mesProx })} aria-label="Próximo mês">›</Link>
            <span className="sp" />
            <Link className="btn ghost sm" href={qs({ mes: hoje.slice(0, 7), dia: hoje })}>Hoje</Link>
          </div>
          <div className="cal">
            {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((d) => <div key={d} className="dow">{d}</div>)}
            {celulas.map((d) => {
              const ts = (porDia[d] ?? []).sort((a, b) => (b.valor_atualizado ?? 0) - (a.valor_atualizado ?? 0));
              const atrasado = d < hoje;
              return (
                <Link key={d} href={qs({ dia: d })} className={`day ${d.startsWith(mes) ? "" : "out"} ${d === hoje ? "today" : ""} ${d === dia ? "sel" : ""}`}>
                  <span className="n">{Number(d.slice(8))}</span>
                  {ts.slice(0, 3).map((c) => <div key={c.id} className={`fu ${atrasado ? "fu-late" : "fu-" + c.proxima_tipo}`} title={c.proxima_nota ?? ""}>{c.devedor}</div>)}
                  {ts.length > 3 && <div className="more">+ {ts.length - 3}</div>}
                </Link>
              );
            })}
          </div>
          <div className="legend">
            {Object.entries(FOLLOWUPS).map(([k, l]) => <span key={k} className={`fu-${k}`}>{l}</span>)}
            <span className="fu-late">Atrasado</span>
          </div>
        </div>
        <div className="stack">
          <div className="panel"><div className="panel-head"><h2>{dia === hoje ? "Hoje" : fmtData(dia)}</h2><p>{doDia.length} {doDia.length === 1 ? "ação" : "ações"}</p></div>
            <div className="ag-list">{doDia.length ? doDia.map((c) => <Item key={c.id} c={c} nome={nome(c)} />) : <div className="empty" style={{ padding: 16 }}>Nada marcado para este dia.</div>}</div></div>
          <div className="panel"><div className="panel-head"><h2 style={{ color: "var(--bad)" }}>Atrasados</h2><p>{atrasados.length ? `${atrasados.length} · o mais antigo em ${fmtData(atrasados[0].proxima_data)}` : "nenhum"}</p></div>
            <div className="ag-list">{atrasados.slice(0, 8).map((c) => <Item key={c.id} c={c} nome={nome(c)} />)}{atrasados.length > 8 && <div className="kmore">+ {atrasados.length - 8} na Fila de hoje</div>}</div></div>
          <div className="panel"><div className="panel-head"><h2>Sem data</h2><p>{semData.length ? `${semData.length} casos abertos sem follow-up` : "todos os casos abertos têm data"}</p></div>
            <div className="ag-list">{semData.slice(0, 5).map((c) => <Item key={c.id} c={c} nome={nome(c)} />)}</div></div>
        </div>
      </div>
    </>
  );
}
