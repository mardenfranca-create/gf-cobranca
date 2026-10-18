import type { Mensagem } from "./types";

/** Janela de atendimento da Meta: 24h após a última mensagem do devedor, texto livre é aceito. */
export const JANELA_MS = 24 * 3600 * 1000;

export type Conversa = {
  caso_id: string;
  /** Mais recente primeiro. */
  mensagens: Mensagem[];
  ultima: Mensagem;
  ultimaEntrada: Mensagem | null;
  /** ISO do fim da janela de 24h, ou null se não há janela aberta. */
  janelaAte: string | null;
  /** A última mensagem é do devedor: alguém da mesa precisa responder. */
  aguardando: boolean;
  falhas: number;
};

const t = (m: Pick<Mensagem, "criado_em">) => new Date(m.criado_em).getTime();

/** Agrupa mensagens por caso e ordena: aguardando resposta, depois janela aberta, depois as demais (mais recente primeiro). */
export function agrupaConversas(mensagens: Mensagem[], agora: Date = new Date()): Conversa[] {
  const porCaso = new Map<string, Mensagem[]>();
  for (const m of mensagens) {
    const lista = porCaso.get(m.caso_id);
    if (lista) lista.push(m); else porCaso.set(m.caso_id, [m]);
  }
  const out: Conversa[] = [];
  for (const [caso_id, ms] of porCaso) {
    ms.sort((a, b) => t(b) - t(a));
    const ultima = ms[0];
    const ultimaEntrada = ms.find((m) => m.direcao === "entrada") ?? null;
    const fim = ultimaEntrada ? t(ultimaEntrada) + JANELA_MS : 0;
    out.push({
      caso_id, mensagens: ms, ultima, ultimaEntrada,
      janelaAte: fim > agora.getTime() ? new Date(fim).toISOString() : null,
      aguardando: ultima.direcao === "entrada",
      falhas: ms.filter((m) => m.status === "failed").length,
    });
  }
  const peso = (c: Conversa) => (c.aguardando ? 0 : c.janelaAte ? 1 : 2);
  out.sort((a, b) => peso(a) - peso(b) || t(b.ultima) - t(a.ultima));
  return out;
}

/** Primeira linha do texto, encurtada para a lista. */
export function resumo(texto: string, max = 110): string {
  const linha = texto.replace(/\s+/g, " ").trim();
  return linha.length > max ? `${linha.slice(0, max - 1)}…` : linha;
}

/** Tempo restante da janela em texto curto ("3h", "25min"). */
export function restanteJanela(janelaAte: string, agora: Date = new Date()): string {
  const min = Math.max(0, Math.round((new Date(janelaAte).getTime() - agora.getTime()) / 60000));
  if (min >= 90) return `${Math.round(min / 60)}h`;
  return `${min}min`;
}

/** "5562984077891" → "(62) 98407-7891". Fora do padrão BR, devolve como veio. */
export function formataCelular(e164: string): string {
  const d = e164.replace(/\D/g, "");
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
