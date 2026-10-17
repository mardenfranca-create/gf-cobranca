/** Métricas do painel do admin. Funções puras sobre casos, eventos e cobranças já carregados. */
import { addDias, diffDias } from "./datas";
import { isAberto, type Caso, type Cobranca, type Evento } from "./types";

export type EventoComAutor = Evento & { autor_id?: string | null };

export const mesDe = (iso: string | null | undefined) => (iso ?? "").slice(0, 7);
export const rotuloMes = (ym: string) => {
  const [y, m] = ym.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(m) - 1] ?? m}/${y.slice(2)}`;
};
export const nomeMes = (ym: string) => {
  const [y, m] = ym.split("-");
  const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${nomes[Number(m) - 1] ?? m} de ${y}`;
};

/** Os N meses até `hoje` (inclusive), em AAAA-MM, do mais antigo ao atual. */
export function ultimosMeses(hoje: string, n: number): string[] {
  const [y, m] = hoje.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

const valor = (c: Caso) => c.valor_atualizado ?? c.valor_original ?? 0;
const pagoNoMes = (c: Caso, ym: string) => c.fase === "pago" && mesDe(c.encerrado_em) === ym;
const asaasPaga = (b: Cobranca) => ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(b.status) && !!b.pago_em;

export type MesRecuperado = { mes: string; casos: number; valor: number; asaas: number; novos: number; devolvidos: number };

/** Recuperado por mês: casos encerrados como pagos (valor do caso) e, separado, o que entrou pelo Asaas. */
export function recuperadoPorMes(casos: Caso[], cobrancas: Cobranca[], hoje: string, meses = 12): MesRecuperado[] {
  return ultimosMeses(hoje, meses).map((mes) => {
    const pagos = casos.filter((c) => pagoNoMes(c, mes));
    return {
      mes,
      casos: pagos.length,
      valor: pagos.reduce((s, c) => s + valor(c), 0),
      asaas: cobrancas.filter((b) => asaasPaga(b) && mesDe(b.pago_em) === mes).reduce((s, b) => s + (b.valor_pago ?? b.valor), 0),
      novos: casos.filter((c) => mesDe(c.entrada_em) === mes).length,
      devolvidos: casos.filter((c) => c.fase === "devolvido" && mesDe(c.encerrado_em) === mes).length,
    };
  });
}

export type LinhaCliente = {
  cliente_id: string;
  abertos: number;
  saldo: number;
  recuperadoMes: number;
  recuperado12m: number;
  pagos12m: number;
  encerrados12m: number;
  taxaRecuperacao: number | null; // pagos ÷ encerrados (12 meses)
  parados: number;
};

export function porCliente(casos: Caso[], hoje: string): LinhaCliente[] {
  const mes = mesDe(hoje);
  const inicio12 = ultimosMeses(hoje, 12)[0];
  const ids = [...new Set(casos.map((c) => c.cliente_id))].sort();
  return ids.map((cliente_id) => {
    const meus = casos.filter((c) => c.cliente_id === cliente_id);
    const abertos = meus.filter(isAberto);
    const encerrados12 = meus.filter((c) => !isAberto(c) && mesDe(c.encerrado_em) >= inicio12);
    const pagos12 = encerrados12.filter((c) => c.fase === "pago");
    return {
      cliente_id,
      abertos: abertos.length,
      saldo: abertos.reduce((s, c) => s + valor(c), 0),
      recuperadoMes: meus.filter((c) => pagoNoMes(c, mes)).reduce((s, c) => s + valor(c), 0),
      recuperado12m: pagos12.reduce((s, c) => s + valor(c), 0),
      pagos12m: pagos12.length,
      encerrados12m: encerrados12.length,
      taxaRecuperacao: encerrados12.length ? pagos12.length / encerrados12.length : null,
      parados: carteiraParada(abertos, hoje).length,
    };
  });
}

/**
 * Taxa de acordo: entre os casos que tiveram contato humano registrado (saíram da régua automática),
 * quantos chegaram a um acordo (evento tipo "acordo" de fechamento, fase acordo, ou pago depois de acordo).
 */
export function taxaAcordo(casos: Caso[], eventos: EventoComAutor[]): { trabalhados: number; comAcordo: number; taxa: number | null; quebrados: number } {
  const contato = new Set(eventos.filter((e) => e.tipo === "contato" || e.tipo === "proposta").map((e) => e.caso_id));
  const acordo = new Set(eventos.filter((e) => e.tipo === "acordo" && !/quebrado/i.test(e.texto)).map((e) => e.caso_id));
  for (const c of casos) if (c.fase === "acordo" || (c.fase === "pago" && c.acordo)) acordo.add(c.id);
  const trabalhados = new Set([...contato, ...acordo]);
  const quebrados = new Set(eventos.filter((e) => e.tipo === "acordo" && /quebrado/i.test(e.texto)).map((e) => e.caso_id)).size;
  return { trabalhados: trabalhados.size, comAcordo: acordo.size, taxa: trabalhados.size ? acordo.size / trabalhados.size : null, quebrados };
}

/** Dias entre a entrada do caso e o pagamento, para os casos pagos nos últimos 12 meses. */
export function tempoAtePagamento(casos: Caso[], hoje: string): { n: number; media: number | null; mediana: number | null } {
  const inicio12 = ultimosMeses(hoje, 12)[0];
  const dias = casos
    .filter((c) => c.fase === "pago" && c.encerrado_em && mesDe(c.encerrado_em) >= inicio12)
    .map((c) => Math.max(0, diffDias(c.encerrado_em!.slice(0, 10), c.entrada_em)))
    .sort((a, b) => a - b);
  if (!dias.length) return { n: 0, media: null, mediana: null };
  const media = Math.round(dias.reduce((s, d) => s + d, 0) / dias.length);
  const mediana = dias.length % 2 ? dias[(dias.length - 1) / 2] : Math.round((dias[dias.length / 2 - 1] + dias[dias.length / 2]) / 2);
  return { n: dias.length, media, mediana };
}

/** Casos abertos sem nenhuma movimentação há mais de `dias` (padrão 60). Exceções contam: parado é parado. */
export function carteiraParada(casos: Caso[], hoje: string, dias = 60): (Caso & { paradoHa: number })[] {
  const limite = addDias(hoje, -dias);
  return casos
    .filter((c) => isAberto(c) && c.ultima_mov_em.slice(0, 10) < limite)
    .map((c) => ({ ...c, paradoHa: diffDias(hoje, c.ultima_mov_em.slice(0, 10)) }))
    .sort((a, b) => b.paradoHa - a.paradoHa);
}

export type LinhaOperadora = {
  nome: string;
  casos: number;          // casos abertos sob responsabilidade
  atrasados: number;      // tarefas com próxima data antes de hoje
  contatos30: number;     // eventos de contato nos últimos 30 dias
  propostas30: number;
  acordos30: number;
  movimentos30: number;   // qualquer evento registrado por ela
  pagosMes: number;       // casos sob sua responsabilidade encerrados como pagos no mês
  recuperadoMes: number;
};

/** Produtividade por pessoa: o que cada uma registrou nos últimos 30 dias e o que carrega hoje. */
export function produtividade(casos: Caso[], eventos: EventoComAutor[], hoje: string): LinhaOperadora[] {
  const desde = addDias(hoje, -30);
  const mes = mesDe(hoje);
  const recentes = eventos.filter((e) => e.data.slice(0, 10) >= desde && e.tipo !== "sistema" && e.tipo !== "importacao" && e.tipo !== "cliente" && e.tipo !== "asaas");
  const nomes = new Set<string>();
  for (const c of casos) if (isAberto(c) && c.responsavel) nomes.add(c.responsavel);
  for (const e of recentes) nomes.add(e.autor);
  return [...nomes]
    .sort()
    .map((nome) => {
      const meus = casos.filter((c) => c.responsavel === nome);
      const abertos = meus.filter(isAberto);
      const ev = recentes.filter((e) => e.autor === nome);
      const pagos = meus.filter((c) => pagoNoMes(c, mes));
      return {
        nome,
        casos: abertos.length,
        atrasados: abertos.filter((c) => c.proxima_data && c.proxima_data < hoje).length,
        contatos30: ev.filter((e) => e.tipo === "contato").length,
        propostas30: ev.filter((e) => e.tipo === "proposta").length,
        acordos30: ev.filter((e) => e.tipo === "acordo" && !/quebrado/i.test(e.texto)).length,
        movimentos30: ev.length,
        pagosMes: pagos.length,
        recuperadoMes: pagos.reduce((s, c) => s + valor(c), 0),
      };
    })
    .filter((l) => l.casos || l.movimentos30 || l.pagosMes);
}
