import type { Metadata } from "next";
import { exigeCliente } from "@/lib/auth";
import { clientePorId, propostasPendentes } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import { brl, fmtData } from "@/lib/domain/datas";
import type { Proposta } from "@/lib/domain/types";
import { PageHead } from "@/components/ui";
import { PropostaCard } from "@/components/PropostaCard";

export const metadata: Metadata = { title: "Aprovações" };

export default async function AprovacoesPage() {
  const u = await exigeCliente();
  const [cliente, pendentes] = await Promise.all([clientePorId(u.cliente_id), propostasPendentes(u.cliente_id)]);
  const sb = await supabaseServer();
  const { data: decididas } = await sb.from("propostas").select("*").in("status", ["approved", "rejected"]).order("decidida_em", { ascending: false }).limit(15);
  const ids = [...new Set((decididas ?? []).map((p) => p.caso_id))];
  const { data: casos } = ids.length ? await sb.from("casos").select("id, devedor").in("id", ids) : { data: [] };
  const devedor = Object.fromEntries((casos ?? []).map((c) => [c.id, c.devedor]));
  if (!cliente) return null;
  return (
    <>
      <PageHead eyebrow="Aprovações" titulo="Propostas fora da alçada" sub="A equipe fecha sozinha o que está dentro da sua alçada. O que passa do limite para aqui até você decidir. Aprovar fecha o acordo e emite os boletos; recusar devolve o caso à negociação." />
      <div className="appr">
        {pendentes.length === 0 && <div className="panel empty">Nenhuma proposta esperando decisão. Ajuste a alçada em &quot;Alçadas e contato&quot; se quiser que a equipe feche mais acordos sem consultar você.</div>}
        {pendentes.map((p) => <PropostaCard key={p.id} p={p} caso={p.caso} cliente={cliente} voltar="aprovacoes" comLink />)}
      </div>
      {(decididas?.length ?? 0) > 0 && (
        <div className="panel" style={{ marginTop: 22 }}>
          <div className="panel-head"><h2>Decisões anteriores</h2><p>últimas {decididas!.length}</p></div>
          <div className="tbl-wrap" style={{ border: 0 }}>
            <table style={{ minWidth: 0 }}>
              <thead><tr><th>Devedor</th><th>Termos</th><th className="r">Total</th><th>Decisão</th><th>Quando</th></tr></thead>
              <tbody>{(decididas as (Proposta & { decidida_por: string | null; decidida_em: string | null })[]).map((p) => (
                <tr key={p.id} style={{ cursor: "default" }}><td className="main">{devedor[p.caso_id] ?? "—"}</td><td className="num">{p.desconto_pct}% · {p.parcelas}× · entrada {p.entrada_pct}%</td><td className="r num">{brl(p.total)}</td><td><span className={`flag ${p.status === "approved" ? "in" : "out"}`}>{p.status === "approved" ? "aprovada" : "recusada"}</span> <span className="meta">{p.decidida_por}</span></td><td className="meta num">{p.decidida_em ? fmtData(p.decidida_em.slice(0, 10)) : "—"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
