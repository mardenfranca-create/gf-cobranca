import type { Metadata } from "next";
import Link from "next/link";
import { exigeCliente } from "@/lib/auth";
import { listaCasos } from "@/lib/data";
import { brl, diffDias, fmtData, hojeISO } from "@/lib/domain/datas";
import { EXCECOES, FASES, FASES_ABERTAS, FASES_FECHADAS, isAberto, type Fase } from "@/lib/domain/types";
import { PageHead, Pill } from "@/components/ui";

export const metadata: Metadata = { title: "Carteira" };

export default async function CarteiraPage(props: PageProps<"/portal/carteira">) {
  const u = await exigeCliente();
  const sp = await props.searchParams;
  const filtro = typeof sp.fase === "string" ? sp.fase : "abertos";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const hoje = hojeISO();
  const todos = await listaCasos({ cliente: u.cliente_id });
  let lista = todos.filter((c) => (filtro === "todos" ? true : filtro === "abertos" ? isAberto(c) : c.fase === filtro));
  if (q) lista = lista.filter((c) => `${c.devedor} ${c.referencia} ${c.detalhe ?? ""} ${c.documento ?? ""}`.toLowerCase().includes(q));
  lista = [...lista].sort((a, b) => (b.valor_atualizado ?? -1) - (a.valor_atualizado ?? -1));
  const contagem = todos.reduce<Record<string, number>>((a, c) => ((a[c.fase] = (a[c.fase] ?? 0) + 1), a), {});
  const chip = (key: string, label: string, n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    p.set("fase", key);
    return <Link key={key} href={`/portal/carteira?${p}`} className="chip" aria-current={filtro === key ? "true" : undefined}>{label}<small className="num">{n}</small></Link>;
  };
  return (
    <>
      <PageHead eyebrow="Carteira" titulo="Todos os seus casos" sub="Cada linha é uma dívida consolidada por devedor. Clique para ver o histórico, informar um pagamento ou orientar a equipe." />
      <form className="toolbar" method="get">
        <input type="hidden" name="fase" value={filtro} />
        <input className="search" name="q" defaultValue={q} type="search" placeholder="Buscar devedor, referência ou documento" aria-label="Buscar casos" />
        <div className="chips">
          {chip("abertos", "Em aberto", todos.filter(isAberto).length)}
          {chip("todos", "Todos", todos.length)}
          {[...FASES_ABERTAS, ...FASES_FECHADAS].filter((f) => contagem[f]).map((f: Fase) => chip(f, FASES[f].label, contagem[f]))}
        </div>
      </form>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Devedor</th><th>Referência</th><th className="r">Valor</th><th className="r">Em cobrança há</th><th>Etapa</th><th>Situação</th><th>Última movimentação</th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={7} className="empty">Nenhum caso com esse filtro.</td></tr>}
            {lista.map((c) => (
              <tr key={c.id}>
                <td><Link className="rowlink" href={`/portal/casos/${c.id}`}><div className="main">{c.devedor}</div><div className="meta num">{c.documento ?? "documento não informado"}</div></Link></td>
                <td><div>{c.referencia}</div><div className="meta">{c.detalhe}</div></td>
                <td className="r num"><div className="main">{c.valor_atualizado == null ? <span className="err">sem valor</span> : brl(c.valor_atualizado)}</div></td>
                <td className="r num">{diffDias(hoje, c.entrada_em)} dias</td>
                <td><Pill fase={c.fase} /></td>
                <td><div className="meta" style={{ color: "var(--ink-80)", maxWidth: "30ch" }}>{c.exc_tipo ? `Pausado: ${EXCECOES[c.exc_tipo]}` : c.fase_nota ?? FASES[c.fase].label}</div>{c.acordo && <div className="meta num">acordo {c.acordo.paid}/{c.acordo.parc} pagas</div>}</td>
                <td className="meta num">{fmtData(c.ultima_mov_em.slice(0, 10))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tbl-foot"><span>{lista.length} {lista.length === 1 ? "caso" : "casos"}</span><span>Saldo conhecido em aberto: <b className="num">{brl(lista.filter(isAberto).reduce((s, c) => s + (c.valor_atualizado ?? 0), 0))}</b></span></div>
    </>
  );
}
