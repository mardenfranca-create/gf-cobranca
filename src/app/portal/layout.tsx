import Link from "next/link";
import { exigeCliente } from "@/lib/auth";
import { clientePorId, propostasPendentes } from "@/lib/data";
import { sair } from "@/app/login/actions";
import { NavPortal } from "@/components/NavPortal";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const u = await exigeCliente();
  const [cliente, pendentes] = await Promise.all([clientePorId(u.cliente_id), propostasPendentes(u.cliente_id)]);
  const iniciais = u.nome.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="top-row">
            <Link href="/portal" className="mark">
              <b>GONTIJO FREITAS</b>
              <span>Recuperação de crédito · Portal do cliente</span>
            </Link>
            <div className="client-pick"><label>Carteira</label><strong style={{ fontSize: 13.5 }}>{cliente?.nome ?? u.cliente_id}</strong></div>
            <form action={sair} className="user">
              <div className="avatar">{iniciais}</div>
              <span>{u.nome}</span>
              <button className="btn ghost sm" type="submit">Sair</button>
            </form>
          </div>
          <NavPortal pendentes={pendentes.length} />
        </div>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
