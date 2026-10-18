/** Caixa de entrada do WhatsApp: agrupa mensagens em conversas por telefone. Puro. */
import type { Caso, Mensagem } from "./types";
import { canonizaTelefone } from "./whatsapp";

export type CasoResumo = Pick<Caso, "id" | "devedor" | "cliente_id" | "responsavel" | "fase" | "wa_optout" | "telefone">;

export type Conversa = {
  telefone: string;
  caso: CasoResumo | null;      // caso mais recente ligado ao número (null = número sem caso)
  ultima: Mensagem;             // mensagem mais recente
  naoLidas: number;             // recebidas sem lida_em
  aguardando: boolean;          // a última mensagem é do devedor
  janelaAte: string | null;     // fim da janela de 24h, se aberta
  total: number;
};

const JANELA = 24 * 3600 * 1000;

/** Agrupa por telefone canônico (nono dígito normalizado). Mensagens vêm em qualquer ordem. `casos` indexa por id. */
export function agrupaConversas(mensagens: Mensagem[], casos: Record<string, CasoResumo>, agora: Date): Conversa[] {
  const porTel = new Map<string, Mensagem[]>();
  for (const m of mensagens) { const k = canonizaTelefone(m.telefone); (porTel.get(k) ?? porTel.set(k, []).get(k)!).push(m); }
  const out: Conversa[] = [];
  for (const [telefone, lista] of porTel) {
    lista.sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));
    const ultima = lista[0];
    const comCaso = lista.find((m) => m.caso_id && casos[m.caso_id]);
    const caso = comCaso?.caso_id ? casos[comCaso.caso_id] : null;
    const ultimaEntrada = lista.find((m) => m.direcao === "entrada");
    const ate = ultimaEntrada ? new Date(ultimaEntrada.criado_em).getTime() + JANELA : 0;
    out.push({
      telefone,
      caso,
      ultima,
      naoLidas: lista.filter((m) => m.direcao === "entrada" && !m.lida_em).length,
      aguardando: ultima.direcao === "entrada",
      janelaAte: ate > agora.getTime() ? new Date(ate).toISOString() : null,
      total: lista.length,
    });
  }
  // Quem espera resposta primeiro (não lidas, depois última recebida); depois por recência.
  return out.sort((a, b) => {
    if (a.aguardando !== b.aguardando) return a.aguardando ? -1 : 1;
    if (a.aguardando && a.naoLidas !== b.naoLidas) return b.naoLidas - a.naoLidas;
    return a.ultima.criado_em < b.ultima.criado_em ? 1 : -1;
  });
}

/** Formata E.164 brasileiro para leitura: 5562999998888 → (62) 99999-8888. */
export function fmtTelefone(e164: string): string {
  const d = e164.replace(/\D/g, "");
  const n = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return e164;
}

export const filtraConversas = (lista: Conversa[], filtro: string, q: string): Conversa[] => {
  const ql = q.trim().toLowerCase();
  const qd = q.replace(/\D/g, "");
  return lista.filter((c) => {
    if (filtro === "aguardando" && !c.aguardando) return false;
    if (filtro === "sem_caso" && c.caso) return false;
    if (filtro === "abertas" && !c.janelaAte) return false;
    if (!ql) return true;
    if (qd.length >= 4 && c.telefone.includes(qd)) return true;
    return `${c.caso?.devedor ?? ""} ${c.ultima.texto}`.toLowerCase().includes(ql);
  });
};
