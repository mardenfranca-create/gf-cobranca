"use client";
import { useState, type ReactNode } from "react";
import { addDias } from "@/lib/domain/datas";
import { EQUIPE, EXCECOES, FOLLOWUPS, type Caso, type Cliente, type Proposta } from "@/lib/domain/types";
import * as A from "@/lib/actions/casos";
import { emitirCobranca, emitirParcelasAcordo } from "@/lib/actions/asaas";

type Acao = { k: string; titulo: string; sub: string; form: ReactNode; danger?: boolean };

function Campo({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field"><label>{label}</label>{children}{hint && <small>{hint}</small>}</div>
  );
}
const Sel = ({ name, opts, def }: { name: string; opts: [string, string][]; def?: string }) => (
  <div className="inp"><select name={name} defaultValue={def}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
);

export function AcoesCaso({ caso, cliente, hoje, propostaPendente, asaas }: { caso: Caso; cliente: Cliente; hoje: string; propostaPendente: Proposta | null; asaas?: { ativo: boolean; ambiente: string; temCobrancas: boolean } }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const H = <input type="hidden" name="caso_id" value={caso.id} />;
  const acoes: Acao[] = [];
  const fechado = caso.fase === "pago" || caso.fase === "devolvido";

  const contato: Acao = {
    k: "contato", titulo: "Registrar contato", sub: "WhatsApp, ligação ou e-mail. Entra no histórico que o cliente vê e marca o próximo follow-up.",
    form: (
      <form action={A.registrarContato} className="act-form">{H}
        <div className="frow">
          <Campo label="Canal"><Sel name="canal" opts={[["WhatsApp", "WhatsApp"], ["Telefone", "Telefone"], ["E-mail", "E-mail"], ["Presencial", "Presencial"]]} /></Campo>
          <Campo label="Resultado"><Sel name="resultado" opts={[["Pediu prazo", "Pediu prazo"], ["Vai pagar o boleto", "Vai pagar o boleto"], ["Contesta a dívida", "Contesta a dívida"], ["Não atendeu", "Não atendeu"], ["Vai enviar proposta", "Vai enviar proposta"]]} /></Campo>
        </div>
        <Campo label="Observação"><textarea name="obs" placeholder="O que foi combinado, em uma frase. O cliente lê isso." /></Campo>
        <div className="frow">
          <Campo label="Próximo follow-up"><div className="inp"><input type="date" name="proxima_data" defaultValue={addDias(hoje, 3)} /></div></Campo>
          <Campo label="Tipo"><Sel name="proximo_tipo" opts={Object.entries(FOLLOWUPS)} def="recontatar" /></Campo>
        </div>
        <div className="actions"><button className="btn sm" type="submit">Salvar e agendar</button></div>
      </form>
    ),
  };
  const agendar: Acao = {
    k: "agendar", titulo: "Agendar follow-up", sub: caso.proxima_data ? `Hoje: ${caso.proxima_data.split("-").reverse().join("/")} · ${caso.proxima_nota}` : "Sem data marcada.",
    form: (
      <form action={A.agendarFollowup} className="act-form">{H}
        <div className="frow">
          <Campo label="Data"><div className="inp"><input type="date" name="data" defaultValue={caso.proxima_data ?? addDias(hoje, 3)} /></div></Campo>
          <Campo label="Tipo"><Sel name="tipo" opts={Object.entries(FOLLOWUPS)} def={caso.proxima_tipo ?? "recontatar"} /></Campo>
        </div>
        <Campo label="O que fazer nesse dia"><div className="inp"><input name="nota" defaultValue={caso.proxima_nota ?? ""} placeholder="Ex.: cobrar comprovante prometido" /></div></Campo>
        <div className="actions"><button className="btn sm" type="submit">Salvar na agenda</button></div>
      </form>
    ),
  };
  const atribuir: Acao = {
    k: "atribuir", titulo: "Atribuir responsável", sub: `Hoje: ${caso.responsavel ?? "—"}`,
    form: (<form action={A.atribuirResponsavel} className="act-form">{H}<div className="frow"><Campo label="Responsável"><Sel name="responsavel" opts={EQUIPE.map((e) => [e, e])} def={caso.responsavel ?? "Ana Paula"} /></Campo></div><div className="actions"><button className="btn sm" type="submit">Atribuir</button></div></form>),
  };
  const excecao: Acao = {
    k: "excecao", titulo: caso.exc_tipo ? "Alterar exceção" : "Marcar exceção", sub: "Não cobrar, aguardando orientação, cliente negociando, contestação. Pausa a régua sem tirar o caso da agenda.",
    form: (
      <form action={A.marcarExcecao} className="act-form">{H}
        <div className="frow">
          <Campo label="Tipo"><Sel name="tipo" opts={Object.entries(EXCECOES)} def={caso.exc_tipo ?? "aguardando"} /></Campo>
          <Campo label="Revisar em"><div className="inp"><input type="date" name="revisao" defaultValue={caso.exc_revisao ?? addDias(hoje, 30)} /></div></Campo>
        </div>
        <Campo label="Motivo (o cliente vê)"><textarea name="motivo" defaultValue={caso.exc_motivo ?? ""} placeholder="Ex.: cliente pediu para segurar, está negociando a renovação da matrícula." /></Campo>
        <div className="verdict warn">Enquanto a exceção durar, o caso sai da fila de cobrança e nenhuma mensagem é disparada. Ele volta sozinho na data de revisão.</div>
        <div className="actions"><button className="btn sm" type="submit">Salvar exceção</button></div>
      </form>
    ),
  };
  const cadastro: Acao = {
    k: "cadastro", titulo: "Completar cadastro", sub: "Valor da dívida, CPF/CNPJ e contato. Necessário para notificar, protestar e negativar.",
    form: (
      <form action={A.atualizarCadastro} className="act-form">{H}
        <div className="frow">
          <Campo label="Valor atualizado"><div className="inp"><span>R$</span><input type="number" step="0.01" name="valor" defaultValue={caso.valor_atualizado ?? ""} /></div></Campo>
          <Campo label="CPF/CNPJ"><div className="inp"><input name="documento" defaultValue={caso.documento ?? ""} /></div></Campo>
        </div>
        <div className="frow">
          <Campo label="Telefone"><div className="inp"><input name="telefone" defaultValue={caso.telefone ?? ""} /></div></Campo>
          <Campo label="E-mail"><div className="inp"><input name="email" defaultValue={caso.email ?? ""} /></div></Campo>
        </div>
        <div className="actions"><button className="btn sm" type="submit">Salvar cadastro</button></div>
      </form>
    ),
  };

  if (fechado) {
    acoes.push({ k: "reativar", titulo: "Reativar cobrança", sub: "Volta para negociação. Use quando o cliente devolver o caso ou aparecer contato novo.", form: (<form action={A.reativarCobranca} className="act-form">{H}<div className="verdict warn">O caso volta para &quot;Em negociação&quot; e entra na fila de hoje.</div><div className="actions"><button className="btn sm" type="submit">Reativar</button></div></form>) });
  } else if (caso.exc_tipo) {
    acoes.push({ k: "retomar", titulo: "Retomar cobrança", sub: "Levanta a exceção e volta à régua normal.", form: (<form action={A.retomarCobranca} className="act-form">{H}<div className="verdict in">A régua recomeça da fase atual com os prazos configurados.</div><div className="actions"><button className="btn sm" type="submit">Retomar cobrança</button></div></form>) });
    acoes.push(excecao, contato, atribuir);
    acoes.push({ k: "devolver", titulo: "Devolver ao cliente", sub: "Encerra com parecer. O cliente vê o motivo no portal.", danger: true, form: (<form action={A.devolverAoCliente} className="act-form">{H}<Campo label="Parecer para o cliente"><textarea name="parecer" /></Campo><div className="actions"><button className="btn danger sm" type="submit">Devolver e encerrar</button></div></form>) });
  } else if (caso.fase === "confirma") {
    acoes.push({ k: "confirmar", titulo: "Confirmar pagamento", sub: "Encontrou no extrato do cliente ou do Asaas. Encerra o caso.", form: (<form action={A.confirmarPagamento} className="act-form">{H}<div className="frow"><Campo label="Onde localizou"><Sel name="onde" opts={[["Extrato do cliente", "Extrato do cliente"], ["Asaas (baixa manual)", "Asaas (baixa manual)"], ["Comprovante enviado", "Comprovante enviado"]]} /></Campo></div><div className="actions"><button className="btn sm" type="submit">Confirmar e encerrar</button></div></form>) });
    acoes.push({ k: "naoconf", titulo: "Não localizado", sub: "Devolve o caso para negociação e avisa o cliente.", danger: true, form: (<form action={A.pagamentoNaoLocalizado} className="act-form">{H}<Campo label="Motivo"><textarea name="motivo" placeholder="Ex.: valor não consta no extrato de set/26 enviado pela secretaria." /></Campo><div className="actions"><button className="btn danger sm" type="submit">Devolver para negociação</button></div></form>) });
    acoes.push(atribuir);
  } else {
    acoes.push(contato, agendar, atribuir, excecao);
    if (caso.valor_atualizado == null || !caso.documento_digits) acoes.push(cadastro);
    const podeEmitir = !!asaas?.ativo && !!caso.documento_digits && caso.valor_atualizado != null;
    const sandbox = asaas?.ambiente !== "production";
    if (asaas?.ativo && caso.fase === "acordo" && !asaas.temCobrancas) acoes.push({ k: "asaas_acordo", titulo: "Emitir parcelas do acordo no Asaas", sub: `Entrada + parcelas mensais, uma cobrança por parcela, com boleto e Pix. Baixa automática por webhook.${sandbox ? " Ambiente: sandbox (teste)." : ""}`, form: (
      <form action={emitirParcelasAcordo} className="act-form">{H}
        <div className="frow">
          <Campo label="Total do acordo"><div className="inp"><span>R$</span><input type="number" step="0.01" name="total" defaultValue={caso.valor_atualizado ?? ""} required /></div></Campo>
          <Campo label="Parcelas"><div className="inp"><input type="number" name="parcelas" min={1} max={60} defaultValue={caso.acordo?.parc ?? 6} /><span>×</span></div></Campo>
          <Campo label="Entrada"><div className="inp"><input type="number" name="entrada" min={0} max={100} defaultValue={0} /><span>%</span></div></Campo>
          <Campo label="1º vencimento"><div className="inp"><input type="date" name="primeiro" defaultValue={addDias(hoje, 5)} min={hoje} /></div></Campo>
        </div>
        <div className="verdict warn">Multa de 2% e juros de 1% ao mês após o vencimento, aplicados pelo Asaas. O devedor recebe boleto e Pix por e-mail/SMS do Asaas se tiver contato cadastrado lá.</div>
        <div className="actions"><button className="btn sm" type="submit">Emitir no Asaas</button></div>
      </form>) });
    if (podeEmitir && caso.fase !== "acordo") acoes.push({ k: "asaas_boleto", titulo: "Emitir boleto/Pix no Asaas", sub: `Cobrança única do valor em aberto. Pagou, o caso encerra sozinho.${sandbox ? " Ambiente: sandbox (teste)." : ""}`, form: (
      <form action={emitirCobranca} className="act-form">{H}<input type="hidden" name="tipo" value="integral" />
        <div className="frow">
          <Campo label="Valor"><div className="inp"><span>R$</span><input type="number" step="0.01" name="valor" defaultValue={caso.valor_atualizado ?? ""} required /></div></Campo>
          <Campo label="Vencimento"><div className="inp"><input type="date" name="vencimento" defaultValue={addDias(hoje, 5)} min={hoje} /></div></Campo>
          <Campo label="Desconto até o vencimento"><div className="inp"><input type="number" name="desconto" min={0} max={90} defaultValue={0} /><span>%</span></div></Campo>
        </div>
        <Campo label="Descrição no boleto"><div className="inp"><input name="descricao" defaultValue={`${caso.referencia} · ${cliente.nome_curto}`} /></div></Campo>
        <div className="actions"><button className="btn sm" type="submit">Emitir no Asaas</button></div>
      </form>) });
    if (asaas && !asaas.ativo) acoes.push({ k: "asaas_off", titulo: "Asaas não configurado", sub: "Cadastre ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN na Vercel para emitir boletos daqui.", form: <div className="act-form"><div className="verdict warn">Veja o roteiro no README, seção Asaas.</div></div> });
    if (caso.fase === "acordo") {
      acoes.push({ k: "parcela", titulo: "Marcar parcela paga", sub: caso.acordo ? `Parcela ${caso.acordo.paid + 1} de ${caso.acordo.parc}.` : "Informe o parcelamento na primeira vez.", form: (
        <form action={A.marcarParcelaPaga} className="act-form">{H}
          {caso.acordo ? <div className="verdict in">Parcela {caso.acordo.paid + 1}/{caso.acordo.parc} {caso.acordo.paid + 1 === caso.acordo.parc ? "é a última: o caso será encerrado." : "confirmada no extrato."}</div>
            : <div className="frow"><Campo label="Total de parcelas"><div className="inp"><input type="number" name="total_parcelas" min={1} max={36} defaultValue={6} /></div></Campo><Campo label="Já pagas (com esta)"><div className="inp"><input type="number" name="ja_pagas" min={1} max={36} defaultValue={1} /></div></Campo></div>}
          <div className="actions"><button className="btn sm" type="submit">Confirmar</button></div>
        </form>) });
      acoes.push({ k: "quebrar", titulo: "Marcar acordo quebrado", sub: "Parcela vencida sem pagamento. Volta para a fila de decisão.", danger: true, form: (<form action={A.marcarAcordoQuebrado} className="act-form">{H}<div className="verdict out">O caso volta para a fila &quot;Decidir&quot;.</div><div className="actions"><button className="btn danger sm" type="submit">Marcar quebrado</button></div></form>) });
    } else if (caso.fase !== "judicial") {
      if (propostaPendente) {
        acoes.push({ k: "lembrar", titulo: "Proposta aguardando o cliente", sub: `Fora da alçada: ${propostaPendente.desconto_pct}% · ${propostaPendente.parcelas}×. O cliente decide no portal.`, form: (<div className="act-form"><div className="verdict warn">Enquanto o cliente não decidir, a proposta aparece em &quot;Aguardando o cliente&quot;. Use &quot;Registrar contato&quot; para anotar o lembrete.</div></div>) });
      } else if (caso.valor_atualizado != null) {
        acoes.push({ k: "proposta", titulo: "Registrar proposta de acordo", sub: `Alçada do cliente: até ${cliente.limites.desc}% · ${cliente.limites.parc}× · entrada ≥ ${cliente.limites.ent}%. O sistema decide se fecha ou manda ao cliente.`, form: (
          <form action={A.registrarProposta} className="act-form">{H}
            <div className="frow">
              <Campo label="Desconto"><div className="inp"><input type="number" name="desconto" min={0} max={90} defaultValue={15} /><span>%</span></div></Campo>
              <Campo label="Parcelas"><div className="inp"><input type="number" name="parcelas" min={1} max={36} defaultValue={6} /><span>×</span></div></Campo>
              <Campo label="Entrada"><div className="inp"><input type="number" name="entrada" min={0} max={100} defaultValue={10} /><span>%</span></div></Campo>
            </div>
            <Campo label="Contexto para o cliente"><textarea name="nota" placeholder="Por que essa proposta faz sentido. O cliente lê se precisar aprovar." /></Campo>
            <div className="actions"><button className="btn sm" type="submit">Registrar proposta</button></div>
          </form>) });
      }
      if (["neg", "quebra", "regua", "analise"].includes(caso.fase)) acoes.push({ k: "protesto", titulo: "Enviar a protesto", sub: `Regra do cliente: a partir de ${cliente.protesto_dias} dias. Protesto interrompe a prescrição (art. 202, III, CC).`, form: (
        <form action={A.enviarProtesto} className="act-form">{H}<Campo label="Justificativa (obrigatória antes do prazo do cliente)"><textarea name="justificativa" /></Campo><div className="verdict warn">Checagem: título líquido, vencido e com documento de origem.</div><div className="actions"><button className="btn sm" type="submit">Confirmar envio à CENPROT</button></div></form>) });
      acoes.push({ k: "judicial", titulo: "Encaminhar ao judicial", sub: "Abre o caso no Astrea e designa advogado. Honorário sobe para a faixa judicial.", form: (
        <form action={A.encaminharJudicial} className="act-form">{H}
          <div className="frow"><Campo label="Advogado"><Sel name="advogado" opts={[["Lucas", "Lucas"], ["Jaqueline", "Jaqueline"], ["Letícia", "Letícia"]]} /></Campo><Campo label="Via"><Sel name="via" opts={[["Execução (título executivo)", "Execução (título executivo)"], ["Monitória", "Monitória"], ["Juizado Especial", "Juizado Especial"]]} /></Campo></div>
          <div className="verdict warn">Confira se o contrato tem 2 testemunhas ou assinatura eletrônica validada antes de escolher execução.</div>
          <div className="actions"><button className="btn sm" type="submit">Encaminhar</button></div>
        </form>) });
      if (caso.fase === "analise") acoes.push({ k: "devolver", titulo: "Devolver ao cliente", sub: "Encerra sem êxito com parecer. O cliente vê o motivo no portal.", danger: true, form: (<form action={A.devolverAoCliente} className="act-form">{H}<Campo label="Parecer para o cliente"><textarea name="parecer" placeholder="Ex.: sem documento de origem e devedor sem bens localizáveis; custo judicial supera o crédito." /></Campo><div className="actions"><button className="btn danger sm" type="submit">Devolver e encerrar</button></div></form>) });
    }
    acoes.push({ k: "pagto", titulo: "Registrar pagamento integral", sub: "Quando o devedor paga fora do boleto e o Asaas não baixou.", form: (
      <form action={A.registrarPagamentoIntegral} className="act-form">{H}<div className="frow"><Campo label="Valor recebido"><div className="inp"><span>R$</span><input type="number" step="0.01" name="valor" defaultValue={caso.valor_atualizado ?? ""} /></div></Campo><Campo label="Forma"><Sel name="forma" opts={[["Pix", "Pix"], ["Transferência", "Transferência"], ["Depósito judicial", "Depósito judicial"], ["Dinheiro", "Dinheiro"]]} /></Campo></div><div className="actions"><button className="btn sm" type="submit">Registrar e encerrar</button></div></form>) });
  }

  return (
    <div className="acts">
      {acoes.map((a) => (
        <div key={a.k}>
          <button type="button" className="act" aria-expanded={aberta === a.k} onClick={() => setAberta(aberta === a.k ? null : a.k)}>
            <div><b style={a.danger ? { color: "var(--bad)" } : undefined}>{a.titulo}</b><span>{a.sub}</span></div><i>›</i>
          </button>
          {aberta === a.k && a.form}
        </div>
      ))}
    </div>
  );
}
