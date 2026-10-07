import type { Metadata } from "next";
import { exigeCliente } from "@/lib/auth";
import { clientePorId, listaAjustes } from "@/lib/data";
import { brl, fmtDataHora } from "@/lib/domain/datas";
import { salvarAlcadasCliente } from "@/lib/actions/portal";
import { PageHead } from "@/components/ui";

export const metadata: Metadata = { title: "Alçadas e contato" };

const CAMPO: Record<string, string> = { limites: "Alçadas", contato: "Contato", honorarios: "Honorários", protesto_dias: "Prazo de protesto" };
function mostra(campo: string, v: unknown) {
  if (v == null) return "—";
  if (campo === "limites" && typeof v === "object") { const l = v as Record<string, number>; return `${l.desc}% · ${l.parc}× · entrada ${l.ent}% · mín. ${brl(l.min, false)}`; }
  if (campo === "honorarios" && typeof v === "object") { const h = v as Record<string, number>; return `${h.extra}% extrajudicial · ${h.jud}% judicial`; }
  return String(v);
}

export default async function ConfigPage(props: PageProps<"/portal/config">) {
  const u = await exigeCliente();
  const sp = await props.searchParams;
  const [c, ajustes] = await Promise.all([clientePorId(u.cliente_id), listaAjustes(u.cliente_id)]);
  if (!c) return null;
  return (
    <>
      <PageHead eyebrow="Alçadas e contato" titulo="Até onde a equipe fecha sem consultar você" sub="Dentro destes limites a equipe fecha o acordo na hora, o que recupera mais rápido. Fora deles, a proposta vem para sua aprovação. Toda alteração fica registrada com autor e data." />
      {sp.ok === "1" && <div className="verdict in" style={{ marginBottom: 14 }}>Alterações salvas e registradas.</div>}
      {sp.ok === "0" && <div className="verdict warn" style={{ marginBottom: 14 }}>Nada mudou.</div>}
      <div className="grid two">
        <form className="card" action={salvarAlcadasCliente}>
          <h2>Alçada de negociação</h2>
          <div className="frow">
            <div className="field"><label>Desconto máximo</label><div className="inp"><input type="number" name="desc" min={0} max={100} defaultValue={c.limites.desc} /><span>%</span></div><small>sobre o valor atualizado</small></div>
            <div className="field"><label>Parcelas máximas</label><div className="inp"><input type="number" name="parc" min={1} max={60} defaultValue={c.limites.parc} /><span>×</span></div></div>
            <div className="field"><label>Entrada mínima</label><div className="inp"><input type="number" name="ent" min={0} max={100} defaultValue={c.limites.ent} /><span>%</span></div></div>
            <div className="field"><label>Parcela mínima</label><div className="inp"><span>R$</span><input type="number" name="min" min={0} step={10} defaultValue={c.limites.min} /></div></div>
          </div>
          <div className="field"><label>Contato de referência na sua empresa</label><div className="inp"><input name="contato" defaultValue={c.contato ?? ""} placeholder="Nome · telefone · e-mail" /></div><small>Quem a equipe procura para orientações e aprovações urgentes.</small></div>
          <div className="actions"><button className="btn" type="submit">Salvar alterações</button></div>
          <div className="meta">Honorários contratados: {c.honorarios.extra}% de êxito extrajudicial e {c.honorarios.jud}% judicial. Protesto a partir de {c.protesto_dias} dias. Esses termos são do contrato e só o escritório altera.</div>
        </form>
        <div className="panel">
          <div className="panel-head"><h2>Registro de alterações</h2><p>quem mudou, quando</p></div>
          {ajustes.length === 0 && <div className="empty">Nenhuma alteração registrada ainda.</div>}
          <ol className="tl">
            {ajustes.map((a) => <li key={a.id}><span /><div><div className="when num">{fmtDataHora(a.criado_em)} · {a.autor}</div><div className="what"><b>{CAMPO[a.campo] ?? a.campo}:</b> {mostra(a.campo, a.antes)} → {mostra(a.campo, a.depois)}</div></div></li>)}
          </ol>
        </div>
      </div>
    </>
  );
}
