import Link from "next/link";
import { LogoEscala } from "@/components/LogoEscala";
import { exigeEquipe } from "@/lib/auth";
import { listaClientes } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import { sair } from "@/app/login/actions";
import { NavMesa } from "@/components/NavMesa";
import { SeletorCliente } from "@/components/SeletorCliente";
import { BuscaGlobal } from "@/components/BuscaGlobal";

export default async function MesaLayout({ children }: LayoutProps<"/">) {
  const u = await exigeEquipe();
  const sb = await supabaseServer();
  const [clientes, naoLidas, minutas] = await Promise.all([
    listaClientes(),
    // Mensagens de WhatsApp recebidas e ainda não lidas (0 se a migration 0004/0006 não existir).
    sb.from("mensagens").select("id", { count: "exact", head: true }).eq("direcao", "entrada").is("lida_em", null).then((r) => r.count ?? 0, () => 0),
    // Minutas de notificação esperando revisão (0 se a migration 0010 não existir).
    sb.from("notificacoes").select("id", { count: "exact", head: true }).eq("status", "minuta").then((r) => r.count ?? 0, () => 0),
  ]);
  const iniciais = u.nome.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="top-row">
            <Link href="/fila" className="mark">
              <LogoEscala />
              <span className="mark-txt"><b>Escala</b><span>Cobrança · Mesa de operação</span></span>
            </Link>
            <BuscaGlobal />
            <SeletorCliente clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))} />
            <form action={sair} className="user">
              <div className="avatar">{iniciais}</div>
              <span><Link href="/senha?voltar=/fila" title="Trocar senha" style={{ textDecoration: "none" }}>{u.nome}</Link> · {u.papel === "admin" ? "Admin" : "Operação"}</span>
              <button className="btn ghost sm" type="submit">Sair</button>
            </form>
          </div>
          <NavMesa admin={u.papel === "admin"} whatsapp={naoLidas} notificacoes={minutas} />
        </div>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
