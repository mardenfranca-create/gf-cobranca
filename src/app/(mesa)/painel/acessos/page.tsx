import type { Metadata } from "next";
import Link from "next/link";
import { exigeAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { fmtDataHora } from "@/lib/domain/datas";
import { navegador, type Acesso } from "@/lib/acessos";
import { PageHead } from "@/components/ui";

export const metadata: Metadata = { title: "Log de acesso" };

export default async function AcessosPage(props: PageProps<"/painel/acessos">) {
  await exigeAdmin();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const so = typeof sp.so === "string" ? sp.so : "todos";
  const sb = await supabaseServer();
  let query = sb.from("acessos").select("*").order("criado_em", { ascending: false }).limit(500);
  if (q) query = query.or(`email.ilike.%${q}%,nome.ilike.%${q}%,ip.ilike.%${q}%,cidade.ilike.%${q}%`);
  if (so === "falhas") query = query.eq("resultado", "falha");
  if (so === "clientes") query = query.eq("papel", "cliente");
  const { data, error } = await query;
  const acessos = (data ?? []) as Acesso[];
  const limite24h = new Date(new Date().getTime() - 864e5).toISOString();
  const falhas24h = acessos.filter((a) => a.resultado === "falha" && a.criado_em >= limite24h).length;
  const chip = (key: string, label: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    p.set("so", key);
    return <Link key={key} href={`/painel/acessos?${p}`} className="chip" aria-current={so === key ? "true" : undefined}>{label}</Link>;
  };
  return (
    <>
      <PageHead eyebrow="Painel · Log de acesso" titulo="Quem entrou, quando e de onde" sub="Cada tentativa de login fica registrada com e-mail, resultado, IP, cidade aproximada e navegador. O registro é imutável.">
        <div className="actions"><Link className="btn ghost" href="/painel">Voltar ao painel</Link></div>
      </PageHead>
      {error && <div className="verdict out" style={{ marginBottom: 12 }}>Não foi possível ler o log: {error.message}. A migration 0005_acessos.sql já foi aplicada no Supabase?</div>}
      {falhas24h >= 5 && <div className="verdict warn" style={{ marginBottom: 12 }}>{falhas24h} tentativas de login com falha nas últimas 24 horas. Vale conferir se é alguém errando a senha ou tentativa de acesso indevido.</div>}
      <form className="toolbar" method="get">
        <input type="hidden" name="so" value={so} />
        <input className="search" name="q" defaultValue={q} type="search" placeholder="Buscar e-mail, nome, IP ou cidade" aria-label="Buscar acessos" />
        <div className="chips">{chip("todos", "Todos")}{chip("falhas", "Só falhas")}{chip("clientes", "Só clientes")}</div>
      </form>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Quando</th><th>Quem</th><th>Papel</th><th>Resultado</th><th>De onde</th><th>Navegador</th></tr></thead>
          <tbody>
            {acessos.length === 0 && <tr><td colSpan={6} className="empty">Nenhum acesso registrado com esse filtro.</td></tr>}
            {acessos.map((a) => (
              <tr key={a.id}>
                <td className="num">{fmtDataHora(a.criado_em)}</td>
                <td><div className="main">{a.nome ?? "—"}</div><div className="meta">{a.email}</div></td>
                <td>{a.papel ?? "—"}</td>
                <td>{a.resultado === "ok" ? <span className="flag in">entrou</span> : <span className="flag" style={{ color: "var(--bad)", background: "var(--bad-bg)" }}>falha{a.motivo ? ` · ${a.motivo}` : ""}</span>}</td>
                <td><div>{a.cidade ?? "—"}</div><div className="meta num">{a.ip ?? ""}</div></td>
                <td className="meta">{navegador(a.user_agent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tbl-foot"><span>{acessos.length} {acessos.length === 1 ? "registro" : "registros"} (máx. 500)</span></div>
    </>
  );
}
