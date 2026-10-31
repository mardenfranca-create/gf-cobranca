import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { casoPorId, mapaClientes } from "@/lib/data";
import { brl, fmtData, hojeISO } from "@/lib/domain/datas";
import { SITUACAO_PARCELA, situacaoParcela, totaisParcelas } from "@/lib/domain/parcelas";
import { adicionarParcela, baixarParcela, editarCaso, editarParcela } from "@/lib/actions/casos";
import { PageHead } from "@/components/ui";

export const metadata: Metadata = { title: "Editar caso" };

const Campo = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="field"><label>{label}</label>{children}{hint && <small>{hint}</small>}</div>
);

/**
 * Edição do cadastro e das parcelas de um caso. É aqui que a equipe atende "essa mensalidade já foi paga"
 * e "não cobre essa": cada parcela pode ser corrigida, baixada como paga, retirada da cobrança ou reaberta.
 * O valor em aberto do caso é recalculado a partir das parcelas (src/lib/domain/parcelas.ts).
 */
export default async function EditarCasoPage(props: PageProps<"/casos/[id]/editar">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const aviso = typeof sp.ok === "string" ? { cls: "in", msg: sp.ok } : typeof sp.erro === "string" ? { cls: "out", msg: sp.erro } : null;
  const dados = await casoPorId(id);
  if (!dados) notFound();
  const { caso, parcelas, cobrancas } = dados;
  const clientes = await mapaClientes();
  const cliente = clientes[caso.cliente_id];
  const hoje = hojeISO();
  const t = totaisParcelas(parcelas);
  const cobrancasAbertas = cobrancas.filter((c) => c.status === "PENDING" || c.status === "OVERDUE").length;
  const H = <input type="hidden" name="caso_id" value={caso.id} />;
  const valorDiverge = caso.valor_atualizado != null && parcelas.length > 0 && Math.abs(caso.valor_atualizado - t.aberto) >= 0.01;

  return (
    <>
      <PageHead eyebrow={`${cliente?.nome ?? caso.cliente_id} · ${caso.referencia}`} titulo={`Editar: ${caso.devedor}`} sub="Cadastro do caso e parcelas consolidadas. Tudo fica registrado no histórico.">
        <Link className="btn ghost" href={`/casos/${caso.id}`}>Voltar ao caso</Link>
      </PageHead>
      {aviso && <div className={`verdict ${aviso.cls}`} style={{ marginBottom: 14 }}>{aviso.msg}</div>}

      <div className="grid two">
        <form className="panel" action={editarCaso} style={{ display: "grid", gap: 14 }}>
          {H}
          <div className="panel-head"><h2>Dados do caso</h2><p>Devedor, referência e contato. O cliente credor não muda.</p></div>
          <div className="frow" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Campo label="Devedor"><div className="inp"><input name="devedor" defaultValue={caso.devedor} required /></div></Campo>
            <Campo label="CPF / CNPJ"><div className="inp"><input name="documento" defaultValue={caso.documento ?? ""} inputMode="numeric" placeholder="000.000.000-00" /></div></Campo>
          </div>
          <div className="frow" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Campo label="Referência" hint="O que é a dívida, em poucas palavras."><div className="inp"><input name="referencia" defaultValue={caso.referencia} required /></div></Campo>
            <Campo label="Detalhe"><div className="inp"><input name="detalhe" defaultValue={caso.detalhe ?? ""} placeholder="Ex.: Ana (5º ano)" /></div></Campo>
          </div>
          <div className="frow" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <Campo label="Celular com DDD"><div className="inp"><input name="telefone" defaultValue={caso.telefone ?? ""} inputMode="tel" placeholder="(62) 99999-9999" /></div></Campo>
            <Campo label="E-mail"><div className="inp"><input name="email" type="email" defaultValue={caso.email ?? ""} /></div></Campo>
          </div>
          <Campo label="Valor em aberto" hint={parcelas.length ? `Deixe em branco para manter. Soma das parcelas abertas: ${brl(t.aberto)}. Para mexer no valor, prefira editar as parcelas abaixo.` : "Deixe em branco para manter."}>
            <div className="inp"><span>R$</span><input name="valor" inputMode="decimal" placeholder={caso.valor_atualizado == null ? "sem valor" : brl(caso.valor_atualizado, true).replace("R$", "").trim()} /></div>
          </Campo>
          <div className="actions"><button className="btn" type="submit">Salvar cadastro</button></div>
        </form>

        <div className="panel">
          <div className="panel-head"><h2>Como funciona</h2></div>
          <div className="cols">
            <div><code>paga</code><span>O cliente avisou que recebeu. A parcela sai do valor em aberto e o histórico mostra a data.</span></div>
            <div><code>retirada</code><span>O cliente pediu para não cobrar. A parcela sai da cobrança, mas fica no caso para a próxima planilha não a recriar.</span></div>
            <div><code>valor</code><span>Depois de qualquer mudança nas parcelas, o valor em aberto do caso vira a soma das parcelas abertas.</span></div>
            <div><code>encerra</code><span>Se não sobrar parcela aberta, o caso encerra sozinho: pago se alguma foi paga, devolvido se todas foram retiradas. &quot;Reativar cobrança&quot; desfaz.</span></div>
            <div><code>asaas</code><span>Boleto ou Pix já emitido não é cancelado daqui. Cancele na cobrança, no caso.</span></div>
          </div>
          {cobrancasAbertas > 0 && <div className="verdict warn" style={{ marginTop: 12 }}>Há {cobrancasAbertas} cobrança{cobrancasAbertas > 1 ? "s" : ""} em aberto no Asaas. Se baixar ou retirar parcelas, confira se o boleto precisa ser cancelado.</div>}
          {valorDiverge && <div className="verdict warn" style={{ marginTop: 12 }}>O valor em aberto do caso ({brl(caso.valor_atualizado)}) não bate com a soma das parcelas abertas ({brl(t.aberto)}). Qualquer alteração em parcela realinha o valor.</div>}
        </div>
      </div>

      <div className="panel" id="parcelas" style={{ marginTop: 18 }}>
        <div className="panel-head"><h2>Parcelas consolidadas ({parcelas.length})</h2><p>Em aberto {brl(t.aberto)}{t.pagas > 0 ? ` · pagas ${brl(t.pago)}` : ""}{t.retiradas > 0 ? ` · retiradas ${brl(t.retirado)}` : ""}</p></div>
        {parcelas.length === 0 && <p className="meta">Este caso não tem parcelas consolidadas. Inclua a primeira abaixo.</p>}
        <div style={{ display: "grid", gap: 10 }}>
          {parcelas.map((p) => {
            const sit = situacaoParcela(p);
            const Hp = <><input type="hidden" name="caso_id" value={caso.id} /><input type="hidden" name="parcela_id" value={p.id} /></>;
            return (
              <div key={p.id} style={{ border: "1px solid var(--ink-10)", borderRadius: 10, padding: 12, display: "grid", gap: 10, opacity: sit === "aberta" ? 1 : 0.85 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <b style={{ fontSize: 13 }}>{p.referencia} · <span className="num">{brl(p.valor)}</span> · venc. <span className="num">{fmtData(p.vencimento)}</span></b>
                  <span className={`pill ${sit === "aberta" ? "ph-regua" : sit === "paga" ? "ph-pago" : "ph-devolvido"}`}>{SITUACAO_PARCELA[sit]}{sit === "paga" && p.paga_em ? ` em ${fmtData(p.paga_em)}` : sit === "retirada" && p.retirada_em ? ` em ${fmtData(p.retirada_em)}` : ""}</span>
                </div>
                {sit === "retirada" && p.retirada_motivo && <div className="meta">Motivo: {p.retirada_motivo}</div>}
                <form action={editarParcela} className="frow" style={{ gridTemplateColumns: "2fr 1fr 1fr auto", alignItems: "end" }}>
                  {Hp}
                  <Campo label="Referência"><div className="inp"><input name="referencia" defaultValue={p.referencia} required /></div></Campo>
                  <Campo label="Valor"><div className="inp"><span>R$</span><input name="valor" defaultValue={String(p.valor).replace(".", ",")} inputMode="decimal" required /></div></Campo>
                  <Campo label="Vencimento"><div className="inp"><input name="vencimento" type="date" defaultValue={p.vencimento} required /></div></Campo>
                  <button className="btn ghost sm" type="submit" style={{ alignSelf: "end" }}>Corrigir</button>
                </form>
                {sit === "aberta" ? (
                  <div className="frow" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                    <form action={baixarParcela} style={{ display: "flex", gap: 6, alignItems: "end", flexWrap: "wrap" }}>
                      {Hp}<input type="hidden" name="acao" value="paga" />
                      <Campo label="Paga em"><div className="inp"><input name="paga_em" type="date" defaultValue={hoje} max={hoje} /></div></Campo>
                      <button className="btn sm" type="submit">Baixar como paga</button>
                    </form>
                    <form action={baixarParcela} style={{ display: "flex", gap: 6, alignItems: "end", flexWrap: "wrap" }}>
                      {Hp}<input type="hidden" name="acao" value="retirada" />
                      <Campo label="Motivo (o cliente vê)"><div className="inp"><input name="motivo" placeholder="Ex.: cliente pediu para não cobrar esta competência" style={{ minWidth: 220 }} /></div></Campo>
                      <button className="btn danger sm" type="submit">Retirar da cobrança</button>
                    </form>
                  </div>
                ) : (
                  <form action={baixarParcela}>
                    {Hp}<input type="hidden" name="acao" value="reabrir" />
                    <button className="btn ghost sm" type="submit">Reabrir para cobrança</button>
                  </form>
                )}
              </div>
            );
          })}
        </div>

        <form action={adicionarParcela} className="frow" style={{ gridTemplateColumns: "2fr 1fr 1fr auto", alignItems: "end", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--ink-10)" }}>
          {H}
          <Campo label="Nova parcela: referência"><div className="inp"><input name="referencia" placeholder="Ex.: Mensalidade set/2025" required /></div></Campo>
          <Campo label="Valor"><div className="inp"><span>R$</span><input name="valor" inputMode="decimal" placeholder="1.419,00" required /></div></Campo>
          <Campo label="Vencimento"><div className="inp"><input name="vencimento" type="date" max={hoje} required /></div></Campo>
          <button className="btn sm" type="submit" style={{ alignSelf: "end" }}>Incluir</button>
        </form>
      </div>
    </>
  );
}
