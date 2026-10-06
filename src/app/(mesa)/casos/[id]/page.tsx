import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { casoPorId, mapaClientes } from "@/lib/data";
import { brl, diffDias, fmtData, fmtDataHora, hojeISO } from "@/lib/domain/datas";
import { EXCECOES, isAberto } from "@/lib/domain/types";
import { AcoesCaso } from "@/components/AcoesCaso";
import { Pill, PillExcecao } from "@/components/ui";

export const metadata: Metadata = { title: "Caso" };

export default async function CasoPage(props: PageProps<"/casos/[id]">) {
  const { id } = await props.params;
  const dados = await casoPorId(id);
  if (!dados) notFound();
  const { caso, eventos, parcelas, propostas } = dados;
  const clientes = await mapaClientes();
  const cliente = clientes[caso.cliente_id];
  const hoje = hojeISO();
  const atrasado = !!caso.proxima_data && caso.proxima_data < hoje;
  const ultimoContato = eventos.find((e) => ["contato", "proposta", "acordo"].includes(e.tipo));
  const pendente = propostas.find((p) => p.status === "pending") ?? null;
  const origem = caso.origem ?? {};

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{cliente?.nome ?? caso.cliente_id} · {caso.referencia}</div>
          <h1>{caso.devedor}</h1>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Pill fase={caso.fase} /><PillExcecao caso={caso} />
            {caso.fase_nota && <span className="meta">{caso.fase_nota}</span>}
          </div>
        </div>
      </div>
      <div className="caso-grid">
        <div className="stack">
          <div className="money">
            <div><span>Valor da dívida</span><b className="num" style={caso.valor_atualizado == null ? { color: "var(--bad)", fontSize: 16 } : undefined}>{caso.valor_atualizado == null ? "Sem valor" : brl(caso.valor_atualizado)}</b>{caso.valor_fonte && <span>fonte: {caso.valor_fonte}</span>}</div>
            <div><span>Situação</span><b style={{ fontSize: 16 }}>{caso.fase_nota ?? "—"}</b><span>entrou em {fmtData(caso.entrada_em)} · {diffDias(hoje, caso.entrada_em)} dias</span></div>
          </div>
          {isAberto(caso) && (
            <div className="terms">
              <div><span>Quem</span><b>{caso.responsavel ?? "—"}</b></div>
              <div><span>O quê</span><b style={{ fontSize: 12.5 }}>{caso.exc_tipo ? `Exceção: ${EXCECOES[caso.exc_tipo]}` : caso.proxima_nota ?? <span className="err">definir</span>}</b></div>
              <div><span>Quando</span><b className="num" style={atrasado ? { color: "var(--bad)" } : undefined}>{caso.proxima_data ? fmtData(caso.proxima_data) + (atrasado ? " · atrasado" : "") : <span className="err">sem data</span>}</b></div>
              <div><span>Último contato</span><b className="num">{ultimoContato ? fmtData(ultimoContato.data.slice(0, 10)) : "—"}</b></div>
            </div>
          )}
          {caso.exc_tipo && <div className="verdict warn"><b>Régua pausada.</b> {EXCECOES[caso.exc_tipo]} desde {fmtData(caso.exc_desde)}{caso.exc_motivo ? `: ${caso.exc_motivo}` : ""}. Nenhuma cobrança é disparada até a revisão em {fmtData(caso.exc_revisao)}.</div>}
          {caso.pendencias.length > 0 && <div className="verdict out"><b>Pendências do cadastro:</b> {caso.pendencias.join(" · ")}</div>}
          {pendente && <div className="verdict warn"><b>Proposta com o cliente:</b> {pendente.desconto_pct}% · {pendente.parcelas}× · entrada {pendente.entrada_pct}% · total {brl(pendente.total)}. Enviada em {fmtData(pendente.enviada_em.slice(0, 10))}.</div>}
          <div><p className="sec-t">Ações</p><AcoesCaso caso={caso} cliente={cliente} hoje={hoje} propostaPendente={pendente} /></div>
        </div>
        <div className="stack">
          <div className="panel">
            <p className="sec-t">Dados do caso</p>
            <dl className="dl">
              <dt>Referência</dt><dd>{caso.referencia}</dd>
              {caso.detalhe && <><dt>Detalhe</dt><dd>{caso.detalhe}</dd></>}
              <dt>Documento</dt><dd className="num">{caso.documento ?? <span className="err">não informado</span>}</dd>
              <dt>Contato</dt><dd className="num">{caso.telefone ?? "sem telefone"}</dd>
              {caso.email && <><dt>E-mail</dt><dd>{caso.email}</dd></>}
              <dt>Última movimentação</dt><dd className="num">{fmtData(caso.ultima_mov_em.slice(0, 10))} · {diffDias(hoje, caso.ultima_mov_em.slice(0, 10))} dias</dd>
              {caso.acordo && <><dt>Acordo</dt><dd className="num">{caso.acordo.paid} de {caso.acordo.parc} pagas · próx. {fmtData(caso.acordo.next)}</dd></>}
              {caso.processo && <><dt>Processo</dt><dd>{caso.processo}</dd></>}
              <dt>Alçada do cliente</dt><dd>até {cliente?.limites.desc}% · {cliente?.limites.parc}× · entrada ≥ {cliente?.limites.ent}%</dd>
              {origem.trello_list && <><dt>Lista no Trello</dt><dd>{origem.trello_list}</dd></>}
              {origem.trello_url && <><dt>Cartão</dt><dd><a href={origem.trello_url} target="_blank" rel="noopener" style={{ color: "var(--bronze-dark)" }}>abrir no Trello</a></dd></>}
            </dl>
          </div>
          {parcelas.length > 0 && (
            <div className="panel"><p className="sec-t">Parcelas consolidadas ({parcelas.length})</p>
              <dl className="dl">{parcelas.map((p) => <span key={p.id} style={{ display: "contents" }}><dt>{p.referencia}</dt><dd className="num">{brl(p.valor)} · venc. {fmtData(p.vencimento)}{p.paga ? " · paga" : ""}</dd></span>)}</dl>
            </div>
          )}
          <div className="panel">
            <p className="sec-t">Histórico</p>
            <ol className="tl">
              {eventos.map((e) => (
                <li key={e.id}><span /><div><div className="when num">{fmtDataHora(e.data)} · {e.autor}{!e.visivel_cliente && " · interno"}</div><div className="what">{e.texto}</div></div></li>
              ))}
              {eventos.length === 0 && <li><span /><div className="meta">Sem registros.</div></li>}
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
