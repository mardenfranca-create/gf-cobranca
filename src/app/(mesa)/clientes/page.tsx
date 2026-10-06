import type { Metadata } from "next";
import { exigeEquipe } from "@/lib/auth";
import { listaCasos, listaClientes, listaRegua } from "@/lib/data";
import { brl, compacto, diffDias, hojeISO } from "@/lib/domain/datas";
import { isAberto } from "@/lib/domain/types";
import { criarCliente, salvarCliente, salvarRegua } from "@/lib/actions/clientes";
import { PageHead } from "@/components/ui";

export const metadata: Metadata = { title: "Clientes" };
const TIPO: Record<string, string> = { escola: "Escola · Lei 9.870/99 aplicável aos scripts", contab: "Serviços contábeis · B2B", b2b: "Empresa · B2B", assoc: "Associação / condomínio" };

export default async function ClientesPage() {
  const u = await exigeEquipe();
  const admin = u.papel === "admin";
  const hoje = hojeISO();
  const [clientes, regua, casos] = await Promise.all([listaClientes(), listaRegua(), listaCasos()]);
  return (
    <>
      <PageHead eyebrow="Clientes" titulo="Carteiras sob gestão" sub="Régua, alçadas, honorários e prazo de protesto. Só administradores alteram." />
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2>Régua de cobrança</h2><p>Prazos que definem a próxima ação de cada caso. Salvar reprograma os follow-ups automáticos; datas marcadas à mão são preservadas.</p></div>
        <form action={salvarRegua}>
          <div className="cols" style={{ border: 0 }}>
            {regua.map((r) => (
              <div key={r.chave}><code>{r.dias} {r.dias === 1 ? "dia" : "dias"}</code>
                <span style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <span>{r.rotulo}</span>
                  <span className="inp" style={{ width: 110 }}><input type="number" name={`dias_${r.chave}`} min={0} max={365} defaultValue={r.dias} disabled={!admin} aria-label={r.rotulo} /><span>d</span></span>
                </span>
              </div>
            ))}
          </div>
          {admin && <div className="actions" style={{ marginTop: 12 }}><button className="btn" type="submit">Salvar régua e reprogramar agenda</button></div>}
        </form>
      </div>
      <div className="ccards">
        {clientes.map((c) => {
          const abertos = casos.filter((x) => x.cliente_id === c.id && isAberto(x));
          return (
            <form key={c.id} className="card" action={salvarCliente}>
              <input type="hidden" name="id" value={c.id} />
              <div className="card-top"><div><h2>{c.nome}</h2><div className="meta">{TIPO[c.tipo]}</div></div></div>
              <div className="kv">
                <div><span>Saldo conhecido em cobrança</span><b className="num">{compacto(abertos.reduce((s, x) => s + (x.valor_atualizado ?? 0), 0))}</b></div>
                <div><span>Casos abertos</span><b className="num">{abertos.length} <small style={{ fontWeight: 400, color: "var(--ink-60)" }}>({abertos.filter((x) => x.valor_atualizado == null).length} sem valor)</small></b></div>
                <div><span>Parados há mais de 60 dias</span><b className="num">{abertos.filter((x) => diffDias(hoje, x.ultima_mov_em.slice(0, 10)) > 60).length}</b></div>
                <div><span>Em exceção</span><b className="num">{abertos.filter((x) => x.exc_tipo).length}</b></div>
              </div>
              <div>
                <p className="sec-t" style={{ marginBottom: 6 }}>Alçadas (o que a equipe fecha sem consultar o cliente)</p>
                <div className="frow">
                  <div className="field"><label>Desconto máx.</label><div className="inp"><input type="number" name="desc" defaultValue={c.limites.desc} disabled={!admin} /><span>%</span></div></div>
                  <div className="field"><label>Parcelas máx.</label><div className="inp"><input type="number" name="parc" defaultValue={c.limites.parc} disabled={!admin} /><span>×</span></div></div>
                  <div className="field"><label>Entrada mín.</label><div className="inp"><input type="number" name="ent" defaultValue={c.limites.ent} disabled={!admin} /><span>%</span></div></div>
                  <div className="field"><label>Parcela mín.</label><div className="inp"><span>R$</span><input type="number" name="min" defaultValue={c.limites.min} disabled={!admin} /></div></div>
                </div>
              </div>
              <div className="frow">
                <div className="field"><label>Êxito extrajudicial</label><div className="inp"><input type="number" name="extra" defaultValue={c.honorarios.extra} disabled={!admin} /><span>%</span></div></div>
                <div className="field"><label>Êxito judicial</label><div className="inp"><input type="number" name="jud" defaultValue={c.honorarios.jud} disabled={!admin} /><span>%</span></div></div>
                <div className="field"><label>Protesto a partir de</label><div className="inp"><input type="number" name="protesto" defaultValue={c.protesto_dias} disabled={!admin} /><span>dias</span></div></div>
              </div>
              <div className="field"><label>Contato no cliente</label><div className="inp"><input name="contato" defaultValue={c.contato ?? ""} placeholder="Nome · telefone · e-mail" disabled={!admin} /></div></div>
              {admin && <div className="actions"><button className="btn ghost sm" type="submit">Salvar {c.nome_curto}</button></div>}
              <div className="meta">Parcela mínima de referência: {brl(c.limites.min, false)}</div>
            </form>
          );
        })}
        {admin && (
          <form className="card" action={criarCliente}>
            <h2>Novo cliente credor</h2>
            <div className="field"><label>Nome</label><div className="inp"><input name="nome" required placeholder="Ex.: Colégio Horizonte" /></div></div>
            <div className="frow">
              <div className="field"><label>Nome curto</label><div className="inp"><input name="nome_curto" placeholder="Horizonte" /></div></div>
              <div className="field"><label>Tipo</label><div className="inp"><select name="tipo" defaultValue="escola"><option value="escola">Escola</option><option value="contab">Contabilidade</option><option value="b2b">Empresa</option><option value="assoc">Associação</option></select></div></div>
            </div>
            <div className="actions"><button className="btn sm" type="submit">Cadastrar</button></div>
            <div className="meta">Alçadas e honorários entram com o padrão e podem ser ajustados depois.</div>
          </form>
        )}
      </div>
    </>
  );
}
