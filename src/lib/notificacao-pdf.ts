import "server-only";
import { Pdf, type RGB } from "@/lib/pdf";
import { fmtDataHora } from "@/lib/domain/datas";
import { aplicaAssinatura, paragrafos, type Notificacao } from "@/lib/domain/notificacao";
import { rodapeEscritorio } from "@/lib/relatorio-pdf";

const INK: RGB = [10, 10, 10];
const INK60: RGB = [92, 88, 82];
const INK40: RGB = [138, 133, 124];
const LINHA: RGB = [228, 221, 209];
const BRONZE: RGB = [176, 141, 87];
const M = 56;

/** PDF timbrado da notificação: cabeçalho do escritório, texto em parágrafos justificados à esquerda, assinatura, rodapé com página. */
export function gerarNotificacaoPdf(n: Notificacao): Buffer {
  const pdf = new Pdf({ titulo: n.titulo });
  const W = pdf.largura - 2 * M;
  let y = 0;
  const timbrado = () => {
    pdf.texto(M, 48, "GONTIJO FREITAS", { fonte: "F4", tamanho: 17, cor: INK });
    pdf.texto(M, 60, "A D V O G A D O S", { fonte: "F1", tamanho: 7.5, cor: INK60 });
    pdf.texto(pdf.largura - M, 48, "Recuperação de crédito", { tamanho: 8, cor: INK60, alinhar: "dir" });
    pdf.texto(pdf.largura - M, 60, "Notificação extrajudicial", { tamanho: 8, cor: INK60, alinhar: "dir" });
    pdf.linha(M, 72, pdf.largura - M, 72, { cor: BRONZE, espessura: 1.2 });
    y = 100;
  };
  const precisa = (h: number) => { if (y + h > pdf.altura - 80) { pdf.novaPagina(); timbrado(); } };
  timbrado();
  const corpo = aplicaAssinatura(n.corpo, n.advogado, n.oab);
  const pars = paragrafos(corpo);
  pars.forEach((p, i) => {
    const titulo = i === 0 && /^NOTIFICAÇÃO/i.test(p);
    const assinatura = i >= pars.length - 2 && (i === pars.length - 1 || /^Atenciosamente/i.test(p));
    const lista = p.startsWith("•");
    const tamanho = titulo ? 14 : 10.5;
    const fonte = titulo ? "F4" : assinatura && i === pars.length - 1 ? "F2" : "F1";
    const linhas = p.split("\n");
    const altura = linhas.reduce((s, l) => s + Math.max(1, Math.ceil(l.length / 95)) * (tamanho * 1.45), 0) + 8;
    precisa(altura);
    if (titulo) { pdf.texto(pdf.largura / 2, y, p, { fonte, tamanho, cor: INK, alinhar: "centro" }); y += 26; return; }
    for (const l of linhas) {
      const usado = pdf.paragrafo(lista ? M + 10 : M, y, l, lista ? W - 10 : W, { tamanho, fonte, cor: INK, entrelinha: tamanho * 1.45 });
      y += usado;
    }
    y += 9;
  });
  const total = pdf.numeroPagina;
  for (let k = 1; k <= total; k++) pdf.emPagina(k, () => {
    const yy = pdf.altura - 40;
    pdf.linha(M, yy - 12, pdf.largura - M, yy - 12, { cor: LINHA });
    pdf.texto(M, yy, rodapeEscritorio(), { tamanho: 7.5, cor: INK40, maxLargura: W - 140 });
    pdf.texto(pdf.largura - M, yy, `página ${k} de ${total}`, { tamanho: 7.5, cor: INK40, alinhar: "dir" });
    pdf.texto(M, yy + 10, `Documento gerado pelo sistema em ${fmtDataHora(n.enviada_em ?? n.aprovada_em ?? n.atualizado_em)}${n.enviada_por ? ` · enviado por ${n.enviada_por}` : ""}.`, { tamanho: 7, cor: INK40, maxLargura: W });
  });
  return pdf.bytes();
}
