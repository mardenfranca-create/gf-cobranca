import type { Metadata } from "next";
import { exigeCliente } from "@/lib/auth";
import { clientePorId } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import { fmtDataHora } from "@/lib/domain/datas";
import { aplicarPlanilhaCliente, previaPlanilhaCliente } from "@/lib/actions/importar";
import { ImportarPlanilha } from "@/components/ImportarPlanilha";
import { PageHead } from "@/components/ui";

export const metadata: Metadata = { title: "Enviar planilha" };

export default async function PlanilhaPage() {
  const u = await exigeCliente();
  const cliente = await clientePorId(u.cliente_id);
  const sb = await supabaseServer();
  const { data: historico } = await sb.from("importacoes").select("*").eq("origem", "planilha").order("criado_em", { ascending: false }).limit(8);
  return (
    <>
      <PageHead eyebrow="Enviar planilha" titulo="Posição de inadimplência" sub="Envie a planilha do seu sistema sempre que quiser. Quem já está em cobrança não duplica; quem é novo entra na régua; quem você marcar como pago vai para conferência. Nada some." />
      <div className="grid two" style={{ marginBottom: 16 }}>
        <ImportarPlanilha clientes={cliente ? [{ id: cliente.id, nome: cliente.nome }] : []} clienteFixo={u.cliente_id} acoes={{ previa: previaPlanilhaCliente, aplicar: aplicarPlanilhaCliente }} titulo="Planilha de inadimplentes (.xlsx ou .csv)" />
        <div className="panel">
          <div className="panel-head"><h2>Colunas aceitas</h2></div>
          <div className="cols">
            <div><code>devedor</code><span>Responsável financeiro ou razão social (aceita Nome, Responsável)</span></div>
            <div><code>documento</code><span>CPF (11 dígitos) ou CNPJ (14). É o que evita duplicidade</span></div>
            <div><code>referencia</code><span>O que é a dívida. Ex.: Mensalidade mar/2026 - Ana (5º ano)</span></div>
            <div><code>valor</code><span>Número do Excel ou 2.450,00</span></div>
            <div><code>vencimento</code><span>Data do Excel ou DD/MM/AAAA</span></div>
            <div><code>telefone</code><span>Celular com DDD (opcional, acelera o contato)</span></div>
            <div><code>email</code><span>Opcional</span></div>
            <div><code>situacao</code><span>Opcional. &quot;pago&quot; informa baixa; &quot;não cobrar&quot; pausa a cobrança daquele devedor</span></div>
          </div>
          <p className="meta" style={{ marginTop: 14 }}>Pode exportar direto do seu sistema de gestão escolar ou financeiro. Cabeçalhos parecidos são reconhecidos. Antes de gravar, você vê linha a linha o que vai acontecer.</p>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>Planilhas já enviadas</h2></div>
        {historico?.length ? (
          <ol className="tl">{historico.map((h) => <li key={h.id}><span /><div><div className="when num">{fmtDataHora(h.criado_em)} · {h.criado_por}</div><div className="what">{h.arquivo} · {h.linhas} linhas · {Object.entries(h.resumo as Record<string, number>).map(([k, v]) => `${v} ${k}`).join(", ")}</div></div></li>)}</ol>
        ) : <div className="empty">Nenhuma planilha enviada ainda.</div>}
      </div>
    </>
  );
}
