import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigeCliente } from "@/lib/auth";
import { casoPorId, clientePorId } from "@/lib/data";
import { brl, diffDias, fmtData, fmtDataHora, hojeISO } from "@/lib/domain/datas";
import { EXCECOES, FASES, isAberto } from "@/lib/domain/types";
import { AcoesPortal } from "@/components/AcoesPortal";
import { PropostaCard } from "@/components/PropostaCard";
import { Pill } from "@/components/ui";

export const metadata: Metadata = { title: "Caso" };

const EXPLICA: Record<string, string> = {
  regua: "O devedor recebe as notificações automáticas da régua. Se não houver resposta, a equipe assume o contato.",
  neg: "A equipe está em contato direto com o devedor para receber ou fechar um acordo dentro da sua alçada.",
  acordo: "Acordo fechado. A equipe acompanha cada parcela; se uma vencer sem pagamento, você é avisado por aqui.",
  quebra: "Uma parcela do acordo venceu sem pagamento. A equipe decide entre renegociar e protestar.",
  analise: "A equipe avalia se vale judicializar ou devolver o título a você com parecer.",
  protesto: "Título protestado em cartório. O devedor tem prazo para pagar antes do registro.",
  judicial: "Em cobrança judicial, acompanhada pelo escritório.",
  confirma: "Pagamento informado. A cobrança está suspensa até a conferência no extrato.",
  pago: "Encerrado como pago.",
  devolvido: "Encerrado e devolvido a você, com parecer da equipe.",
};

export default async function CasoPortalPage(props: PageProps<"/portal/casos/[id]">) {
  const u = await exigeCliente();
  const { id } = await props.params;
  const [dados, cliente] = await Promise.all([casoPorId(id), clientePorId(u.cliente_id)]);
  if (!dados || !cliente || dados.caso.cliente_id !== u.cliente_id) notFound();
  const { caso, eventos, parcelas, propostas } = dados;
  const hoje = hojeISO();
  const aberto = isAberto(caso);
  const pendente = propostas.find((p) => p.status === "pending") ?? null;
  const ultimoContato = eventos.find((e) => ["contato", "proposta", "acordo"].includes(e.tipo));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Link href="/portal/carteira" style={{ textDecoration: "none" }}>Carteira</Link> · {caso.referencia}</div>
          <h1>{caso.devedor}</h1>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Pill fase={caso.fase} />
            {caso.exc_tipo && <span className="pill ph-confirma">Pausado · {EXCECOES[caso.exc_tipo]}</span>}
          </div>
        </div>
      </div>
      <div className="caso-grid">
        <div className="stack">
          <div className="money">
            <div><span>Valor da dívida</span><b className="num" style={caso.valor_atualizado == null ? { color: "var(--bad)", fontSize: 16 } : undefined}>{caso.valor_atualizado == null ? "Não informado" : brl(caso.valor_atualizado)}</b>{caso.valor_atualizado == null && <span>informe o valor pela planilha ou em &quot;Orientar a equipe&quot;</span>}</div>
            <div><span>Em cobrança há</span><b className="num" style={{ fontSize: 16 }}>{diffDias(hoje, caso.entrada_em)} dias</b><span>desde {fmtData(caso.entrada_em)}</span></div>
          </div>
          <div className="verdict in" style={{ fontSize: 13 }}><b>{FASES[caso.fase].label}.</b> {EXPLICA[caso.fase]}{caso.fase_nota && caso.fase_nota !== FASES[caso.fase].label ? ` Situação: ${caso.fase_nota}.` : ""}</div>
          {aberto && (
            <div className="terms">
              <div><span>Responsável no escritório</span><b>{caso.responsavel ?? "Equipe GF"}</b></div>
              <div><span>Próximo passo previsto</span><b className="num">{caso.proxima_data ? fmtData(caso.proxima_data) : "—"}</b></div>
              <div><span>Último contato com o devedor</span><b className="num">{ultimoContato ? fmtData(ultimoContato.data.slice(0, 10)) : "—"}</b></div>
              <div><span>Acordo</span><b className="num">{caso.acordo ? `${caso.acordo.paid}/${caso.acordo.parc} pagas` : "—"}</b></div>
            </div>
          )}
          {caso.exc_tipo && <div className="verdict warn"><b>Cobrança pausada.</b> {EXCECOES[caso.exc_tipo]} desde {fmtData(caso.exc_desde)}{caso.exc_motivo ? `: ${caso.exc_motivo}` : ""}. Revisão prevista em {fmtData(caso.exc_revisao)}. {caso.exc_tipo === "aguardando" ? "Responda em \"Orientar a equipe\" para a cobrança seguir." : ""}</div>}
          {pendente && <PropostaCard p={pendente} caso={caso} cliente={cliente} voltar="caso" />}
          <div><p className="sec-t">O que você pode fazer</p><AcoesPortal caso={caso} hoje={hoje} aberto={aberto} /></div>
        </div>
        <div className="stack">
          <div className="panel">
            <p className="sec-t">Dados do caso</p>
            <dl className="dl">
              <dt>Referência</dt><dd>{caso.referencia}</dd>
              {caso.detalhe && <><dt>Detalhe</dt><dd>{caso.detalhe}</dd></>}
              <dt>Documento</dt><dd className="num">{caso.documento ?? <span className="err">não informado</span>}</dd>
              <dt>Telefone</dt><dd className="num">{caso.telefone ?? "—"}</dd>
              {caso.email && <><dt>E-mail</dt><dd>{caso.email}</dd></>}
              <dt>Última movimentação</dt><dd className="num">{fmtData(caso.ultima_mov_em.slice(0, 10))}</dd>
              {caso.processo && <><dt>Processo</dt><dd>{caso.processo}</dd></>}
              {caso.encerrado_em && <><dt>Encerrado em</dt><dd className="num">{fmtData(caso.encerrado_em.slice(0, 10))}</dd></>}
            </dl>
          </div>
          {parcelas.length > 0 && (
            <div className="panel"><p className="sec-t">Parcelas em cobrança ({parcelas.length})</p>
              <dl className="dl">{parcelas.map((p) => <span key={p.id} style={{ display: "contents" }}><dt>{p.referencia}</dt><dd className="num">{brl(p.valor)} · venc. {fmtData(p.vencimento)}{p.paga ? " · paga" : ""}</dd></span>)}</dl>
            </div>
          )}
          <div className="panel">
            <p className="sec-t">Histórico</p>
            <ol className="tl">
              {eventos.map((e) => <li key={e.id}><span /><div><div className="when num">{fmtDataHora(e.data)} · {e.autor}</div><div className="what">{e.texto}</div></div></li>)}
              {eventos.length === 0 && <li><span /><div className="meta">Sem registros ainda.</div></li>}
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
