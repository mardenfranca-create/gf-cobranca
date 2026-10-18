"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { aplicarTelefones, previaTelefones, type PreviaTelefones } from "@/lib/actions/contatos";
import { fmtTelefone } from "@/lib/domain/inbox";

const ROTULO: Record<string, string> = { preencher: "Vai preencher", igual: "Já cadastrado", diferente: "Telefone diferente", ambiguo: "Mais de um caso", sem_caso: "Sem caso" };
const FORCA: Record<string, string> = { exata: "nome igual", contida: "nome contido", parcial: "duas primeiras palavras" };

/** Importa telefones de exportações de contatos (Digisac, Google) e cruza com os casos abertos. */
export function ImportarTelefones({ clientes }: { clientes: { id: string; nome: string }[] }) {
  const [previa, setPrevia] = useState<PreviaTelefones | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const nome = (id: string | null) => clientes.find((c) => c.id === id)?.nome ?? id ?? "—";
  const itens = previa?.ok ? previa.itens : [];
  const grupo = (k: string) => itens.filter((x) => x.kind === k);

  return (
    <div className="panel">
      <div className="panel-head"><h2>Telefones a partir de contatos (Digisac, Google)</h2><p>vários arquivos de uma vez</p></div>
      <form className="drop" action={(fd) => start(async () => { setMsg(null); setPrevia(await previaTelefones(fd)); })}>
        <h2>Escolha os arquivos de contatos</h2>
        <p>Exportação do Digisac (Nome, DDI, Telefone, Atendente, Departamento) ou qualquer CSV com colunas nome e telefone. Selecione todos os arquivos de uma vez (Ctrl+A na janela). Cruza com os casos abertos por telefone já cadastrado e pelo nome. Nada é gravado antes da sua conferência.</p>
        <input type="file" name="arquivos" accept=".csv,.txt" multiple required />
        <button className="btn" type="submit" disabled={pending}>{pending ? "Lendo…" : "Cruzar com os casos"}</button>
      </form>
      {msg && <div className="verdict in" style={{ marginTop: 12 }}>{msg}</div>}
      {previa && !previa.ok && <div className="verdict out" style={{ marginTop: 12 }}>{previa.erro}</div>}
      {previa && previa.ok && (
        <form style={{ marginTop: 14 }} action={(fd) => start(async () => { const r = await aplicarTelefones(fd); setMsg(r.msg); if (r.ok) setPrevia(null); })}>
          {previa.avisos.map((a) => <div key={a} className="verdict warn" style={{ marginBottom: 8 }}>{a}</div>)}
          <input type="hidden" name="agenda" value={JSON.stringify(previa.agenda)} />
          <div className="verdict in" style={{ marginBottom: 12 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}><input type="checkbox" name="agenda_guardar" defaultChecked style={{ marginTop: 3 }} />
              <span><b>Guardar todos os {previa.agenda.length} contatos na agenda do sistema.</b> A aba WhatsApp passa a mostrar o nome de quem escreve, mesmo sem caso. Contato que já existe só muda de nome se o novo for mais completo.</span></label>
          </div>
          <div className="up-sum"><div><b>{previa.lidos} contatos em {previa.arquivos} {previa.arquivos === 1 ? "arquivo" : "arquivos"}.</b> <span className="okt">{previa.resumo.preencher} para preencher</span> · {previa.resumo.igual} já cadastrados · {previa.resumo.diferente} com telefone diferente · {previa.resumo.ambiguo} ambíguos · {previa.resumo.sem_caso} sem caso ({previa.resumo.cobrancaSemCaso} marcados como cobrança)</div>
            <button className="btn" type="submit" disabled={pending}>Gravar</button></div>
          {grupo("diferente").length > 0 && (
            <div className="verdict warn" style={{ marginBottom: 12 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}><input type="checkbox" name="sobrescrever" style={{ marginTop: 3 }} />
                <span><b>{grupo("diferente").length} casos já têm um telefone diferente do contato.</b> Marque para trocar pelo telefone do contato nos itens marcados abaixo. Desmarcado, esses ficam como estão (o histórico do caso registra a troca).</span></label>
            </div>
          )}
          <div className="tbl-wrap"><table style={{ minWidth: 700 }}>
            <thead><tr><th></th><th>Contato</th><th>Telefone</th><th>Caso</th><th>Como casou</th><th>Resultado</th></tr></thead>
            <tbody>
              {[...grupo("preencher"), ...grupo("diferente"), ...grupo("ambiguo"), ...grupo("igual"), ...grupo("sem_caso")].map((x, i) => (
                <tr key={`${x.contato.telefone}-${i}`} className={x.kind === "sem_caso" ? "bad" : ""}>
                  <td>{(x.kind === "preencher" || x.kind === "diferente") && x.caso && <input type="checkbox" name="escolha" value={`${x.caso.id}|${x.contato.telefone}|${x.contato.nome.replace(/\|/g, " ")}`} defaultChecked={x.kind === "preencher"} aria-label="gravar" />}
                    {x.kind === "ambiguo" && x.candidatos.map((c) => <label key={c.id} style={{ display: "block", whiteSpace: "nowrap", fontSize: 12 }}><input type="checkbox" name="escolha" value={`${c.id}|${x.contato.telefone}|${x.contato.nome.replace(/\|/g, " ")}`} /> {c.devedor} · {nome(c.cliente_id)}</label>)}</td>
                  <td><div className="main">{x.contato.nome}</div><div className="meta">{x.contato.departamento || x.contato.atendente || x.contato.arquivo}</div></td>
                  <td className="num">{fmtTelefone(x.contato.telefone)}</td>
                  <td>{x.caso ? <Link href={`/casos/${x.caso.id}`}>{x.caso.devedor}</Link> : x.kind === "ambiguo" ? <span className="meta">{x.candidatos.length} candidatos</span> : <span className="meta">{x.cliente_id ? `cliente ${nome(x.cliente_id)}, sem caso aberto` : "—"}</span>}{x.caso && <div className="meta">{nome(x.caso.cliente_id)}{x.caso.telefone ? ` · hoje: ${x.caso.telefone}` : " · sem telefone"}</div>}</td>
                  <td className="meta">{x.forca ? FORCA[x.forca] : "—"}</td>
                  <td><span className={x.kind === "preencher" ? "okt" : x.kind === "sem_caso" ? "err" : "meta"}>{ROTULO[x.kind]}</span></td>
                </tr>
              ))}
              {itens.length === 0 && <tr><td colSpan={6} className="empty">Nenhum contato casou com caso aberto e nenhum estava marcado como cobrança.</td></tr>}
            </tbody>
          </table></div>
          <p className="meta" style={{ marginTop: 10 }}>Contatos sem caso e sem marca de cobrança (pessoais, fornecedores, equipe) ficam de fora da lista. Ambíguos: marque o caso certo ou deixe em branco.</p>
        </form>
      )}
    </div>
  );
}
