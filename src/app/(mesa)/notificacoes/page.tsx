import type { Metadata } from "next";
import Link from "next/link";
import { exigeEquipe } from "@/lib/auth";
import { mapaClientes } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import { fmtDataHora } from "@/lib/domain/datas";
import { CANAIS, NOTIFICACAO_STATUS, type Notificacao } from "@/lib/domain/notificacao";
import { PageHead } from "@/components/ui";

export const metadata: Metadata = { title: "Notificações" };

export default async function NotificacoesPage(props: PageProps<"/notificacoes">) {
  const u = await exigeEquipe();
  const sp = await props.searchParams;
  const so = typeof sp.so === "string" ? sp.so : "minuta";
  const sb = await supabaseServer();
  const [{ data, error }, clientes] = await Promise.all([sb.from("notificacoes").select("*").order("criado_em", { ascending: false }).limit(500), mapaClientes()]);
  const todas = (data ?? []) as Notificacao[];
  const ids = [...new Set(todas.map((n) => n.caso_id))];
  const { data: casos } = ids.length ? await sb.from("casos").select("id, devedor, cliente_id, responsavel, telefone").in("id", ids) : { data: [] };
  const caso = Object.fromEntries((casos ?? []).map((c) => [c.id, c]));
  const lista = todas.filter((n) => (so === "todas" ? true : so === "minhas" ? n.status === "minuta" && n.revisor === u.nome : n.status === so));
  const conta = (k: string) => todas.filter((n) => (k === "minhas" ? n.status === "minuta" && n.revisor === u.nome : n.status === k)).length;
  const chip = (k: string, label: string, n?: number) => <Link key={k} href={`/notificacoes?so=${k}`} className="chip" aria-current={so === k ? "true" : undefined}>{label}{n != null && <small className="num">{n}</small>}</Link>;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  return (
    <>
      <PageHead eyebrow="Notificações" titulo="Notificações extrajudiciais" sub="A minuta nasce do caso, o advogado revisa e aprova, e o envio sai daqui (WhatsApp com PDF timbrado) ou é registrado (correio com AR, e-mail). Tudo fica no histórico do caso e o prazo entra na agenda." />
      {ok && <div className="verdict in" style={{ marginBottom: 12 }}>{ok}</div>}
      {error && <div className="verdict out" style={{ marginBottom: 12 }}>Não foi possível ler: {error.message}. A migration 0010 foi aplicada?</div>}
      <div className="chips" style={{ marginBottom: 14 }}>
        {chip("minhas", "Para eu revisar", conta("minhas"))}{chip("minuta", "Para revisar", conta("minuta"))}{chip("aprovada", "Aprovadas, a enviar", conta("aprovada"))}{chip("enviada", "Enviadas", conta("enviada"))}{chip("todas", "Todas", todas.length)}
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Devedor</th><th>Cliente</th><th>Situação</th><th>Revisor / assina</th><th>Prazo</th><th>Quando</th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={6} className="empty">Nenhuma notificação nesse filtro. Gere uma pelo caso: ação &quot;Notificação extrajudicial&quot;.</td></tr>}
            {lista.map((n) => {
              const st = NOTIFICACAO_STATUS[n.status];
              const c = caso[n.caso_id];
              return (
                <tr key={n.id}>
                  <td><Link className="rowlink" href={`/notificacoes/${n.id}`}><div className="main">{c?.devedor ?? "Caso"}</div><div className="meta">{n.titulo}</div></Link></td>
                  <td>{clientes[c?.cliente_id ?? ""]?.nome_curto ?? c?.cliente_id ?? "—"}</td>
                  <td><span className={`pill ${st.cls}`}>{st.label}</span>{n.status === "enviada" && n.canal && <div className="meta">{CANAIS[n.canal] ?? n.canal}</div>}</td>
                  <td><div>{n.revisor ?? "—"}</div><div className="meta">{n.advogado ? `assina ${n.advogado}` : "assinatura pendente"}</div></td>
                  <td className="num">{n.prazo_dias} dias</td>
                  <td className="meta num">{fmtDataHora(n.enviada_em ?? n.aprovada_em ?? n.criado_em)}<div>{n.enviada_por ?? n.aprovada_por ?? n.gerada_por}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
