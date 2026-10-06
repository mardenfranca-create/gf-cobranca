"use client";
import { useState, useTransition } from "react";
import { aplicarPlanilha, importarTrello, previaPlanilha, type Previa } from "@/lib/actions/importar";
import { brl, fmtData } from "@/lib/domain/datas";

const K: Record<string, [string, string]> = {
  novo: ["Caso novo", "okt"], consolida: ["Já em cobrança: parcela adicionada ao caso", "okt"], igual: ["Já em cobrança: sem mudança", "meta"],
  baixa: ["Baixa informada: vai para conferência", "okt"], excecao: ["Não cobrar: exceção registrada", "err"],
};

export function ImportarPlanilha({ clientes, clienteFixo }: { clientes: { id: string; nome: string }[]; clienteFixo: string | null }) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const nome = (id: string | null) => clientes.find((c) => c.id === id)?.nome ?? id ?? "—";

  return (
    <div className="panel">
      <div className="panel-head"><h2>Planilha de casos (.xlsx ou .csv)</h2></div>
      <form className="drop" action={(fd) => start(async () => { setMsg(null); setPrevia(await previaPlanilha(fd)); })}>
        <h2>Escolha a planilha do cliente</h2>
        <p>{clienteFixo ? `Todas as linhas entram para ${nome(clienteFixo)}.` : 'Com "Todos os clientes" no topo, a planilha precisa da coluna cliente.'} A planilha é comparada com a carteira antes de gravar qualquer coisa.</p>
        <input type="hidden" name="cliente" value={clienteFixo ?? ""} />
        <input type="file" name="arquivo" accept=".xlsx,.xls,.csv" required />
        <button className="btn" type="submit" disabled={pending}>{pending ? "Lendo…" : "Conferir planilha"}</button>
      </form>
      {msg && <div className="verdict in" style={{ marginTop: 12 }}>{msg}</div>}
      {previa && !previa.ok && <div className="verdict out" style={{ marginTop: 12 }}>{previa.erro}</div>}
      {previa && previa.ok && (
        <form style={{ marginTop: 14 }} action={(fd) => start(async () => { const r = await aplicarPlanilha(fd); setMsg(r.msg); if (r.ok) setPrevia(null); })}>
          <input type="hidden" name="previa" value={JSON.stringify(previa)} />
          {previa.jaImportada && <div className="verdict out" style={{ marginBottom: 12 }}>Esta planilha já foi importada antes (mesmo conteúdo). Aplicar de novo não fará nada.</div>}
          <div className="up-sum"><div><b>{previa.linhas.length} linhas lidas.</b> <span className="okt">{previa.linhas.length - previa.resumo.erros} válidas</span>{previa.resumo.erros > 0 && <> · <span className="err">{previa.resumo.erros} com erro</span></>}</div>
            <button className="btn" type="submit" disabled={pending || previa.jaImportada || previa.linhas.length - previa.resumo.erros === 0}>Aplicar</button></div>
          <div className="terms num" style={{ marginBottom: 12 }}>
            <div><span>Novos</span><b>{previa.resumo.novos}</b></div><div><span>Já em cobrança</span><b>{previa.resumo.consolidados + previa.resumo.iguais}</b></div>
            <div><span>Baixas informadas</span><b>{previa.resumo.baixas}</b></div><div><span>Não cobrar</span><b>{previa.resumo.excecoes}</b></div>
          </div>
          {previa.ausentes.length > 0 && (
            <div className="verdict warn" style={{ marginBottom: 12 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}><input type="checkbox" name="ausentes" style={{ marginTop: 3 }} />
                <span><b>{previa.ausentes.length} casos abertos do(s) cliente(s) não aparecem nesta planilha.</b> Marque se esta é a posição completa de inadimplência: eles vão para &quot;Pagamento a confirmar&quot; em vez de desaparecer. Desmarcado, ficam como estão.</span></label>
            </div>
          )}
          <div className="tbl-wrap"><table style={{ minWidth: 640 }}>
            <thead><tr><th>Linha</th><th>Cliente</th><th>Devedor</th><th className="r">Valor</th><th>Vencimento</th><th>Resultado</th></tr></thead>
            <tbody>{previa.linhas.map((l) => (
              <tr key={l.linha} className={l.erros.length ? "bad" : ""}>
                <td className="num">{l.linha}</td><td>{nome(l.cliente_id) || l.cliente}</td>
                <td><div className="main">{l.devedor || "—"}</div><div className="meta">{l.referencia}{l.situacao ? " · " + l.situacao : ""}</div></td>
                <td className="r num">{l.valor == null ? "—" : brl(l.valor)}</td><td className="num">{l.vencimento ? fmtData(l.vencimento) : "—"}</td>
                <td>{l.erros.length ? <span className="err">{l.erros.join("; ")}</span> : <><span className={K[l.kind][1]}>{K[l.kind][0]}</span>{l.caso_fase && <div className="meta">caso existente: {l.caso_fase}</div>}</>}</td>
              </tr>))}</tbody>
          </table></div>
        </form>
      )}
    </div>
  );
}

export function ImportarTrello() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="panel">
      <div className="panel-head"><h2>Recarregar do Trello (JSON)</h2></div>
      <form className="drop" action={(fd) => start(async () => { const r = await importarTrello(fd); setMsg(r.msg); })}>
        <p>Menu do quadro → Imprimir, exportar e compartilhar → Exportar como JSON. Cartões já importados são ignorados; só os novos entram.</p>
        <input type="file" name="arquivo" accept=".json,application/json" required />
        <button className="btn ghost" type="submit" disabled={pending}>{pending ? "Importando…" : "Importar do Trello"}</button>
      </form>
      {msg && <div className="verdict in" style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}
