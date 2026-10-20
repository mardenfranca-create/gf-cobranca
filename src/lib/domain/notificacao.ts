/** Notificação extrajudicial: minuta gerada a partir do caso. Puro. O advogado edita antes de aprovar. */
import { brl, fmtData } from "./datas";
import type { Caso, Cliente, Parcela } from "./types";

export type Notificacao = {
  id: string;
  caso_id: string;
  status: "minuta" | "aprovada" | "enviada" | "cancelada";
  titulo: string;
  corpo: string;
  prazo_dias: number;
  advogado: string | null;
  oab: string | null;
  revisor: string | null;
  gerada_por: string;
  aprovada_por: string | null;
  aprovada_em: string | null;
  enviada_por: string | null;
  enviada_em: string | null;
  canal: string | null;
  rastreio: string | null;
  token: string;
  criado_em: string;
  atualizado_em: string;
};

export const NOTIFICACAO_STATUS: Record<Notificacao["status"], { label: string; cls: string }> = {
  minuta: { label: "Para revisar", cls: "ph-confirma" }, aprovada: { label: "Aprovada", cls: "ph-acordo" }, enviada: { label: "Enviada", cls: "ph-pago" }, cancelada: { label: "Cancelada", cls: "ph-devolvido" },
};
export const CANAIS: Record<string, string> = { whatsapp: "WhatsApp (pelo sistema)", email: "E-mail", correio: "Correio com AR", pessoalmente: "Entregue pessoalmente", outro: "Outro" };

const dataExtenso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${d} de ${meses[m - 1]} de ${y}`;
};
const tipoDoc = (doc: string | null) => { const d = (doc ?? "").replace(/\D/g, ""); return d.length === 14 ? "CNPJ" : d.length === 11 ? "CPF" : null; };

/** Gera título e corpo. Parágrafos separados por linha em branco; [colchetes] marcam o que o advogado deve completar. */
export function minutaNotificacao(p: { caso: Caso; cliente: Cliente; parcelas: Parcela[]; prazoDias: number; hoje: string; cidade?: string }): { titulo: string; corpo: string } {
  const { caso, cliente, parcelas, prazoDias, hoje } = p;
  const valor = caso.valor_atualizado ?? caso.valor_original;
  const abertas = parcelas.filter((x) => !x.paga);
  const doc = tipoDoc(caso.documento);
  const pessoaJuridica = doc === "CNPJ";
  const tratamento = pessoaJuridica ? "V.Sas." : "V.Sa.";
  const titulo = `Notificação extrajudicial · ${caso.devedor} · ${cliente.nome_curto}`;

  const linhas: string[] = [];
  linhas.push(`NOTIFICAÇÃO EXTRAJUDICIAL`);
  linhas.push(`${p.cidade ?? "Goiânia/GO"}, ${dataExtenso(hoje)}.`);
  linhas.push(`A ${pessoaJuridica ? "" : "o(a) Sr.(a) "}${caso.devedor}${doc ? `, ${doc} ${caso.documento}` : ""}.`);
  linhas.push(`Ref.: ${caso.referencia}${caso.detalhe ? ` (${caso.detalhe})` : ""}. Credor: ${cliente.nome}.`);
  linhas.push(`GONTIJO FREITAS ADVOGADOS, na qualidade de procurador de ${cliente.nome}, vem, por meio desta, NOTIFICAR ${tratamento} da existência de débito em aberto${valor != null ? ` no valor de ${brl(valor)}` : ""}, referente a ${caso.referencia}${abertas.length ? ", conforme discriminado abaixo" : ""}.`);
  if (abertas.length) {
    linhas.push(abertas.slice(0, 30).map((x) => `• ${x.referencia}${x.competencia ? ` (${x.competencia})` : ""}: ${brl(x.valor)}, vencida em ${fmtData(x.vencimento)}.`).join("\n") + (abertas.length > 30 ? `\n• … e mais ${abertas.length - 30} parcelas.` : ""));
  }
  linhas.push(`Apesar das tentativas de contato anteriores, o débito permanece sem pagamento. Fica${pessoaJuridica ? "m" : ""} ${tratamento} notificad${pessoaJuridica ? "os" : "o(a)"} a efetuar o pagamento integral, ou a procurar este escritório para negociação, no prazo de ${prazoDias} (${porExtenso(prazoDias)}) dias corridos, contados do recebimento desta.`);
  linhas.push(`O pagamento e a negociação podem ser tratados diretamente com a equipe de recuperação de crédito do escritório, respondendo a esta mensagem ou pelos canais indicados ao final. Há possibilidade de parcelamento e de condições especiais para quitação à vista, mediante análise.`);
  linhas.push(`Decorrido o prazo sem regularização, o credor poderá adotar as medidas legais cabíveis, entre elas o protesto do título, a inclusão do débito nos cadastros de proteção ao crédito e a cobrança judicial, com os acréscimos legais e contratuais de correção monetária, juros, custas e honorários advocatícios.`);
  linhas.push(`Caso o pagamento já tenha sido efetuado, pedimos a gentileza de desconsiderar esta notificação e de nos encaminhar o comprovante, para a devida baixa.`);
  linhas.push(`Esta notificação tem caráter extrajudicial e visa à solução amigável do débito, nos termos da legislação civil e, quando aplicável, do Código de Defesa do Consumidor.`);
  linhas.push(`Atenciosamente,`);
  linhas.push(`[ADVOGADO(A)]\nOAB/[UF] [número]\nGontijo Freitas Advogados, em nome de ${cliente.nome}`);
  return { titulo, corpo: linhas.join("\n\n") };
}

function porExtenso(n: number): string {
  const u = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove", "vinte"];
  if (n <= 20) return u[n];
  if (n === 30) return "trinta";
  if (n < 30) return `vinte e ${u[n - 20]}`;
  return String(n);
}

/** Substitui a assinatura em colchetes pelos dados do advogado, se informados. */
export function aplicaAssinatura(corpo: string, advogado: string | null, oab: string | null): string {
  let c = corpo;
  if (advogado) c = c.replace("[ADVOGADO(A)]", advogado);
  if (oab) c = c.replace("OAB/[UF] [número]", /^OAB/i.test(oab) ? oab : `OAB ${oab}`);
  return c;
}

/** Parágrafos do corpo (linha em branco separa). */
export const paragrafos = (corpo: string) => corpo.replace(/\r\n/g, "\n").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

/** Modelo da Meta para enviar a notificação em PDF (cabeçalho de documento). Cadastrar com este nome e corpo, categoria Utilidade, pt_BR. */
export const TEMPLATE_NOTIFICACAO = {
  nome: "gf_notificacao",
  corpo: "Olá, {{1}}. Segue em anexo a notificação extrajudicial enviada pelo Gontijo Freitas Advogados em nome de {{2}}, referente a {{3}}. O prazo para regularização ou contato é de {{4}} dias. Para negociar, é só responder aqui.",
  params: (d: { devedor: string; credor: string; referencia: string; prazo: number }) => [d.devedor.trim().split(/\s+/)[0] || "Olá", d.credor, d.referencia, String(d.prazo)],
};
