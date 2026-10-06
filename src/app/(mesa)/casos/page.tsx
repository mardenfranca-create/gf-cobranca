import type { Metadata } from "next";
import Link from "next/link";
import { listaCasos, mapaClientes } from "@/lib/data";
import { brl, diffDias, fmtData, hojeISO } from "@/lib/domain/datas";
import { FASES, FASES_ABERTAS, FASES_FECHADAS, isAberto, type Fase } from "@/lib/domain/types";
import { PageHead, Pill, ProximaAcao } from "@/components/ui";

export const metadata: Metadata = { title: "Casos" };

export default async function CasosPage(props: PageProps<"/casos">) {
  const sp = await props.searchParams;
  const cliente = typeof sp.cliente === "string" ? sp.cliente : null;
  const filtro = typeof sp.fase === "string" ? sp.fase : "abertos";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const hoje = hojeISO();
  const [todos, clientes] = await Promise.all([listaCasos({ cliente }), mapaClientes()]);
  let lista = todos.filter((c) => (filtro === "todos" ? true : filtro === "abertos" ? isAberto(c) : c.fase === filtro));
  if (q) lista = lista.filter((c) => `${c.devedor} ${c.referencia} ${c.detalhe ?? ""} ${c.documento ?? ""} ${clientes[c.cliente_id]?.nome ?? ""}`.toLowerCase().includes(q));
  const contagem = todos.reduce<Record<string, number>>((a, c) => ((a[c.fase] = (a[c.fase] ?? 0) + 1), a), {});
  const chip = (key: string, label: string, n: number) => {
    const p = new URLSearchParams();
    if (cliente) p.set("cliente", cliente);
    if (q) p.set("q", q);
    p.set("fase", key);
    return (
      <Link key={key} href={`/casos?${p}`} className="chip" aria-current={filtro === key ? "true" : undefined}>
        {label}<small className="num">{n}</small>
      </Link>
    );
  };
  return (
    <>
      <PageHead eyebrow="Casos" titulo="Carteira completa" sub="Todos os clientes ou um só, conforme o filtro no topo. Clique no caso para agir." />
      <form className="toolbar" method="get">
        {cliente && <input type="hidden" name="cliente" value={cliente} />}
        <input type="hidden" name="fase" value={filtro} />
        <input className="search" name="q" defaultValue={q} type="search" placeholder="Buscar devedor, referência, documento ou cliente" aria-label="Buscar casos" />
        <div className="chips">
          {chip("todos", "Todos", todos.length)}
          {chip("abertos", "Em aberto", todos.filter(isAberto).length)}
          {[...FASES_ABERTAS, ...FASES_FECHADAS].filter((f) => contagem[f]).map((f: Fase) => chip(f, FASES[f].label, contagem[f]))}
        </div>
      </form>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Devedor</th><th>Cliente</th><th>Referência</th><th className="r">Valor</th><th className="r">Idade</th><th>Fase</th><th>Próxima ação</th><th>Último registro</th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={8} className="empty">Nenhum caso encontrado com esse filtro.</td></tr>}
            {lista.map((c) => (
              <tr key={c.id}>
                <td><Link className="rowlink" href={`/casos/${c.id}`}><div className="main">{c.devedor}</div><div className="meta num">{c.documento ?? "sem documento"}</div></Link></td>
                <td><span className="src">{clientes[c.cliente_id]?.nome_curto ?? c.cliente_id}</span></td>
                <td><div>{c.referencia}</div><div className="meta">{c.detalhe}</div></td>
                <td className="r num"><div className="main">{c.valor_atualizado == null ? "sem valor" : brl(c.valor_atualizado)}</div><div className="meta">{c.valor_fonte ?? "levantar"}</div></td>
                <td className="r num"><div>{diffDias(hoje, c.entrada_em)} dias</div><div className="meta" style={diffDias(hoje, c.ultima_mov_em.slice(0, 10)) >= 60 && isAberto(c) ? { color: "var(--bad)" } : undefined}>{diffDias(hoje, c.ultima_mov_em.slice(0, 10))} d parado</div></td>
                <td><Pill fase={c.fase} /></td>
                <td><ProximaAcao caso={c} hoje={hoje} /></td>
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
