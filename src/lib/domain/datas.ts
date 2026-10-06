/** Datas como string ISO (AAAA-MM-DD) no fuso de Brasília, sem depender do fuso do servidor. */

export function hojeISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now); // en-CA = AAAA-MM-DD
}

export function addDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

export function diffDias(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split("-").map(Number);
  const [by, bm, bd] = bISO.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 864e5);
}

export function isoDe(d: Date): string {
  return hojeISO(d);
}

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function fmtDataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export function parseDataBR(s: string): string | null {
  const m = String(s).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  if (dt.getUTCDate() !== +d || dt.getUTCMonth() !== +mo - 1) return null;
  return dt.toISOString().slice(0, 10);
}

export const brl = (v: number | null | undefined, cents = true) =>
  v == null
    ? "sem valor"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: cents ? 2 : 0 });

export const compacto = (v: number) =>
  v >= 1e6
    ? `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`
    : v >= 1e3
      ? `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`
      : brl(v, false);
