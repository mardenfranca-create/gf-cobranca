import { normalizaPlanilha, parseValorBR, type LinhaPlanilha } from "./reconcile";
import { EQUIPE } from "./types";
import { normalizaCelular } from "./whatsapp";

/** Quem pode receber um caso novo pelo formulário da mesa. */
export const RESPONSAVEIS_NOVO_CASO = ["Ana Paula", "Letícia", "Jaqueline"] as const satisfies readonly (typeof EQUIPE)[number][];
export const RESPONSAVEL_PADRAO = "Ana Paula";

/** Campos do formulário "Novo caso", como chegam do FormData (strings cruas). */
export type CamposNovoCaso = {
  cliente_id: string;
  devedor: string;
  documento: string;
  referencia: string;
  valor: string;
  vencimento: string; // DD/MM/AAAA ou AAAA-MM-DD (input type=date)
  telefone: string;
  email: string;
  responsavel: string;
};

export type NovoCasoNormalizado = {
  linha: LinhaPlanilha;
  responsavel: string;
  /** Celular no formato que a régua usa (55DDD9XXXXXXXX) ou null se a régua não vai conseguir enviar. */
  celular: string | null;
  erros: string[];
  /** Não bloqueiam o cadastro, mas a operadora precisa saber. */
  avisos: string[];
};

/**
 * Valor digitado à mão: aceita "2.450,00", "2450,5", "2450.50" e "2450".
 * Difere da planilha só no ponto decimal: na mesa ninguém digita separador de milhar sem a vírgula.
 */
export function parseValorForm(v: string): number | null {
  const s = v.trim();
  if (/^\d+\.\d{1,2}$/.test(s)) return parseValorBR(s.replace(".", ","));
  return parseValorBR(s);
}

/**
 * Valida o formulário com as MESMAS regras da linha de planilha (devedor, documento, valor, vencimento, telefone)
 * e acrescenta o que só o cadastro avulso tem: responsável escolhido e aviso de celular inválido para a régua.
 */
export function normalizaNovoCaso(c: CamposNovoCaso, hoje: string): NovoCasoNormalizado {
  const valor = parseValorForm(c.valor);
  const { linhas } = normalizaPlanilha([
    ["cliente", "devedor", "documento", "referencia", "valor", "vencimento", "telefone", "email"],
    [c.cliente_id, c.devedor, c.documento, c.referencia, valor ?? "", c.vencimento.trim(), c.telefone, c.email],
  ], hoje);
  const linha: LinhaPlanilha = linhas[0] ?? { linha: 2, devedor: "", documento: "", documento_digits: "", referencia: "Parcela", valor: null, vencimento: null, telefone: "", email: "", cliente: c.cliente_id, situacao: "", erros: ["preencha o formulário"] };
  const erros = [...linha.erros];
  if (!c.cliente_id.trim()) erros.unshift("escolha o cliente credor");
  const responsavel = c.responsavel.trim() || RESPONSAVEL_PADRAO;
  if (!(RESPONSAVEIS_NOVO_CASO as readonly string[]).includes(responsavel)) erros.push("responsável inválido");
  const celular = normalizaCelular(linha.telefone);
  const avisos: string[] = [];
  if (!celular && !erros.length) avisos.push(linha.telefone ? "O telefone informado não é um celular válido com DDD: a régua automática de WhatsApp não vai enviar para este caso." : "Sem celular, a régua automática de WhatsApp não envia para este caso. Cadastre quando tiver o número.");
  return { linha, responsavel, celular, erros, avisos };
}
