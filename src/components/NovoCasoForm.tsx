"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { novoCaso, type EstadoNovoCaso } from "@/lib/actions/casos";
import { RESPONSAVEIS_NOVO_CASO, RESPONSAVEL_PADRAO } from "@/lib/domain/novo-caso";
import { normalizaCelular } from "@/lib/domain/whatsapp";

function Enviar() {
  const { pending } = useFormStatus();
  return <button className="btn" type="submit" disabled={pending} aria-busy={pending}>{pending ? "Abrindo caso…" : "Abrir caso"}</button>;
}

/** Formulário de cadastro avulso. Em erro, os campos voltam preenchidos; em sucesso a action redireciona para o caso. */
export function NovoCasoForm({ clientes, clienteInicial, hoje }: { clientes: { id: string; nome: string }[]; clienteInicial: string | null; hoje: string }) {
  const [estado, action] = useActionState<EstadoNovoCaso, FormData>(novoCaso, null);
  const v = estado?.valores;
  const [telefone, setTelefone] = useState(v?.telefone ?? "");
  const digitos = telefone.replace(/\D/g, "");
  const celularOk = !!normalizaCelular(telefone);
  const dicaTelefone = !digitos ? "Sem celular, a régua automática de WhatsApp não envia." : celularOk ? "Celular válido: a régua automática vai enviar o WhatsApp." : digitos.length < 10 ? "Informe o DDD." : "Não parece um celular: a régua automática não vai enviar.";

  return (
    <form className="panel" action={action} style={{ display: "grid", gap: 14 }}>
      <div className="panel-head"><h2>Dados do devedor e da dívida</h2><p>Mesmas regras da planilha: CPF/CNPJ completo, valor maior que zero e título já vencido.</p></div>
      {estado && estado.erros.length > 0 && <div className="verdict out"><b>Confira antes de abrir:</b> {estado.erros.join(" · ")}</div>}
      <div className="frow" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div className="field"><label htmlFor="nc-cliente">Cliente credor</label>
          <div className="inp"><select id="nc-cliente" name="cliente_id" defaultValue={v?.cliente_id ?? clienteInicial ?? ""} required>
            <option value="">Escolha o cliente</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select></div></div>
        <div className="field"><label htmlFor="nc-resp">Responsável</label>
          <div className="inp"><select id="nc-resp" name="responsavel" defaultValue={v?.responsavel || RESPONSAVEL_PADRAO}>
            {RESPONSAVEIS_NOVO_CASO.map((r) => <option key={r} value={r}>{r}</option>)}
          </select></div></div>
      </div>
      <div className="frow" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div className="field"><label htmlFor="nc-devedor">Devedor</label>
          <div className="inp"><input id="nc-devedor" name="devedor" defaultValue={v?.devedor ?? ""} required placeholder="Responsável financeiro ou razão social" /></div></div>
        <div className="field"><label htmlFor="nc-doc">CPF / CNPJ</label>
          <div className="inp"><input id="nc-doc" name="documento" defaultValue={v?.documento ?? ""} required inputMode="numeric" placeholder="000.000.000-00" /></div>
          <small>11 dígitos (CPF) ou 14 (CNPJ). É o que identifica o devedor na carteira.</small></div>
      </div>
      <div className="field"><label htmlFor="nc-ref">Referência</label>
        <div className="inp"><input id="nc-ref" name="referencia" defaultValue={v?.referencia ?? ""} required placeholder="Ex.: Mensalidades mar a jun/2026 - Ana (5º ano)" /></div>
        <small>O que é a dívida. O que vier depois de &quot; - &quot; fica como detalhe.</small></div>
      <div className="frow" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="field"><label htmlFor="nc-valor">Valor</label>
          <div className="inp"><span>R$</span><input id="nc-valor" name="valor" defaultValue={v?.valor ?? ""} required inputMode="decimal" placeholder="2.450,00" /></div></div>
        <div className="field"><label htmlFor="nc-venc">Vencimento</label>
          <div className="inp"><input id="nc-venc" name="vencimento" type="date" defaultValue={v?.vencimento ?? ""} max={hoje} required /></div>
          <small>Data do vencimento original (já vencido).</small></div>
      </div>
      <div className="frow" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div className="field"><label htmlFor="nc-tel">Celular com DDD</label>
          <div className="inp"><input id="nc-tel" name="telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="(62) 99999-9999" /></div>
          <small className={!digitos || celularOk ? undefined : "err"}>{dicaTelefone}</small></div>
        <div className="field"><label htmlFor="nc-email">E-mail <small>(opcional)</small></label>
          <div className="inp"><input id="nc-email" name="email" type="email" defaultValue={v?.email ?? ""} placeholder="devedor@exemplo.com" /></div></div>
      </div>
      <div className="actions" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <span className="meta">Se o devedor já tiver caso aberto neste cliente, a parcela entra no caso existente em vez de abrir outro.</span>
        <Enviar />
      </div>
    </form>
  );
}
