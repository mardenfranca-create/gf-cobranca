import type { Metadata } from "next";
import Link from "next/link";
import { exigeAdmin } from "@/lib/auth";
import { mapaClientes } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import { brl, compacto, fmtData, fmtDataHora, hojeISO } from "@/lib/domain/datas";
import { carteiraParada, porCliente, produtividade, recuperadoPorMes, rotuloMes, taxaAcordo, tempoAtePagamento, ultimosMeses, type EventoComAutor } from "@/lib/domain/painel";
import { type Caso, type Cobranca } from "@/lib/domain/types";
import { navegador, type Acesso } from "@/lib/acessos";
import { estadoRegua } from "@/lib/config/regua";
import { whatsappEnv } from "@/lib/whatsapp";
import { alternarRegua } from "@/lib/actions/configuracoes";
import { LinkCaso, PageHead, Pill, PillExcecao } from "@/components/ui";

export const metadata: Metadata = { title: "Painel" };

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export default async function PainelPage(props: PageProps<"/painel">) {
  await exigeAdmin();
  const sp = await props.searchParams;
  const aviso = { ok: typeof sp.ok === "string" ? sp.ok : null, erro: typeof sp.erro === "string" ? sp.erro : null };
  const hoje = hojeISO();
  const inicio12 = `${ultimosMeses(hoje, 12)[0]}-01`;
  const sb = await supabaseServer();
  const [regua, wa] = [await estadoRegua(sb), whatsappEnv()];
  const reguaLigada = !regua.pausada && wa.reguaAuto && wa.ok;
  const [clientes, { data: casosRaw }, { data: eventosRaw }, { data: cobrancasRaw }, { data: acessosRaw }] = await Promise.all([
    mapaClientes(),
    sb.from("casos").select("*").limit(5000),
    sb.from("eventos").select("id, caso_id, data, autor, autor_id, tipo, texto, visivel_cliente").gte("data", inicio12).order("data", { ascending: false }).limit(20000),
    sb.from("cobrancas").select("*").in("status", ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]).limit(5000),
    sb.from("acessos").select("*").order("criado_em", { ascending: false }).limit(8),
  ]);
  const casos = (casosRaw ?? []) as Caso[];
  const eventos = (eventosRaw ?? []) as EventoComAutor[];
  const cobrancas = (cobrancasRaw ?? []) as Cobranca[];
  const acessos = (acessosRaw ?? []) as Acesso[];

  const meses = recuperadoPorMes(casos, cobrancas, hoje, 12);
  const mesAtual = meses[meses.length - 1];
  const r12 = meses.reduce((s, m) => s + m.valor, 0);
  const n12 = meses.reduce((s, m) => s + m.casos, 0);
  const maxMes = Math.max(1, ...meses.map((m) => m.valor));
  const linhas = porCliente(casos, hoje);
  const acordo = taxaAcordo(casos, eventos);
  const tempo = tempoAtePagamento(casos, hoje);
  const parados = carteiraParada(casos, hoje);
  const saldoParado = parados.reduce((s, c) => s + (c.valor_atualizado ?? c.valor_original ?? 0), 0);
  const equipe = produtividade(casos, eventos, hoje);
  const nomeCliente = (id: string) => clientes[id]?.nome_curto ?? clientes[id]?.nome ?? id;

  return (
    <>
      <PageHead eyebrow={`Painel · ${fmtData(hoje)}`} titulo="Resultado e saúde da operação" sub="Recuperação por mês e por cliente, taxa de acordo, tempo até o pagamento, carteira parada e produtividade da equipe. Só o admin vê esta página.">
        <div className="actions"><Link className="btn ghost" href="/painel/acessos">Log de acesso</Link></div>
      </PageHead>

      {aviso.ok && <div className="verdict in" style={{ marginBottom: 12 }}>{aviso.ok}</div>}
      {aviso.erro && <div className="verdict out" style={{ marginBottom: 12 }}>{aviso.erro}</div>}
      <div className={`panel`} style={{ marginBottom: 16, borderColor: reguaLigada ? "var(--bad)" : "var(--ink-10)" }}>
        <div className="panel-head" style={{ marginBottom: 6 }}>
          <h2>Régua automática de WhatsApp: {reguaLigada ? "LIGADA" : "pausada"}</h2>
          <form action={alternarRegua}>
            <input type="hidden" name="voltar" value="/painel" />
            {regua.pausada
              ? <button className="btn" type="submit" name="acao" value="ligar" disabled={!wa.reguaAuto || !wa.ok}>Ligar a régua</button>
              : <button className="btn danger" type="submit" name="acao" value="pausar">Pausar agora</button>}
          </form>
        </div>
        <p className="meta" style={{ margin: 0 }}>
          {regua.pausada
            ? `Pausada${regua.por ? ` por ${regua.por}` : ""}${regua.em ? ` em ${fmtDataHora(regua.em)}` : ""}. O cron das 9h só simula; nada sai sozinho. Envio manual pelo caso e pela aba WhatsApp continua funcionando.`
            : `Ligada${regua.por ? ` por ${regua.por}` : ""}${regua.em ? ` em ${fmtDataHora(regua.em)}` : ""}. Lembretes saem nos dias úteis às 9h para casos em "Régua automática".`}
          {regua.fonte === "sem-tabela" && " Tabela de configurações ainda não existe (migration 0009): tratado como pausada."}
          {!wa.reguaAuto && " Na Vercel, WHATSAPP_REGUA_AUTOMATICA está desligada: mesmo ligando aqui, o cron só simula."}
        </p>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="lbl">Recuperado em {rotuloMes(mesAtual.mes)}</div><div className="val num">{compacto(mesAtual.valor)}</div><div className="foot"><b>{mesAtual.casos}</b> {mesAtual.casos === 1 ? "caso pago" : "casos pagos"} · Asaas {brl(mesAtual.asaas, false)}</div></div>
        <div className="kpi"><div className="lbl">Recuperado em 12 meses</div><div className="val num">{compacto(r12)}</div><div className="foot"><b>{n12}</b> casos · ticket médio {n12 ? brl(r12 / n12, false) : "—"}</div></div>
        <div className="kpi"><div className="lbl">Taxa de acordo</div><div className="val num">{pct(acordo.taxa)}</div><div className="foot"><b>{acordo.comAcordo}</b> acordos em <b>{acordo.trabalhados}</b> casos trabalhados · <b>{acordo.quebrados}</b> quebrados</div></div>
        <div className="kpi"><div className="lbl">Tempo até o pagamento</div><div className="val num">{tempo.media == null ? "—" : `${tempo.media} dias`}</div><div className="foot">mediana <b>{tempo.mediana ?? "—"}</b> · {tempo.n} casos pagos em 12 meses</div></div>
      </div>

      <div className="grid two">
        <div className="panel">
          <div className="panel-head"><h2>Recuperado por mês</h2><p>casos encerrados como pagos · últimos 12 meses</p></div>
          <div className="blist">
            {meses.map((m) => (
              <div key={m.mes} className="brow">
                <div className="name num">{rotuloMes(m.mes)}</div>
                <div className="v num">{m.valor ? brl(m.valor, false) : "—"}<small>{m.casos} {m.casos === 1 ? "caso" : "casos"} · {m.novos} novos{m.devolvidos ? ` · ${m.devolvidos} devolvidos` : ""}{m.asaas ? ` · Asaas ${brl(m.asaas, false)}` : ""}</small></div>
                <div className="track"><i style={{ width: `${Math.round((m.valor / maxMes) * 100)}%`, background: "var(--bar)" }} /></div>
              </div>
            ))}
          </div>
          <p className="blist-note">Valor do caso no encerramento. O Asaas mostra o que entrou por boleto/Pix emitido pelo sistema, inclusive parcelas de acordos ainda em curso.</p>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Por cliente</h2><p>12 meses · recuperação = pagos ÷ encerrados</p></div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Cliente</th><th className="r">Abertos</th><th className="r">Saldo</th><th className="r">Mês</th><th className="r">12 meses</th><th className="r">Recup.</th><th className="r">Parados</th><th></th></tr></thead>
              <tbody>
                {linhas.length === 0 && <tr><td colSpan={8} className="empty">Sem casos.</td></tr>}
                {linhas.map((l) => (
                  <tr key={l.cliente_id}>
                    <td><Link className="rowlink" href={`/casos?cliente=${l.cliente_id}`}><div className="main">{nomeCliente(l.cliente_id)}</div></Link></td>
                    <td className="r num">{l.abertos}</td>
                    <td className="r num">{brl(l.saldo, false)}</td>
                    <td className="r num">{l.recuperadoMes ? brl(l.recuperadoMes, false) : "—"}</td>
                    <td className="r num">{l.recuperado12m ? brl(l.recuperado12m, false) : "—"}<div className="meta">{l.pagos12m}/{l.encerrados12m}</div></td>
                    <td className="r num">{pct(l.taxaRecuperacao)}</td>
                    <td className="r num" style={l.parados ? { color: "var(--bad)", fontWeight: 600 } : undefined}>{l.parados}</td>
                    <td className="r"><a className="btn ghost sm" href={`/api/relatorio?cliente=${l.cliente_id}&mes=${hoje.slice(0, 7)}`} target="_blank" rel="noopener">PDF do mês</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid two" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-head"><h2>Produtividade da equipe</h2><p>últimos 30 dias · casos e atrasos de hoje</p></div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Pessoa</th><th className="r">Casos</th><th className="r">Atrasados</th><th className="r">Contatos</th><th className="r">Propostas</th><th className="r">Acordos</th><th className="r">Registros</th><th className="r">Pagos no mês</th></tr></thead>
              <tbody>
                {equipe.length === 0 && <tr><td colSpan={8} className="empty">Nenhum registro nos últimos 30 dias.</td></tr>}
                {equipe.map((p) => (
                  <tr key={p.nome}>
                    <td><div className="main">{p.nome}</div></td>
                    <td className="r num">{p.casos}</td>
                    <td className="r num" style={p.atrasados ? { color: "var(--bad)", fontWeight: 600 } : undefined}>{p.atrasados}</td>
                    <td className="r num">{p.contatos30}</td>
                    <td className="r num">{p.propostas30}</td>
                    <td className="r num">{p.acordos30}</td>
                    <td className="r num">{p.movimentos30}</td>
                    <td className="r num">{p.pagosMes}<div className="meta">{p.recuperadoMes ? brl(p.recuperadoMes, false) : ""}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="blist-note">Registros: tudo que a pessoa gravou no caso (contato, proposta, acordo, exceção, pagamento). Atrasados: tarefas com data anterior a hoje sob sua responsabilidade.</p>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Últimos acessos</h2><p><Link href="/painel/acessos">ver tudo</Link></p></div>
          {acessos.length === 0 ? <div className="empty">Nenhum acesso registrado ainda. Aplique a migration 0005 e os próximos logins aparecem aqui.</div> : (
            <ol className="tl">
              {acessos.map((a) => (
                <li key={a.id}><span /><div><div className="when num">{fmtDataHora(a.criado_em)} · {a.cidade ?? a.ip ?? "origem não identificada"}</div><div className="what"><b>{a.nome ?? a.email}</b>{a.resultado === "falha" ? <span className="err"> · senha incorreta ou usuário inexistente</span> : ` · ${a.papel ?? ""}`} · {navegador(a.user_agent)}</div></div></li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <section style={{ marginTop: 16 }}>
        <div className="group-h"><h2>Carteira parada há mais de 60 dias</h2><span>{parados.length} {parados.length === 1 ? "caso" : "casos"} · {brl(saldoParado, false)} sem nenhuma movimentação</span></div>
        {parados.length === 0 ? <div className="panel"><div className="empty">Nenhum caso aberto parado há mais de 60 dias. Operação em dia.</div></div> : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Devedor</th><th>Cliente</th><th className="r">Valor</th><th>Etapa</th><th className="r">Parado há</th><th>Responsável</th><th>Próxima ação</th></tr></thead>
              <tbody>
                {parados.slice(0, 100).map((c) => (
                  <tr key={c.id}>
                    <td><LinkCaso caso={c} className="rowlink"><div className="main">{c.devedor}</div><div className="meta">{c.referencia}</div></LinkCaso></td>
                    <td>{nomeCliente(c.cliente_id)}</td>
                    <td className="r num">{c.valor_atualizado == null ? <span className="err">sem valor</span> : brl(c.valor_atualizado, false)}</td>
                    <td><Pill fase={c.fase} /> <PillExcecao caso={c} /></td>
                    <td className="r num" style={{ color: "var(--bad)", fontWeight: 600 }}>{c.paradoHa} dias</td>
                    <td>{c.responsavel}</td>
                    <td className="meta">{c.proxima_nota} · <span className="num">{fmtData(c.proxima_data)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parados.length > 100 && <div className="tbl-foot"><span>Mostrando 100 de {parados.length}.</span></div>}
          </div>
        )}
      </section>
    </>
  );
}
