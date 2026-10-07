"use client";
import { useState, type ReactNode } from "react";
import { enviarOrientacao, informarPagamento } from "@/lib/actions/portal";
import type { Caso } from "@/lib/domain/types";

type Acao = { k: string; titulo: string; sub: string; form: ReactNode };

function Campo({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="field"><label>{label}</label>{children}{hint && <small>{hint}</small>}</div>;
}

/** O que o cliente pode fazer num caso: informar pagamento recebido direto e orientar a equipe. Cada ação vira evento + tarefa para a mesa. */
export function AcoesPortal({ caso, hoje, aberto }: { caso: Caso; hoje: string; aberto: boolean }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const H = <input type="hidden" name="caso_id" value={caso.id} />;
  const acoes: Acao[] = [];
  if (aberto && caso.fase !== "confirma") {
    acoes.push({
      k: "pagamento", titulo: "Informar pagamento recebido", sub: "O devedor pagou direto a você (na secretaria, por Pix, em conta). A cobrança para na hora e a equipe confere e encerra.",
      form: (
        <form action={informarPagamento} className="act-form">{H}
          <div className="frow">
            <Campo label="Valor recebido"><div className="inp"><span>R$</span><input name="valor" inputMode="decimal" placeholder={caso.valor_atualizado ? String(caso.valor_atualizado).replace(".", ",") : "0,00"} /></div></Campo>
            <Campo label="Data"><div className="inp"><input type="date" name="data" defaultValue={hoje} max={hoje} /></div></Campo>
          </div>
          <div className="frow">
            <Campo label="Forma"><div className="inp"><select name="forma" defaultValue="Pix"><option>Pix</option><option>Boleto</option><option>Dinheiro</option><option>Cartão</option><option>Transferência</option><option>Outra</option></select></div></Campo>
            <Campo label="Alcance"><div className="inp"><select name="alcance" defaultValue="integral"><option value="integral">Quitou a dívida</option><option value="parcial">Pagamento parcial</option></select></div></Campo>
          </div>
          <Campo label="Observação" hint="Opcional. Ex.: pagou na secretaria, comprovante em anexo no e-mail."><textarea name="obs" style={{ minHeight: 48 }} /></Campo>
          <div className="actions"><button className="btn sm" type="submit">Informar pagamento</button></div>
        </form>
      ),
    });
  }
  if (aberto && caso.fase === "confirma") {
    acoes.push({
      k: "conf", titulo: "Pagamento em conferência", sub: "A equipe está conferindo o pagamento informado. Se foi engano, avise abaixo em \"Orientar a equipe\".",
      form: <div className="act-form"><p className="meta" style={{ margin: 0 }}>Prazo interno de conferência: 1 dia útil. O caso é encerrado quando o pagamento aparece no extrato; se não aparecer, a equipe pede o comprovante e retoma a cobrança.</p></div>,
    });
  }
  acoes.push({
    k: "orientar", titulo: "Orientar a equipe", sub: caso.exc_tipo === "aguardando" ? "A equipe está esperando sua orientação para continuar." : "Pedir para suspender, liberar a cobrança, corrigir um dado ou tirar uma dúvida. Vira tarefa para o responsável no dia seguinte.",
    form: (
      <form action={enviarOrientacao} className="act-form">{H}
        <Campo label="Tipo"><div className="inp"><select name="pedido" defaultValue={caso.exc_tipo === "aguardando" ? "orientar" : "duvida"}>
          <option value="orientar">Orientação sobre como proceder</option>
          <option value="pausar">Suspender a cobrança deste devedor</option>
          <option value="retomar">Liberar / retomar a cobrança</option>
          <option value="duvida">Pergunta ou correção de dado</option>
        </select></div></Campo>
        <Campo label="Mensagem"><textarea name="texto" required minLength={3} placeholder="Ex.: a família renegociou direto com a escola; suspender até 30/11." /></Campo>
        <div className="actions"><button className="btn sm" type="submit">Enviar à equipe</button></div>
      </form>
    ),
  });
  return (
    <div className="acts">
      {acoes.map((a) => (
        <div key={a.k}>
          <button type="button" className="act" aria-expanded={aberta === a.k} onClick={() => setAberta(aberta === a.k ? null : a.k)}>
            <div><b>{a.titulo}</b><span>{a.sub}</span></div><i>{aberta === a.k ? "−" : "+"}</i>
          </button>
          {aberta === a.k && a.form}
        </div>
      ))}
    </div>
  );
}
