import "server-only";
import { Pdf, type RGB } from "@/lib/pdf";
import { brl, fmtData, fmtDataHora } from "@/lib/domain/datas";
import { nomeMes } from "@/lib/domain/painel";
import type { DadosRelatorio } from "@/lib/domain/relatorio";
import { EXCECOES, FASES, type Caso, type Cliente } from "@/lib/domain/types";

const INK: RGB = [10, 10, 10];
const INK60: RGB = [92, 88, 82];
const INK40: RGB = [138, 133, 124];
const LINHA: RGB = [228, 221, 209];
const FUNDO: RGB = [247, 243, 236];
const BRONZE: RGB = [176, 141, 87];
const BAD: RGB = [122, 46, 46];

const M = 48; // margem
const RODAPE_PADRAO = "Gontijo Freitas Advogados · Recuperação de crédito · Goiânia/GO · São Paulo/SP";

/** Timbrado: nome e endereço do escritório podem ser ajustados pela variável RELATORIO_RODAPE (uma linha). */
export function rodapeEscritorio() {
  return process.env.RELATORIO_RODAPE?.trim() || RODAPE_PADRAO;
}

type Col = { titulo: string; w: number; alinhar?: "esq" | "dir"; texto: (c: Caso) => string; cor?: (c: Caso) => RGB | undefined };

export function gerarRelatorioPdf(d: DadosRelatorio, cliente: Cliente, geradoPor: string, devedores: Record<string, string> = {}): Buffer {
  const pdf = new Pdf({ titulo: `Relatório mensal · ${cliente.nome} · ${nomeMes(d.mes)}` });
  const W = pdf.largura - 2 * M;
  let y = 0;
  const geradoEm = fmtDataHora(new Date().toISOString());

  const timbrado = () => {
    pdf.texto(M, 46, "GONTIJO FREITAS", { fonte: "F4", tamanho: 17, cor: INK });
    pdf.texto(M, 58, "A D V O G A D O S", { fonte: "F1", tamanho: 7.5, cor: INK60 });
    pdf.texto(pdf.largura - M, 44, "Recuperação de crédito", { tamanho: 8, cor: INK60, alinhar: "dir" });
    pdf.texto(pdf.largura - M, 56, "Relatório mensal ao cliente", { tamanho: 8, cor: INK60, alinhar: "dir" });
    pdf.linha(M, 68, pdf.largura - M, 68, { cor: BRONZE, espessura: 1.2 });
    y = 92;
  };
  const rodape = (n: number, total: number) => {
    pdf.emPagina(n, () => {
      const yy = pdf.altura - 36;
      pdf.linha(M, yy - 12, pdf.largura - M, yy - 12, { cor: LINHA, espessura: 0.5 });
      pdf.texto(M, yy, rodapeEscritorio(), { tamanho: 7.5, cor: INK40, maxLargura: W - 140 });
      pdf.texto(pdf.largura - M, yy, `página ${n} de ${total}`, { tamanho: 7.5, cor: INK40, alinhar: "dir" });
      pdf.texto(M, yy + 10, `Gerado pelo sistema em ${geradoEm} por ${geradoPor}. Documento informativo; os valores refletem os registros da equipe e do Asaas até a geração.`, { tamanho: 7, cor: INK40, maxLargura: W });
    });
  };
  const precisa = (h: number) => {
    if (y + h > pdf.altura - 70) { pdf.novaPagina(); timbrado(); }
  };
  const secao = (titulo: string, sub?: string) => {
    precisa(60);
    y += 10;
    pdf.texto(M, y, titulo, { fonte: "F2", tamanho: 11.5, cor: INK });
    if (sub) pdf.texto(pdf.largura - M, y, sub, { tamanho: 8.5, cor: INK60, alinhar: "dir", maxLargura: W / 2 });
    y += 6;
    pdf.linha(M, y, pdf.largura - M, y, { cor: LINHA });
    y += 14;
  };
  const tabela = (cols: Col[], linhas: Caso[], vazio: string) => {
    if (!linhas.length) { precisa(20); pdf.texto(M, y, vazio, { tamanho: 9, cor: INK60, fonte: "F3" }); y += 18; return; }
    const cab = () => {
      let x = M;
      for (const c of cols) { pdf.texto(c.alinhar === "dir" ? x + c.w : x, y, c.titulo.toUpperCase(), { tamanho: 7, cor: INK60, fonte: "F2", alinhar: c.alinhar === "dir" ? "dir" : "esq" }); x += c.w; }
      y += 5; pdf.linha(M, y, pdf.largura - M, y, { cor: LINHA }); y += 12;
    };
    cab();
    for (const l of linhas) {
      if (y + 16 > pdf.altura - 70) { pdf.novaPagina(); timbrado(); cab(); }
      let x = M;
      for (const c of cols) {
        pdf.texto(c.alinhar === "dir" ? x + c.w : x, y, c.texto(l), { tamanho: 8.5, cor: c.cor?.(l) ?? INK, alinhar: c.alinhar === "dir" ? "dir" : "esq", maxLargura: c.w - 6 });
        x += c.w;
      }
      y += 8; pdf.linha(M, y, pdf.largura - M, y, { cor: LINHA, espessura: 0.3 }); y += 10;
    }
  };
  const vlr = (c: Caso) => (c.valor_atualizado ?? c.valor_original) == null ? "sem valor" : brl((c.valor_atualizado ?? c.valor_original)!);

  // ---------- capa da página 1 ----------
  timbrado();
  pdf.texto(M, y, cliente.nome.toUpperCase(), { tamanho: 8, cor: BRONZE, fonte: "F2" });
  y += 20;
  pdf.texto(M, y, `Relatório de recuperação de crédito`, { fonte: "F4", tamanho: 22, cor: INK });
  y += 18;
  pdf.texto(M, y, `${nomeMes(d.mes)[0].toUpperCase()}${nomeMes(d.mes).slice(1)} · período de ${fmtData(d.inicio)} a ${fmtData(d.fim)}`, { tamanho: 10, cor: INK60 });
  y += 26;

  // KPIs
  const kpis = [
    { l: "Recuperado no mês", v: brl(d.recuperado.valor, false), f: `${d.recuperado.casos} ${d.recuperado.casos === 1 ? "caso pago" : "casos pagos"}` },
    { l: "Carteira em cobrança", v: brl(d.carteira.saldo, false), f: `${d.carteira.abertos} ${d.carteira.abertos === 1 ? "caso aberto" : "casos abertos"}${d.carteira.semValor ? ` · ${d.carteira.semValor} sem valor` : ""}` },
    { l: "Novos casos no mês", v: String(d.novos.casos), f: d.novos.casos ? brl(d.novos.valor, false) : "nenhuma entrada" },
    { l: "Acordos", v: String(d.acordos.fechados), f: `${d.acordos.emPagamento} em pagamento · ${d.acordos.quebrados} ${d.acordos.quebrados === 1 ? "quebrado" : "quebrados"}` },
  ];
  const kw = W / 4;
  pdf.retangulo(M, y, W, 66, { preenche: FUNDO, borda: LINHA });
  kpis.forEach((k, i) => {
    const x = M + i * kw + 14;
    if (i) pdf.linha(M + i * kw, y, M + i * kw, y + 66, { cor: LINHA });
    pdf.texto(x, y + 18, k.l, { tamanho: 8, cor: INK60 });
    pdf.texto(x, y + 40, k.v, { fonte: "F4", tamanho: 17, cor: INK, maxLargura: kw - 24 });
    pdf.texto(x, y + 55, k.f, { tamanho: 7, cor: INK60, maxLargura: kw - 24 });
  });
  y += 84;

  // resumo em texto
  const frases: string[] = [];
  frases.push(`No período, ${d.recuperado.casos ? `${d.recuperado.casos} ${d.recuperado.casos === 1 ? "caso foi encerrado" : "casos foram encerrados"} como pago, somando ${brl(d.recuperado.valor)}` : "nenhum caso foi encerrado como pago"}${d.recuperado.asaasQtd ? `, dos quais ${brl(d.recuperado.asaas)} entraram por boleto ou Pix emitidos pelo escritório (${d.recuperado.asaasQtd} ${d.recuperado.asaasQtd === 1 ? "pagamento" : "pagamentos"})` : ""}.`);
  if (d.tempoMedioPagamento != null) frases.push(`Os casos pagos levaram, em média, ${d.tempoMedioPagamento} dias da entrada em cobrança até o pagamento.`);
  if (d.devolvidos) frases.push(`${d.devolvidos} ${d.devolvidos === 1 ? "caso foi devolvido" : "casos foram devolvidos"} à sua empresa por esgotamento das vias de cobrança ou por orientação sua.`);
  frases.push(`A carteira fechou o período com ${d.carteira.abertos} ${d.carteira.abertos === 1 ? "caso" : "casos"} em cobrança, ${brl(d.carteira.saldo)} em saldo conhecido.`);
  if (d.aguardando.length) frases.push(`${d.aguardando.length} ${d.aguardando.length === 1 ? "caso depende" : "casos dependem"} de uma resposta sua (orientação ou confirmação de pagamento) e estão listados adiante.`);
  y += pdf.paragrafo(M, y, frases.join(" "), W, { tamanho: 9.5, cor: INK, entrelinha: 14 });
  y += 8;

  // ---------- onde está a carteira ----------
  secao("Onde está a carteira", "casos abertos ao fim do período, por etapa");
  if (!d.porFase.length) { pdf.texto(M, y, "Nenhum caso em aberto.", { tamanho: 9, cor: INK60, fonte: "F3" }); y += 18; }
  const maxN = Math.max(1, ...d.porFase.map((f) => f.n));
  for (const f of d.porFase) {
    precisa(18);
    pdf.texto(M, y, FASES[f.fase].label, { tamanho: 9, cor: INK, maxLargura: 170 });
    pdf.texto(M + 220, y, String(f.n), { tamanho: 9, cor: INK, alinhar: "dir", fonte: "F2" });
    pdf.texto(pdf.largura - M, y, f.valor ? brl(f.valor) : "sem valor", { tamanho: 9, cor: INK60, alinhar: "dir" });
    pdf.retangulo(M + 232, y - 7, 150, 7, { preenche: FUNDO });
    pdf.retangulo(M + 232, y - 7, Math.max(2, (150 * f.n) / maxN), 7, { preenche: BRONZE });
    y += 17;
  }
  y += 4;

  // ---------- pagos ----------
  secao("Casos encerrados como pagos", `${d.pagos.length} no período`);
  tabela([
    { titulo: "Devedor", w: 165, texto: (c) => c.devedor },
    { titulo: "Referência", w: 130, texto: (c) => c.referencia },
    { titulo: "Entrada", w: 58, texto: (c) => fmtData(c.entrada_em) },
    { titulo: "Pago em", w: 58, texto: (c) => fmtData(c.encerrado_em?.slice(0, 10)) },
    { titulo: "Valor", w: W - 411, alinhar: "dir", texto: vlr },
  ], d.pagos, "Nenhum caso encerrado como pago neste período.");

  // ---------- novos ----------
  secao("Novos casos em cobrança", `${d.entradas.length} no período`);
  tabela([
    { titulo: "Devedor", w: 160, texto: (c) => c.devedor },
    { titulo: "Referência", w: 125, texto: (c) => c.referencia },
    { titulo: "Entrada", w: 58, texto: (c) => fmtData(c.entrada_em) },
    { titulo: "Etapa hoje", w: W - 343 - 80, texto: (c) => FASES[c.fase].label },
    { titulo: "Valor", w: 80, alinhar: "dir", texto: vlr },
  ], d.entradas, "Nenhum caso novo entrou neste período.");

  // ---------- depende do cliente ----------
  secao("Depende de você", "pausados até sua orientação ou pagamento em conferência");
  tabela([
    { titulo: "Devedor", w: 190, texto: (c) => c.devedor },
    { titulo: "Situação", w: W - 190 - 90, texto: (c) => (c.exc_tipo ? `${EXCECOES[c.exc_tipo]}${c.exc_motivo ? ` · ${c.exc_motivo}` : ""}` : c.fase_nota ?? FASES[c.fase].label), cor: () => BAD },
    { titulo: "Valor", w: 90, alinhar: "dir", texto: vlr },
  ], d.aguardando, "Nada pendente de você. A equipe segue a cobrança normalmente.");

  // ---------- judicial / protesto ----------
  if (d.judicial.length) {
    secao("Protesto e judicial", `${d.judicial.length} ${d.judicial.length === 1 ? "caso" : "casos"}`);
    tabela([
      { titulo: "Devedor", w: 190, texto: (c) => c.devedor },
      { titulo: "Etapa", w: 110, texto: (c) => FASES[c.fase].label },
      { titulo: "Processo / situação", w: W - 190 - 110 - 90, texto: (c) => c.processo ?? c.fase_nota ?? "" },
      { titulo: "Valor", w: 90, alinhar: "dir", texto: vlr },
    ], d.judicial, "");
  }

  // ---------- movimentações ----------
  secao("Movimentações do período", `${d.movimentos.length} ${d.movimentos.length === 1 ? "registro" : "registros"} visíveis a você`);
  const devedorPor = new Map<string, string>(Object.entries(devedores));
  for (const c of [...d.pagos, ...d.entradas, ...d.aguardando, ...d.judicial]) devedorPor.set(c.id, c.devedor);
  const movs = d.movimentos.slice(0, 120);
  if (!movs.length) { pdf.texto(M, y, "Sem registros no período.", { tamanho: 9, cor: INK60, fonte: "F3" }); y += 18; }
  for (const e of movs) {
    const texto = `${e.autor}: ${e.texto}`;
    const linhas = Math.min(3, Math.ceil(texto.length / 95));
    precisa(12 * linhas + 8);
    pdf.texto(M, y, fmtDataHora(e.data), { tamanho: 7.5, cor: INK60 });
    const nome = devedorPor.get(e.caso_id);
    const altura = pdf.paragrafo(M + 78, y, `${nome ? `${nome} · ` : ""}${texto}`, W - 78, { tamanho: 8.5, cor: INK, entrelinha: 11.5 });
    y += Math.max(altura, 11.5) + 5;
  }
  if (d.movimentos.length > movs.length) { precisa(16); pdf.texto(M, y, `… e mais ${d.movimentos.length - movs.length} registros, disponíveis no portal.`, { tamanho: 8.5, cor: INK60, fonte: "F3" }); y += 16; }

  // ---------- encerramento ----------
  precisa(60);
  y += 10;
  pdf.linha(M, y, pdf.largura - M, y, { cor: BRONZE, espessura: 1 });
  y += 16;
  y += pdf.paragrafo(M, y, "Dúvidas sobre algum caso, orientação à equipe ou aprovação de propostas podem ser feitas diretamente pelo portal, a qualquer hora. Cada registro fica no histórico do caso com autor e data.", W, { tamanho: 9, cor: INK60, entrelinha: 13 });

  const total = pdf.numeroPagina;
  for (let n = 1; n <= total; n++) rodape(n, total);
  return pdf.bytes();
}
