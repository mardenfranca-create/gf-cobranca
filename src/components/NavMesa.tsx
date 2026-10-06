"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const ABAS = [
  { href: "/fila", label: "Fila de hoje" },
  { href: "/agenda", label: "Agenda" },
  { href: "/quadro", label: "Quadro" },
  { href: "/casos", label: "Casos" },
  { href: "/conferencia", label: "Conferência" },
  { href: "/clientes", label: "Clientes" },
  { href: "/importar", label: "Importar" },
];

export function NavMesa({ admin }: { admin: boolean }) {
  const path = usePathname();
  const sp = useSearchParams();
  const cliente = sp.get("cliente");
  const qs = cliente ? `?cliente=${encodeURIComponent(cliente)}` : "";
  return (
    <nav className="tabs" aria-label="Seções da mesa">
      {ABAS.filter((a) => admin || a.href !== "/clientes" || true).map((a) => (
        <Link key={a.href} href={`${a.href}${qs}`} aria-current={path === a.href || path.startsWith(a.href + "/") ? "page" : undefined}>
          {a.label}
        </Link>
      ))}
    </nav>
  );
}
