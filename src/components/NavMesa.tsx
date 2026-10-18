"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const ABAS = [
  { href: "/fila", label: "Fila de hoje" },
  { href: "/agenda", label: "Agenda" },
  { href: "/quadro", label: "Quadro" },
  { href: "/casos", label: "Casos" },
  { href: "/whatsapp", label: "WhatsApp" },
  { href: "/conferencia", label: "Conferência" },
  { href: "/clientes", label: "Clientes" },
  { href: "/importar", label: "Importar" },
  { href: "/painel", label: "Painel", admin: true },
  { href: "/equipe", label: "Equipe", admin: true },
];

export function NavMesa({ admin, contadores = {} }: { admin: boolean; contadores?: Record<string, number> }) {
  const path = usePathname();
  const sp = useSearchParams();
  const cliente = sp.get("cliente");
  const qs = cliente ? `?cliente=${encodeURIComponent(cliente)}` : "";
  return (
    <nav className="tabs" aria-label="Seções da mesa">
      {ABAS.filter((a) => admin || !a.admin).map((a) => (
        <Link key={a.href} href={`${a.href}${qs}`} aria-current={path === a.href || path.startsWith(a.href + "/") ? "page" : undefined}>
          {a.label}{contadores[a.href] ? <span className="cnt" title="Conversas aguardando resposta">{contadores[a.href]}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
