"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/portal", label: "Visão geral" },
  { href: "/portal/carteira", label: "Carteira" },
  { href: "/portal/aprovacoes", label: "Aprovações" },
  { href: "/portal/planilha", label: "Enviar planilha" },
  { href: "/portal/config", label: "Alçadas e contato" },
];

export function NavPortal({ pendentes }: { pendentes: number }) {
  const path = usePathname();
  const ativo = (href: string) => (href === "/portal" ? path === "/portal" || path.startsWith("/portal/casos") : path.startsWith(href));
  return (
    <nav className="tabs" aria-label="Seções do portal">
      {ABAS.map((a) => (
        <Link key={a.href} href={a.href} aria-current={ativo(a.href) ? "page" : undefined}>
          {a.label}
          {a.href === "/portal/aprovacoes" && <span className="count num" {...(pendentes === 0 ? { "data-zero": "" } : {})}>{pendentes}</span>}
        </Link>
      ))}
    </nav>
  );
}
