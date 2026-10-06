import Link from "next/link";
import { brl, fmtData } from "@/lib/domain/datas";
import { EXCECOES, FASES, type Caso } from "@/lib/domain/types";

export function Pill({ fase }: { fase: Caso["fase"] }) {
  return <span className={`pill ph-${fase}`}>{FASES[fase].label}</span>;
}

export function PillExcecao({ caso }: { caso: Pick<Caso, "exc_tipo"> }) {
  return caso.exc_tipo ? <span className="pill ph-confirma">Exceção · {EXCECOES[caso.exc_tipo]}</span> : null;
}

export function Valor({ caso }: { caso: Pick<Caso, "valor_atualizado"> }) {
  return <b className="num">{caso.valor_atualizado == null ? "sem valor" : brl(caso.valor_atualizado, false)}</b>;
}

export function ProximaAcao({ caso, hoje }: { caso: Caso; hoje: string }) {
  if (caso.exc_tipo) return <span className="pill ph-confirma">Exceção · {EXCECOES[caso.exc_tipo]}</span>;
  if (!caso.proxima_data) return <span className="err">sem próxima ação</span>;
  const atrasado = caso.proxima_data < hoje;
  return (
    <>
      <div className="meta" style={{ color: "var(--ink-80)", maxWidth: "28ch" }}>{caso.proxima_nota}</div>
      <div className="meta num" style={atrasado ? { color: "var(--bad)", fontWeight: 600 } : undefined}>
        {fmtData(caso.proxima_data)} · {caso.responsavel}
      </div>
    </>
  );
}

export function LinkCaso({ caso, children, className }: { caso: Pick<Caso, "id">; children: React.ReactNode; className?: string }) {
  return (
    <Link href={`/casos/${caso.id}`} className={className}>
      {children}
    </Link>
  );
}

export function PageHead({ eyebrow, titulo, sub, children }: { eyebrow: string; titulo: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{titulo}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
