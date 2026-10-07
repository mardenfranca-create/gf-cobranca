import type { Metadata } from "next";
import { baixasAsaas, listaCasos, mapaClientes } from "@/lib/data";
import { brl, fmtData, hojeISO } from "@/lib/domain/datas";
import { LinkCaso, PageHead, Valor } from "@/components/ui";

export const metadata: Metadata = { title: "Conferência" };

export default async function ConferenciaPage(props: PageProps<"/conferencia">) {
  const sp = await props.searchParams;
  const cliente = typeof sp.cliente === "string" ? sp.cliente : null;
  const hoje = hojeISO();
  const [casos, clientes, baixas] = await Promise.all([listaCasos({ cliente }), mapaClientes(), baixasAsaas(30)]);
  const baixasFiltradas = cliente ? baixas.filter((b) => b.cliente_id === cliente) : baixas;
  const aConferir = casos.filter((c) => c.fase === "confirma");
  const mes = hoje.slice(0, 7);
  const pagosNoMes = casos.filter((c) => c.fase === "pago" && (c.encerrado_em ?? "").startsWith(mes));
  const porCliente = Object.values(clientes).map((cl) => {
    const ps = pagosNoMes.filter((c) => c.cliente_id === cl.id);
    const rec = ps.reduce((s, c) => s + (c.valor_atualizado ?? 0), 0);
    const jud = ps.filter((c) => c.processo).reduce((s, c) => s + (c.valor_atualizado ?? 0), 0);
    const fee = Math.round(((rec - jud) * cl.honorarios.extra) / 100 + (jud * cl.honorarios.jud) / 100);
    return { cl, n: ps.length, rec, fee, rep: rec - fee };
  }).filter((r) => r.n > 0 || !cliente);
  const tot = porCliente.reduce((a, r) => ({ rec: a.rec + r.rec, fee: a.fee + r.fee, rep: a.rep + r.rep }), { rec: 0, fee: 0, rep: 0 });
  return (
    <>
      <PageHead eyebrow="Conferência" titulo="Pagamentos e fechamento" sub="Pagamentos informados pelos clientes esperam conferência no extrato. O fechamento calcula o êxito do escritório por cliente sobre os casos encerrados como pagos no mês." />
      <div className="grid two">
        <div>
          <div className="group-h"><h2>Pagamentos a confirmar</h2><span>{aConferir.length ? `${aConferir.length} · prazo interno: 1 dia útil` : "nada pendente"}</span></div>
          <div className="tasks">
            {aConferir.map((c) => (
              <LinkCaso key={c.id} caso={c} className="task" {...{ "data-p": "alta" }}>
                <div className="stripe" /><div className="body"><div className="t">{c.devedor}</div><div className="d">{c.referencia} · informado em {fmtData(c.ultima_mov_em.slice(0, 10))}</div></div>
                <div className="side"><span className="cl">{clientes[c.cliente_id]?.nome_curto}</span><Valor caso={c} /></div>
              </LinkCaso>
            ))}
            {aConferir.length === 0 && <div className="panel empty">Nenhum pagamento aguardando conferência.</div>}
          </div>
          <div className="group-h"><h2>Baixas automáticas do Asaas</h2><span>{baixasFiltradas.length ? `${baixasFiltradas.length} nos últimos 30 dias` : "nenhuma nos últimos 30 dias"}</span></div>
          <div className="tasks">
            {baixasFiltradas.slice(0, 30).map((b) => (
              <LinkCaso key={b.id} caso={{ id: b.caso_id }} className="task" {...{ "data-p": "baixa" }}>
                <div className="stripe" /><div className="body"><div className="t">{b.devedor}</div><div className="d">{b.tipo === "parcela" ? `parcela ${b.parcela_n}/${b.parcelas}` : b.tipo} · pago em {b.pago_em ? fmtData(b.pago_em.slice(0, 10)) : "—"}</div></div>
                <div className="side"><span className="cl">{clientes[b.cliente_id]?.nome_curto}</span><b className="num">{brl(b.valor_pago ?? b.valor, false)}</b></div>
              </LinkCaso>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Fechamento de {mes.split("-").reverse().join("/")}</h2><p>casos encerrados como pagos no mês</p></div>
          <div className="tbl-wrap" style={{ border: 0 }}>
            <table style={{ minWidth: 0 }}>
              <thead><tr><th>Cliente</th><th className="r">Pagos</th><th className="r">Recuperado</th><th className="r">Êxito GF</th><th className="r">Repasse</th></tr></thead>
              <tbody>
                {porCliente.map((r) => <tr key={r.cl.id}><td><div className="main">{r.cl.nome_curto}</div><div className="meta" style={{ whiteSpace: "nowrap" }}>{r.cl.honorarios.extra}% / {r.cl.honorarios.jud}% jud.</div></td><td className="r num">{r.n}</td><td className="r num">{brl(r.rec, false)}</td><td className="r num"><b>{brl(r.fee, false)}</b></td><td className="r num">{brl(r.rep, false)}</td></tr>)}
                <tr><td><b>Total</b></td><td className="r num"><b>{porCliente.reduce((s, r) => s + r.n, 0)}</b></td><td className="r num"><b>{brl(tot.rec, false)}</b></td><td className="r num"><b>{brl(tot.fee, false)}</b></td><td className="r num"><b>{brl(tot.rep, false)}</b></td></tr>
              </tbody>
            </table>
          </div>
          <p className="meta" style={{ marginTop: 14 }}>Boletos pagos no Asaas baixam sozinhos e encerram o caso. Com o split (próxima etapa), o êxito cai direto na conta do escritório.</p>
        </div>
      </div>
    </>
  );
}
