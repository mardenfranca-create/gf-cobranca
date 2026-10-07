import { cancelarCobranca, sincronizarCobranca } from "@/lib/actions/asaas";
import { brl, fmtData } from "@/lib/domain/datas";
import { COBRANCA_STATUS, type Cobranca } from "@/lib/domain/types";

/** Boletos/Pix emitidos no Asaas para o caso. Na mesa tem sincronizar e cancelar; no portal é só leitura. */
export function CobrancasCaso({ cobrancas, casoId, mesa }: { cobrancas: Cobranca[]; casoId: string; mesa: boolean }) {
  if (!cobrancas.length) return null;
  const ativas = cobrancas.filter((c) => c.status !== "DELETED");
  const pagas = ativas.filter((c) => ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(c.status));
  return (
    <div className="panel">
      <p className="sec-t">Cobranças no Asaas ({pagas.length}/{ativas.length} pagas)</p>
      <div style={{ display: "grid", gap: 8 }}>
        {cobrancas.map((c) => {
          const st = COBRANCA_STATUS[c.status] ?? { label: c.status, cls: "ph-confirma" };
          const rot = c.tipo === "entrada" ? "Entrada" : c.tipo === "parcela" ? `Parcela ${c.parcela_n}/${c.parcelas}` : c.tipo === "integral" ? "Integral" : "Avulsa";
          return (
            <div key={c.id} style={{ display: "grid", gap: 4, padding: "8px 0", borderBottom: "1px solid var(--ink-05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <b style={{ fontSize: 13 }}>{rot} · <span className="num">{brl(c.valor)}</span> · venc. <span className="num">{fmtData(c.vencimento)}</span></b>
                <span className={`pill ${st.cls}`}>{st.label}{c.pago_em ? ` em ${fmtData(c.pago_em.slice(0, 10))}` : ""}</span>
              </div>
              <div className="meta" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {c.invoice_url && <a href={c.invoice_url} target="_blank" rel="noopener" style={{ color: "var(--bronze-dark)" }}>link do boleto/Pix</a>}
                {c.boleto_url && <a href={c.boleto_url} target="_blank" rel="noopener" style={{ color: "var(--bronze-dark)" }}>PDF do boleto</a>}
                {mesa && c.pix_copia && <span className="mono" title="Pix copia e cola" style={{ userSelect: "all", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.pix_copia}</span>}
                {mesa && c.status !== "DELETED" && (
                  <>
                    <form action={sincronizarCobranca} style={{ display: "inline" }}><input type="hidden" name="caso_id" value={casoId} /><input type="hidden" name="asaas_id" value={c.asaas_id} /><button className="btn ghost sm" type="submit">Sincronizar</button></form>
                    {!pagas.some((p) => p.id === c.id) && <form action={cancelarCobranca} style={{ display: "inline" }}><input type="hidden" name="caso_id" value={casoId} /><input type="hidden" name="asaas_id" value={c.asaas_id} /><button className="btn danger sm" type="submit">Cancelar</button></form>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {mesa && <p className="meta" style={{ marginTop: 8 }}>Pagamentos chegam sozinhos pelo webhook. &quot;Sincronizar&quot; consulta o Asaas na hora, para quando o webhook atrasar.</p>}
    </div>
  );
}
