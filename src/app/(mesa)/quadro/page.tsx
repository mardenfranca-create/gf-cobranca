import type { Metadata } from "next";
import { listaCasos, mapaClientes } from "@/lib/data";
import { brl, diffDias, hojeISO } from "@/lib/domain/datas";
import { FASES, FASES_ABERTAS, FASES_FECHADAS, isAberto, type Fase } from "@/lib/domain/types";
import { LinkCaso, PageHead, Pill, Valor } from "@/components/ui";

export const metadata: Metadata = { title: "Quadro" };

export default async function QuadroPage(props: PageProps<"/quadro">) {
  const sp = await props.searchParams;
  const cliente = typeof sp.cliente === "string" ? sp.cliente : null;
  const hoje = hojeISO();
  const [casos, clientes] = await Promise.all([listaCasos({ cliente }), mapaClientes()]);
  const colunas = [...FASES_ABERTAS, ...FASES_FECHADAS].filter((f) => ["neg", "acordo", "analise", "judicial", "pago"].includes(f) || casos.some((c) => c.fase === f));
  return (
    <>
      <PageHead eyebrow="Quadro" titulo="Casos por fase" sub="O caso muda de coluna quando o operador registra a ação, não arrastando. Cartões ordenados pelo tempo parado." />
      <div className="board">
        {colunas.map((f: Fase) => {
          const ts = casos.filter((c) => c.fase === f).sort((a, b) => a.ultima_mov_em.localeCompare(b.ultima_mov_em));
          const mostrar = ts.slice(0, FASES_FECHADAS.includes(f) ? 3 : 12);
          return (
            <div key={f} className="kcol">
              <div className="kcol-h"><Pill fase={f} /><span className="num">{ts.length}</span></div>
              <div className="kcol-h" style={{ paddingTop: 0 }}><span className="num">{brl(ts.reduce((s, c) => s + (c.valor_atualizado ?? 0), 0), false)}</span></div>
              {mostrar.map((c) => {
                const parado = diffDias(hoje, c.ultima_mov_em.slice(0, 10));
                return (
                  <LinkCaso key={c.id} caso={c} className="kcard">
                    <div className="who">{c.devedor}</div>
                    <div className="cl">{clientes[c.cliente_id]?.nome_curto ?? c.cliente_id} · {c.fase_nota}</div>
                    <div className="row"><Valor caso={c} /><span className={`num ${parado >= 60 && isAberto(c) ? "late" : ""}`}>{parado} d parado</span></div>
                    {c.exc_tipo && <div className="row"><span>Exceção</span><span>{FASES[c.fase] ? "régua pausada" : ""}</span></div>}
                  </LinkCaso>
                );
              })}
              {ts.length > mostrar.length && <div className="kmore">+ {ts.length - mostrar.length} na aba Casos</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
