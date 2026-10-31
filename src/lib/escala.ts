import "server-only";
import type { ChamarEscala, RespostaEscala } from "@/lib/domain/judicial";

/**
 * Cliente da API do Escala (sistema de gestão do escritório, repositório sistema-gfa).
 * `POST <ESCALA_API_URL>/api/mcp/<ferramenta>` com `Authorization: Bearer <ESCALA_API_TOKEN>`, o mesmo
 * mecanismo do plugin do Claude. O token é pessoal (gerado em /perfil no Escala) e as escritas saem
 * em nome do dono dele. Resposta: `{ content: [{ type: "text", text }], isError? }`; em sucesso o texto é JSON.
 */
export function escalaEnv() {
  const url = (process.env.ESCALA_API_URL || "https://gestao.gontijofreitas.adv.br").replace(/\/+$/, "");
  const token = (process.env.ESCALA_API_TOKEN ?? "").trim();
  return { url, token, ok: token.startsWith("gfa_") };
}

export const chamarEscala: ChamarEscala = async (ferramenta, args): Promise<RespostaEscala> => {
  const env = escalaEnv();
  if (!env.ok) return { ok: false, erro: "ESCALA_API_TOKEN não configurado na Vercel" };
  let res: Response;
  try {
    res = await fetch(`${env.url}/api/mcp/${ferramenta}`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.token}`, "content-type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return { ok: false, erro: `Escala fora do ar ou lento (${e instanceof Error ? e.message : String(e)})` };
  }
  const corpo = (await res.json().catch(() => null)) as { content?: { text?: string }[]; isError?: boolean; erro?: string } | null;
  if (!res.ok) return { ok: false, erro: corpo?.erro ?? `HTTP ${res.status}` };
  const texto = corpo?.content?.[0]?.text ?? "";
  if (corpo?.isError) return { ok: false, erro: texto || "erro sem mensagem" };
  try {
    return { ok: true, dados: JSON.parse(texto) as Record<string, unknown> };
  } catch {
    return { ok: true, dados: { texto } };
  }
};
