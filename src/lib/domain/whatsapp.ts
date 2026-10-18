import { brl, fmtData } from "./datas";

/** Regras puras do WhatsApp: telefone, modelos aprovados na Meta e decisão da régua automática. */

/** Normaliza celular brasileiro para E.164 sem "+": 5562999998888. Devolve null se não parecer celular válido. */
export function normalizaCelular(raw: string | null | undefined): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length === 10 && /^[1-9]{2}[6-9]/.test(d)) d = d.slice(0, 2) + "9" + d.slice(2); // celular antigo sem o 9
  if (d.length !== 11 || !/^[1-9]{2}9\d{8}$/.test(d)) return null;
  return "55" + d;
}

/**
 * Forma canônica de um número para comparar e agrupar: celular brasileiro sempre com o nono dígito
 * (5562984077891). A Meta entrega o `from` de números antigos sem o 9 (556284077891) e o sistema
 * envia com o 9; sem canonizar, a mesma pessoa vira duas conversas. Fora do padrão BR, só os dígitos.
 */
export function canonizaTelefone(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  return normalizaCelular(d) ?? d;
}

/** As grafias que um número pode ter no banco (com e sem o nono dígito), para consultas por igualdade. */
export function variantesTelefone(raw: string | null | undefined): string[] {
  const canon = canonizaTelefone(raw);
  const out = new Set<string>([canon]);
  const m = canon.match(/^55([1-9]{2})9(\d{8})$/);
  if (m) out.add(`55${m[1]}${m[2]}`);
  const d = (raw ?? "").replace(/\D/g, "");
  if (d) out.add(d);
  return [...out];
}

export type DadosMensagem = { devedor: string; credor: string; valor: number | null; referencia: string; data?: string | null; link?: string | null };

export type Template = {
  nome: string;           // nome exato cadastrado na Meta (minúsculas, sem espaço)
  rotulo: string;
  categoria: "UTILITY";
  corpo: string;          // texto com {{n}} como cadastrado na Meta
  params: (d: DadosMensagem) => string[];
};

const primeiroNome = (s: string) => s.trim().split(/\s+/)[0] || "Olá";
const valor = (v: number | null) => (v == null ? "o valor em aberto" : brl(v));

/**
 * Modelos a cadastrar na Meta exatamente com estes nomes e corpos (categoria Utilidade, idioma pt_BR).
 * A ordem dos parâmetros é a ordem dos {{n}} no corpo.
 */
export const TEMPLATES: Record<string, Template> = {
  gf_lembrete_1: {
    nome: "gf_lembrete_1", rotulo: "1º lembrete (amigável)", categoria: "UTILITY",
    corpo: "Olá, {{1}}. Aqui é o Gontijo Freitas Advogados, em nome de {{2}}. Consta em aberto {{3}}, referente a {{4}}. Se já pagou, desconsidere esta mensagem. Para regularizar ou negociar, é só responder aqui. Para não receber mais avisos, responda SAIR.",
    params: (d) => [primeiroNome(d.devedor), d.credor, valor(d.valor), d.referencia],
  },
  gf_lembrete_2: {
    nome: "gf_lembrete_2", rotulo: "2º lembrete (condições)", categoria: "UTILITY",
    corpo: "Olá, {{1}}. Ainda não localizamos o pagamento de {{2}} ({{3}}) devido a {{4}}. Podemos facilitar com desconto ou parcelamento: responda esta mensagem e um atendente do Gontijo Freitas fala com você. Para não receber avisos, responda SAIR.",
    params: (d) => [primeiroNome(d.devedor), valor(d.valor), d.referencia, d.credor],
  },
  gf_boleto: {
    nome: "gf_boleto", rotulo: "Boleto/Pix emitido", categoria: "UTILITY",
    corpo: "Olá, {{1}}. Segue a cobrança de {{2}} referente a {{3}} ({{4}}), com vencimento em {{5}}. Pague por boleto ou Pix pelo link: {{6}}. Dúvidas, responda aqui.",
    params: (d) => [primeiroNome(d.devedor), valor(d.valor), d.referencia, d.credor, fmtData(d.data), d.link ?? ""],
  },
  gf_vencimento: {
    nome: "gf_vencimento", rotulo: "Parcela vence em 3 dias", categoria: "UTILITY",
    corpo: "Olá, {{1}}. Lembrete: a parcela de {{2}} do seu acordo com {{3}} vence em {{4}}. Pague pelo link: {{5}}. Se já pagou, desconsidere.",
    params: (d) => [primeiroNome(d.devedor), valor(d.valor), d.credor, fmtData(d.data), d.link ?? ""],
  },
  gf_acordo_quebrado: {
    nome: "gf_acordo_quebrado", rotulo: "Parcela do acordo vencida", categoria: "UTILITY",
    corpo: "Olá, {{1}}. A parcela de {{2}} do seu acordo com {{3}} venceu em {{4}} e não foi localizada. Regularize pelo link {{5}} ou responda aqui para renegociar antes que o acordo seja cancelado.",
    params: (d) => [primeiroNome(d.devedor), valor(d.valor), d.credor, fmtData(d.data), d.link ?? ""],
  },
};

/** Renderiza o corpo do modelo com os parâmetros, para prévia e histórico. */
export function renderiza(t: Template, d: DadosMensagem): string {
  const p = t.params(d);
  return t.corpo.replace(/\{\{(\d+)\}\}/g, (_, n) => p[Number(n) - 1] ?? "");
}

/** O devedor pediu para parar? */
export const pediuSair = (texto: string) => /^\s*(sair|parar|pare|stop|cancelar|remover)\s*[.!]?\s*$/i.test(texto);

export type CasoRegua = { id: string; fase: string; exc_tipo: string | null; wa_optout: boolean; telefone: string | null; entrada_em: string; ultima_mov_em: string };

/**
 * Régua automática: decide qual lembrete um caso em "regua" deve receber hoje.
 * D+notif1 → gf_lembrete_1; D+notif1+recontato → gf_lembrete_2; depois a mesa assume (fila "cobrança humana").
 * Só envia o que ainda não foi enviado para o caso; atraso de dias não gera envio duplo.
 */
/** Depois de tantas falhas de entrega pela régua, o caso sai da régua automática e vira tarefa para conferir o número. */
export const MAX_FALHAS_REGUA = 2;

/**
 * Vencimentos que o cron de hoje deve lembrar (3 dias antes). O cron só roda em dia útil, então na sexta
 * ele cobre também os vencimentos de terça e quarta, que o sábado e o domingo cobririam se rodassem.
 */
export function datasVencimentoLembrete(hoje: string, addDias: (iso: string, n: number) => string): string[] {
  const diaSemana = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
  let proximoCron = addDias(hoje, 1);
  while (diaSemana(proximoCron) === 0 || diaSemana(proximoCron) === 6) proximoCron = addDias(proximoCron, 1);
  const out: string[] = [];
  for (let d = addDias(hoje, 3); d < addDias(proximoCron, 3); d = addDias(d, 1)) out.push(d);
  return out;
}

export function lembreteDeHoje(caso: CasoRegua, enviados: Set<string>, hoje: string, dias: { notif1: number; recontato: number }, diffDias: (a: string, b: string) => number, falhas = 0): string | null {
  if (caso.fase !== "regua" || caso.exc_tipo || caso.wa_optout || !normalizaCelular(caso.telefone)) return null;
  if (falhas >= MAX_FALHAS_REGUA) return null;
  const idade = diffDias(hoje, caso.entrada_em);
  if (idade >= dias.notif1 && !enviados.has("gf_lembrete_1")) return "gf_lembrete_1";
  if (idade >= dias.notif1 + dias.recontato && enviados.has("gf_lembrete_1") && !enviados.has("gf_lembrete_2")) return "gf_lembrete_2";
  return null;
}

/** Janela de atendimento da Meta: 24h após a última mensagem recebida do devedor. Devolve o fim (ISO) se ainda está aberta; senão null. */
export function janelaAtendimento(mensagens: { direcao: "saida" | "entrada"; criado_em: string }[], agora: Date): string | null {
  const ultima = mensagens.filter((m) => m.direcao === "entrada").map((m) => new Date(m.criado_em).getTime()).sort((a, b) => b - a)[0];
  if (!ultima) return null;
  const ate = ultima + 24 * 3600 * 1000;
  return ate > agora.getTime() ? new Date(ate).toISOString() : null;
}
