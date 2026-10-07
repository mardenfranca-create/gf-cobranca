import Link from "next/link";
import { decidirProposta } from "@/lib/actions/portal";
import { confereAlcada } from "@/lib/domain/alcada";
import { brl, fmtData } from "@/lib/domain/datas";
import type { Caso, Cliente, Proposta } from "@/lib/domain/types";

/** Proposta fora da alçada esperando o cliente. Mostra o que extrapola e colhe a decisão com motivo opcional. */
export function PropostaCard({ p, caso, cliente, voltar, comLink }: { p: Proposta; caso: Caso; cliente: Cliente; voltar: "aprovacoes" | "caso"; comLink?: boolean }) {
  const ck = confereAlcada(p, cliente.limites);
  const over = (k: string) => (ck.motivos.some((m) => m.startsWith(k)) ? "over" : "");
  return (
    <div className="card">
      <div className="card-top">
        <div>
          {comLink ? <Link href={`/portal/casos/${caso.id}`} style={{ textDecoration: "none" }}><h2>{caso.devedor}</h2></Link> : <h2>Proposta de acordo</h2>}
          <div className="meta">{caso.referencia} · dívida de {brl(caso.valor_atualizado ?? 0)} · proposta enviada em {fmtData(p.enviada_em.slice(0, 10))}</div>
        </div>
        <span className="flag out">fora da alçada</span>
      </div>
      <div className="terms">
        <div className={over("desconto")}><span>Desconto</span><b className="num">{p.desconto_pct}%</b></div>
        <div className={over("mais de")}><span>Parcelas</span><b className="num">{p.parcelas}× de {brl(ck.parcelaValor)}</b></div>
        <div className={over("entrada")}><span>Entrada</span><b className="num">{p.entrada_pct}%</b></div>
        <div><span>Total a receber</span><b className="num">{brl(p.total)}</b></div>
      </div>
      <p className="reason"><b>Por que está com você:</b> {ck.motivos.join(", ")}. Sua alçada atual: até {cliente.limites.desc}% de desconto, {cliente.limites.parc} parcelas, entrada mínima de {cliente.limites.ent}% e parcela mínima de {brl(cliente.limites.min, false)}.{p.nota ? ` Nota da equipe: ${p.nota}` : ""}</p>
      <form action={decidirProposta} style={{ display: "grid", gap: 10 }}>
        <input type="hidden" name="caso_id" value={caso.id} /><input type="hidden" name="proposta_id" value={p.id} /><input type="hidden" name="voltar" value={voltar} />
        <div className="field"><label htmlFor={`m-${p.id}`}>Observação para a equipe (opcional)</label><textarea id={`m-${p.id}`} name="motivo" placeholder="Ex.: aprovo desde que a 1ª parcela seja paga até o dia 10." style={{ minHeight: 48 }} /></div>
        <div className="actions">
          <button className="btn" type="submit" name="decisao" value="aprovar">Aprovar acordo</button>
          <button className="btn danger" type="submit" name="decisao" value="recusar">Recusar</button>
        </div>
      </form>
    </div>
  );
}
