import type { Metadata } from "next";
import { listaCasos, mapaClientes } from "@/lib/data";
import { compacto, hojeISO } from "@/lib/domain/datas";
import { GRUPOS, montaFila } from "@/lib/domain/fila";
import { isAberto } from "@/lib/domain/types";
import { LinkCaso, PageHead, Pill, Valor } from "@/components/ui";

export const metadata: Metadata = { title: "Fila de hoje" };

export default async function FilaPage(props: PageProps<"/fila">) {
  const sp = await props.searchParams;
  const cliente = typeof sp.cliente === "string" ? sp.cliente : null;
  const hoje = hojeISO();
  const [casos, clientes] = await Promise.all([listaCasos({ cliente, abertos: true }), mapaClientes()]);
  const tarefas = montaFila(casos, clientes, hoje);
  const abertos = casos.filter(isAberto);
  const semValor = abertos.filter((c) => c.valor_atualizado == null).length;
  const aConferir = abertos.filter((c) => c.fase === "confirma").length;
  const emExcecao = abertos.filter((c) => c.exc_tipo).length;

  return (
    <>
      <PageHead eyebrow={`Mesa de operação · ${hoje.split("-").reverse().join("/")}`} titulo="Fila de hoje" sub="O sistema monta a fila sozinho a partir da régua. Clique na tarefa para agir. Nada aqui depende de alguém lembrar." />
      <div className="kpis">
        <div className="kpi"><div className="lbl">Tarefas na fila</div><div className={`val num ${tarefas.some((t) => t.p === "alta") ? "alert" : ""}`}>{tarefas.length}</div><div className="foot"><b>{tarefas.filter((t) => t.p === "alta").length}</b> de prioridade alta</div></div>
        <div className="kpi"><div className="lbl">Saldo em cobrança (valor conhecido)</div><div className="val num">{compacto(abertos.reduce((s, c) => s + (c.valor_atualizado ?? 0), 0))}</div><div className="foot"><b>{abertos.length}</b> casos abertos · <b>{semValor}</b> sem valor</div></div>
        <div className="kpi"><div className="lbl">Pagamentos a conferir</div><div className="val num">{aConferir}</div><div className="foot">informados pelos clientes</div></div>
        <div className="kpi"><div className="lbl">Em exceção</div><div className="val num">{emExcecao}</div><div className="foot">régua pausada, com data de revisão</div></div>
      </div>
      {tarefas.length === 0 && <div className="panel empty">Fila vazia. Nenhum caso precisa de ação humana hoje.</div>}
      {GRUPOS.map((g) => {
        const ts = tarefas.filter((t) => t.g === g.g);
        if (!ts.length) return null;
        return (
          <section key={g.g}>
            <div className="group-h"><h2>{g.label}</h2><span>{ts.length} · {g.dica}</span></div>
            <div className="tasks">
              {ts.map((t) => (
                <LinkCaso key={t.caso.id + t.titulo} caso={t.caso} className="task" {...{ "data-p": t.p }}>
                  <div className="stripe" />
                  <div className="body"><div className="t">{t.titulo}</div><div className="d">{t.caso.devedor} · {t.descricao}</div></div>
                  <div className="side"><span className="cl">{t.cliente} · {t.caso.responsavel}</span><Valor caso={t.caso} /><Pill fase={t.caso.fase} /></div>
                </LinkCaso>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
