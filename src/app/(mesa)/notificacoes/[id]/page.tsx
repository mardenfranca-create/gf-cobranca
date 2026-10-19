import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigeEquipe } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { fmtDataHora } from "@/lib/domain/datas";
import { aplicaAssinatura, CANAIS, NOTIFICACAO_STATUS, paragrafos, type Notificacao } from "@/lib/domain/notificacao";
import { EQUIPE } from "@/lib/domain/types";
import { normalizaCelular } from "@/lib/domain/whatsapp";
import { whatsappEnv } from "@/lib/whatsapp";
import { aprovarNotificacao, cancelarNotificacao, enviarNotificacaoWhatsApp, registrarEnvioNotificacao, salvarNotificacao } from "@/lib/actions/notificacoes";
import { PageHead, Pill } from "@/components/ui";

export const metadata: Metadata = { title: "Notificação" };

export default async function NotificacaoPage(props: PageProps<"/notificacoes/[id]">) {
  const u = await exigeEquipe();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const sb = await supabaseServer();
  const { data } = await sb.from("notificacoes").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const n = data as Notificacao;
  const { data: caso } = await sb.from("casos").select("*").eq("id", n.caso_id).single();
  const { data: cliente } = caso ? await sb.from("clientes").select("nome, nome_curto").eq("id", caso.cliente_id).single() : { data: null };
  const st = NOTIFICACAO_STATUS[n.status];
  const editavel = n.status === "minuta" || n.status === "aprovada";
  const cel = normalizaCelular(caso?.telefone);
  const wa = whatsappEnv();
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const H = <input type="hidden" name="id" value={n.id} />;
  const textoFinal = aplicaAssinatura(n.corpo, n.advogado, n.oab);
  const pendencias = textoFinal.match(/\[[^\]]+\]/g) ?? [];

  return (
    <>
      <PageHead eyebrow={`Notificações · ${cliente?.nome_curto ?? caso?.cliente_id ?? ""}`} titulo={caso?.devedor ?? "Notificação"} sub={`${n.titulo} · gerada por ${n.gerada_por} em ${fmtDataHora(n.criado_em)}${n.revisor ? ` · revisão: ${n.revisor}` : ""}`}>
        <div className="actions" style={{ alignItems: "center" }}>
          <span className={`pill ${st.cls}`}>{st.label}</span>
          {caso && <Pill fase={caso.fase} />}
          <Link className="btn ghost sm" href="/notificacoes">Todas</Link>
          {caso && <Link className="btn ghost sm" href={`/casos/${caso.id}`}>Abrir caso</Link>}
          <a className="btn ghost sm" href={`/api/notificacoes/${n.id}/pdf`} target="_blank" rel="noopener">Ver PDF</a>
        </div>
      </PageHead>
      {ok && <div className="verdict in" style={{ marginBottom: 12 }}>{ok}</div>}
      {erro && <div className="verdict out" style={{ marginBottom: 12 }}>{erro}</div>}

      <div className="grid two">
        <form action={salvarNotificacao} className="panel" style={{ display: "grid", gap: 10 }}>
          {H}
          <div className="panel-head"><h2>Texto da notificação</h2><p>{editavel ? "edite à vontade; parágrafos separados por linha em branco" : "somente leitura"}</p></div>
          <div className="field"><label>Título interno</label><div className="inp"><input name="titulo" defaultValue={n.titulo} readOnly={!editavel} /></div></div>
          <textarea name="corpo" defaultValue={n.corpo} rows={28} readOnly={!editavel} style={{ width: "100%", border: "1px solid var(--ink-10)", borderRadius: 4, padding: 10, background: "var(--card)", fontFamily: "var(--f-ui)", fontSize: 13.5, lineHeight: 1.55 }} />
          <div className="frow">
            <div className="field"><label>Prazo (dias)</label><div className="inp"><input name="prazo_dias" type="number" min={3} max={60} defaultValue={n.prazo_dias} readOnly={!editavel} /></div></div>
            <div className="field"><label>Advogado(a) que assina</label><div className="inp"><input name="advogado" defaultValue={n.advogado ?? ""} placeholder="Nome completo" readOnly={!editavel} list="equipe" /></div></div>
            <div className="field"><label>OAB</label><div className="inp"><input name="oab" defaultValue={n.oab ?? ""} placeholder="GO 00000" readOnly={!editavel} /></div></div>
            <div className="field"><label>Revisor</label><div className="inp"><select name="revisor" defaultValue={n.revisor ?? ""} disabled={!editavel}><option value="">—</option>{EQUIPE.map((e) => <option key={e} value={e}>{e}</option>)}</select></div></div>
          </div>
          <datalist id="equipe">{EQUIPE.map((e) => <option key={e} value={e} />)}</datalist>
          {pendencias.length > 0 && <div className="verdict warn">Campos a completar antes de aprovar: {[...new Set(pendencias)].join(", ")}</div>}
          {editavel && <div className="actions"><button className="btn" type="submit">Salvar</button>{n.status === "minuta" && <button className="btn ghost" type="submit" formAction={aprovarNotificacao}>Aprovar texto</button>}<button className="btn danger sm" type="submit" formAction={cancelarNotificacao}>Cancelar minuta</button></div>}
        </form>

        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <div className="panel">
            <div className="panel-head"><h2>Envio</h2><p>{n.status === "enviada" ? `enviada por ${n.enviada_por} em ${fmtDataHora(n.enviada_em!)}` : n.status === "aprovada" ? `aprovada por ${n.aprovada_por}` : "aprove o texto primeiro"}</p></div>
            {n.status === "enviada" ? (
              <div className="verdict in">Enviada por {CANAIS[n.canal ?? ""] ?? n.canal}{n.rastreio ? ` · ${n.rastreio}` : ""}. O caso está com prazo de {n.prazo_dias} dias na agenda.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <form action={enviarNotificacaoWhatsApp} style={{ display: "grid", gap: 8 }}>
                  {H}
                  <div><b>WhatsApp com PDF anexo</b><div className="meta">{cel ? `Para ${caso?.telefone}. Modelo gf_notificacao (precisa estar aprovado na Meta com cabeçalho de documento).` : "O caso não tem celular válido."}{caso?.wa_optout ? " Devedor pediu SAIR: não envie por aqui." : ""}</div></div>
                  <div className="actions"><button className="btn" type="submit" disabled={n.status !== "aprovada" || !cel || !!caso?.wa_optout || !wa.ok}>Enviar por WhatsApp</button></div>
                </form>
                <form action={registrarEnvioNotificacao} style={{ display: "grid", gap: 8, borderTop: "1px solid var(--ink-10)", paddingTop: 12 }}>
                  {H}
                  <div><b>Enviada por outro canal</b><div className="meta">Baixe o PDF, envie por correio com AR ou e-mail, e registre aqui. O prazo entra na agenda do mesmo jeito.</div></div>
                  <div className="frow">
                    <div className="field"><label>Canal</label><div className="inp"><select name="canal" defaultValue="correio">{Object.entries(CANAIS).filter(([k]) => k !== "whatsapp").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div></div>
                    <div className="field" style={{ flex: 1 }}><label>Rastreio / observação</label><div className="inp"><input name="rastreio" placeholder="Código do AR, e-mail usado…" /></div></div>
                  </div>
                  <div className="actions"><a className="btn ghost sm" href={`/api/notificacoes/${n.id}/pdf?baixar=1`}>Baixar PDF</a><button className="btn ghost" type="submit" disabled={n.status !== "aprovada"}>Registrar envio</button></div>
                </form>
              </div>
            )}
          </div>
          <div className="panel">
            <div className="panel-head"><h2>Prévia</h2><p>como vai no PDF (timbrado no cabeçalho)</p></div>
            <div style={{ fontSize: 13, lineHeight: 1.6, display: "grid", gap: 10 }}>
              {paragrafos(textoFinal).map((p, i) => <p key={i} style={{ margin: 0, whiteSpace: "pre-wrap", fontWeight: i === 0 ? 700 : 400, textAlign: i === 0 ? "center" : "left" }}>{p}</p>)}
            </div>
          </div>
        </div>
      </div>
      <p className="meta" style={{ marginTop: 10 }}>Conectado como {u.nome}.</p>
    </>
  );
}
