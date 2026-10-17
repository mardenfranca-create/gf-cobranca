import type { Metadata } from "next";
import Link from "next/link";
import { exigeCliente } from "@/lib/auth";
import { clientePorId } from "@/lib/data";
import { brl, fmtData, hojeISO } from "@/lib/domain/datas";
import { nomeMes, rotuloMes } from "@/lib/domain/painel";
import { mesesDisponiveis } from "@/lib/domain/relatorio";
import { FASES } from "@/lib/domain/types";
import { dadosRelatorio, mesValido } from "@/lib/relatorio";
import { PageHead } from "@/components/ui";

export const metadata: Metadata = { title: "Relatório mensal" };

export default async function RelatorioPage(props: PageProps<"/portal/relatorio">) {
  const u = await exigeCliente();
  const sp = await props.searchParams;
  const hoje = hojeISO();
  const mes = mesValido(sp.mes) ? sp.mes : hoje.slice(0, 7);
  const [cliente, { dados: d, casos }] = await Promise.all([clientePorId(u.cliente_id), dadosRelatorio(u.cliente_id, mes)]);
  const meses = mesesDisponiveis(casos, hoje);
  const pdf = `/api/relatorio?mes=${mes}`;
  const titulo = `${nomeMes(mes)[0].toUpperCase()}${nomeMes(mes).slice(1)}`;
  return (
    <>
      <PageHead eyebrow="Relatório mensal" titulo={titulo} sub={`Período de ${fmtData(d.inicio)} a ${fmtData(d.fim)}. O PDF sai com o timbrado do escritório, pronto para encaminhar à diretoria ou ao contador.`}>
        <div className="actions">
          <a className="btn ghost" href={pdf} target="_blank" rel="noopener">Ver PDF</a>
          <a className="btn" href={`${pdf}&baixar=1`}>Baixar PDF</a>
        </div>
      </PageHead>
      <div className="chips" style={{ marginBottom: 16 }}>
        {meses.map((m) => <Link key={m} href={`/portal/relatorio?mes=${m}`} className="chip" aria-current={m === mes ? "true" : undefined}>{rotuloMes(m)}</Link>)}
      </div>
      <div className="kpis">
        <div className="kpi"><div className="lbl">Recuperado no mês</div><div className="val num">{brl(d.recuperado.valor, false)}</div><div className="foot"><b>{d.recuperado.casos}</b> {d.recuperado.casos === 1 ? "caso encerrado como pago" : "casos encerrados como pagos"}</div></div>
        <div className="kpi"><div className="lbl">Carteira em cobrança</div><div className="val num">{brl(d.carteira.saldo, false)}</div><div className="foot"><b>{d.carteira.abertos}</b> {d.carteira.abertos === 1 ? "caso aberto" : "casos abertos"} ao fim do período</div></div>
        <div className="kpi"><div className="lbl">Novos casos</div><div className="val num">{d.novos.casos}</div><div className="foot">{d.novos.casos ? brl(d.novos.valor, false) : "nenhuma entrada"}</div></div>
        <div className="kpi"><div className="lbl">Acordos fechados</div><div className="val num">{d.acordos.fechados}</div><div className="foot"><b>{d.acordos.emPagamento}</b> em pagamento · <b>{d.acordos.quebrados}</b> {d.acordos.quebrados === 1 ? "quebrado" : "quebrados"}</div></div>
      </div>
      <div className="grid two">
        <div className="panel">
          <div className="panel-head"><h2>O que vai no PDF</h2><p>{cliente?.nome}</p></div>
          <ol className="tl">
            <li><span /><div><div className="what"><b>Resumo do período</b> · recuperado, carteira, novos casos, acordos e tempo médio até o pagamento{d.tempoMedioPagamento != null ? ` (${d.tempoMedioPagamento} dias neste mês)` : ""}.</div></div></li>
            <li><span /><div><div className="what"><b>Onde está a carteira</b> · {d.porFase.map((f) => `${f.n} ${FASES[f.fase].label.toLowerCase()}`).join(", ") || "sem casos abertos"}.</div></div></li>
            <li><span /><div><div className="what"><b>Casos pagos</b> ({d.pagos.length}), <b>novos casos</b> ({d.entradas.length}), <b>o que depende de você</b> ({d.aguardando.length}){d.judicial.length ? <>, <b>protesto e judicial</b> ({d.judicial.length})</> : null}.</div></div></li>
            <li><span /><div><div className="what"><b>Movimentações</b> · {d.movimentos.length} registros da equipe no período, com autor e data.</div></div></li>
          </ol>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Casos encerrados como pagos</h2><p>{d.pagos.length} no período</p></div>
          {d.pagos.length === 0 ? <div className="empty">Nenhum caso encerrado como pago neste período.</div> : (
            <div className="blist">
              {d.pagos.slice(0, 12).map((c) => (
                <Link key={c.id} href={`/portal/casos/${c.id}`} className="brow" style={{ textDecoration: "none" }}>
                  <div className="name"><div>{c.devedor}</div><div className="meta">{c.referencia} · pago em {fmtData(c.encerrado_em?.slice(0, 10))}</div></div>
                  <div className="v num">{brl(c.valor_atualizado ?? c.valor_original ?? 0, false)}</div>
                </Link>
              ))}
              {d.pagos.length > 12 && <p className="meta">… e mais {d.pagos.length - 12} no PDF.</p>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
