import Link from "next/link";
import { exigeEquipe } from "@/lib/auth";
import { listaClientes } from "@/lib/data";
import { sair } from "@/app/login/actions";
import { NavMesa } from "@/components/NavMesa";
import { SeletorCliente } from "@/components/SeletorCliente";
import { BuscaGlobal } from "@/components/BuscaGlobal";

export default async function MesaLayout({ children }: LayoutProps<"/">) {
  const u = await exigeEquipe();
  const clientes = await listaClientes();
  const iniciais = u.nome.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="top-row">
            <Link href="/fila" className="mark">
              <b>GONTIJO FREITAS</b>
              <span>Recuperação de crédito · Mesa de operação</span>
            </Link>
            <BuscaGlobal />
            <SeletorCliente clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))} />
            <form action={sair} className="user">
              <div className="avatar">{iniciais}</div>
              <span><Link href="/senha?voltar=/fila" title="Trocar senha" style={{ textDecoration: "none" }}>{u.nome}</Link> · {u.papel === "admin" ? "Admin" : "Operação"}</span>
              <button className="btn ghost sm" type="submit">Sair</button>
            </form>
          </div>
          <NavMesa admin={u.papel === "admin"} />
        </div>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
