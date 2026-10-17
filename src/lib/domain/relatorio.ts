/** Relatório mensal do cliente: números e listas de um mês, a partir de casos, eventos e cobranças. Puro. */
import { addDias, diffDias } from "./datas";
import { isAberto, type Caso, type Cobranca, type Evento, type Fase } from "./types";
import { mesDe } from "./painel";

export type DadosRelatorio = {
  mes: string; // AAAA-MM
  inicio: string;
  fim: string; // último dia do mês ou hoje, o que vier antes
  carteira: { abertos: number; saldo: number; semValor: number };
  recuperado: { casos: number; valor: number; asaas: number; asaasQtd: number };
  novos: { casos: number; valor: number };
  acordos: { fechados: number; quebrados: number; emPagamento: number };
  devolvidos: number;
  porFase: { fase: Fase; n: number; valor: number }[];
  pagos: Caso[];
  entradas: Caso[];
  aguardando: Caso[]; // exceções que dependem do cliente
  judicial: Caso[];
  movimentos: Evento[]; // visíveis ao cliente, no mês, mais recentes primeiro
  tempoMedioPagamento: number | null;
};

export function fimDoMes(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function montaRelatorio(mes: string, casos: Caso[], eventos: Evento[], cobrancas: Cobranca[], hoje: string): DadosRelatorio {
  const inicio = `${mes}-01`;
  const fim = fimDoMes(mes) < hoje ? fimDoMes(mes) : hoje;
  const valor = (c: Caso) => c.valor_atualizado ?? c.valor_original ?? 0;
  // Carteira no fechamento: casos abertos hoje + casos encerrados depois do fim do mês (estavam abertos na data).
  const abertosNoFim = casos.filter((c) => c.entrada_em <= fim && (isAberto(c) || (c.encerrado_em ?? "") > fim + "T23:59:59"));
  const pagos = casos.filter((c) => c.fase === "pago" && mesDe(c.encerrado_em) === mes).sort((a, b) => valor(b) - valor(a));
  const entradas = casos.filter((c) => mesDe(c.entrada_em) === mes).sort((a, b) => valor(b) - valor(a));
  const evMes = eventos.filter((e) => mesDe(e.data) === mes);
  const asaasPagas = cobrancas.filter((b) => ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(b.status) && mesDe(b.pago_em) === mes);
  const fases = [...new Set(abertosNoFim.map((c) => c.fase))] as Fase[];
  const porFase = fases
    .map((fase) => ({ fase, n: abertosNoFim.filter((c) => c.fase === fase).length, valor: abertosNoFim.filter((c) => c.fase === fase).reduce((s, c) => s + valor(c), 0) }))
    .sort((a, b) => b.n - a.n);
  const dias = pagos.filter((c) => c.encerrado_em).map((c) => Math.max(0, diffDias(c.encerrado_em!.slice(0, 10), c.entrada_em)));
  return {
    mes,
    inicio,
    fim,
    carteira: { abertos: abertosNoFim.length, saldo: abertosNoFim.reduce((s, c) => s + valor(c), 0), semValor: abertosNoFim.filter((c) => c.valor_atualizado == null && c.valor_original == null).length },
    recuperado: { casos: pagos.length, valor: pagos.reduce((s, c) => s + valor(c), 0), asaas: asaasPagas.reduce((s, b) => s + (b.valor_pago ?? b.valor), 0), asaasQtd: asaasPagas.length },
    novos: { casos: entradas.length, valor: entradas.reduce((s, c) => s + valor(c), 0) },
    acordos: {
      fechados: new Set(evMes.filter((e) => e.tipo === "acordo" && !/quebrado/i.test(e.texto)).map((e) => e.caso_id)).size,
      quebrados: new Set(evMes.filter((e) => e.tipo === "acordo" && /quebrado/i.test(e.texto)).map((e) => e.caso_id)).size,
      emPagamento: abertosNoFim.filter((c) => c.fase === "acordo").length,
    },
    devolvidos: casos.filter((c) => c.fase === "devolvido" && mesDe(c.encerrado_em) === mes).length,
    porFase,
    pagos,
    entradas,
    aguardando: abertosNoFim.filter((c) => c.exc_tipo === "aguardando" || c.fase === "confirma").sort((a, b) => valor(b) - valor(a)),
    judicial: abertosNoFim.filter((c) => c.fase === "judicial" || c.fase === "protesto").sort((a, b) => valor(b) - valor(a)),
    movimentos: evMes.filter((e) => e.visivel_cliente).sort((a, b) => (a.data < b.data ? 1 : -1)),
    tempoMedioPagamento: dias.length ? Math.round(dias.reduce((s, d) => s + d, 0) / dias.length) : null,
  };
}

/** Meses disponíveis para relatório: do mês de entrada do caso mais antigo até o atual (máx. 24). */
export function mesesDisponiveis(casos: Caso[], hoje: string): string[] {
  const atual = mesDe(hoje);
  const primeiro = casos.reduce((min, c) => (mesDe(c.entrada_em) < min ? mesDe(c.entrada_em) : min), atual);
  const out: string[] = [];
  let [y, m] = atual.split("-").map(Number);
  while (out.length < 24) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    out.push(ym);
    if (ym <= primeiro) break;
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

export const diasNoMes = (ym: string) => Number(fimDoMes(ym).slice(8, 10));
export const mesAnterior = (ym: string) => mesDe(addDias(`${ym}-01`, -1));
