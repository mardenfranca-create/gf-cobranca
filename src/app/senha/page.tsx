import type { Metadata } from "next";
import Link from "next/link";
import { usuarioAtual } from "@/lib/auth";
import { redirect } from "next/navigation";
import { trocarSenha } from "./actions";

export const metadata: Metadata = { title: "Trocar senha" };

export default async function SenhaPage(props: PageProps<"/senha">) {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  const sp = await props.searchParams;
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const voltar = typeof sp.voltar === "string" && sp.voltar.startsWith("/") ? sp.voltar : u.papel === "cliente" ? "/portal" : "/fila";
  return (
    <div className="login">
      <form className="panel" action={trocarSenha}>
        <div className="mark"><b>GONTIJO FREITAS</b><span>Trocar senha · {u.nome}</span></div>
        <input type="hidden" name="voltar" value={voltar} />
        <div className="field"><label htmlFor="nova">Nova senha</label><div className="inp"><input id="nova" name="nova" type="password" autoComplete="new-password" minLength={8} required /></div><small>Mínimo de 8 caracteres, com letras e números.</small></div>
        <div className="field"><label htmlFor="confirma">Repita a nova senha</label><div className="inp"><input id="confirma" name="confirma" type="password" autoComplete="new-password" minLength={8} required /></div></div>
        {erro && <div className="verdict out">{erro}</div>}
        <div className="actions"><button className="btn" type="submit">Salvar nova senha</button><Link className="btn ghost" href={voltar}>Cancelar</Link></div>
      </form>
    </div>
  );
}
