import type { Metadata } from "next";
import { listaClientes } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import { fmtDataHora } from "@/lib/domain/datas";
import { ImportarPlanilha, ImportarTrello } from "@/components/ImportarPlanilha";
import { PageHead } from "@/components/ui";

export const metadata: Metadata = { title: "Importar" };

export default async function ImportarPage(props: PageProps<"/importar">) {
  const sp = await props.searchParams;
  const cliente = typeof sp.cliente === "string" ? sp.cliente : null;
  const clientes = await listaClientes();
  const sb = await supabaseServer();
  const { data: historico } = await sb.from("importacoes").select("*").order("criado_em", { ascending: false }).limit(10);
  return (
    <>
      <PageHead eyebrow="Importar" titulo="Casos novos e carga inicial" sub="Casos novos entram por planilha, no modelo padrão. A mesma planilha enviada duas vezes não gera nada." />
      <div className="grid two" style={{ marginBottom: 16 }}>
        <ImportarPlanilha clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))} clienteFixo={cliente} />
        <div className="panel">
          <div className="panel-head"><h2>Modelo da planilha</h2></div>
          <div className="cols">
            <div><code>cliente</code><span>Nome do cliente credor, como em Clientes (dispensável com cliente selecionado no topo)</span></div>
            <div><code>devedor</code><span>Responsável financeiro ou razão social</span></div>
            <div><code>documento</code><span>CPF (11 dígitos) ou CNPJ (14)</span></div>
            <div><code>referencia</code><span>O que é a dívida. Ex.: Mensalidades mar a jun/2026 - Ana (5º ano)</span></div>
            <div><code>valor</code><span>Valor original. Número do Excel ou 2.450,00</span></div>
            <div><code>vencimento</code><span>Data do Excel ou DD/MM/AAAA</span></div>
            <div><code>telefone</code><span>Celular com DDD</span></div>
            <div><code>email</code><span>Opcional</span></div>
            <div><code>situacao</code><span>Opcional. &quot;pago&quot; marca baixa para conferência; &quot;não cobrar&quot; registra exceção e pausa a régua</span></div>
          </div>
          <p className="meta" style={{ marginTop: 14 }}><b>Reconciliação:</b> o mesmo devedor (cliente + CPF/CNPJ) com caso aberto não vira caso novo; a parcela entra no caso existente. Quem está como pago vai para conferência de baixa. Quem tem caso aberto e sumiu da planilha pode ir para conferência também, se você marcar que a planilha é a posição completa. Cabeçalhos parecidos são aceitos (Nome, CPF/CNPJ, Descrição, Total, Data, Celular).</p>
        </div>
      </div>
      <div className="grid two">
        <ImportarTrello />
        <div className="panel">
          <div className="panel-head"><h2>Últimas importações</h2></div>
          {historico?.length ? (
            <ol className="tl">{historico.map((h) => <li key={h.id}><span /><div><div className="when num">{fmtDataHora(h.criado_em)} · {h.criado_por}</div><div className="what">{h.origem === "trello" ? "Trello" : "Planilha"}: {h.arquivo} · {h.linhas} linhas · {JSON.stringify(h.resumo)}</div></div></li>)}</ol>
          ) : <div className="empty">Nenhuma importação ainda.</div>}
        </div>
      </div>
    </>
  );
}
