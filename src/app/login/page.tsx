import type { Metadata } from "next";
import { entrar } from "./actions";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return (
    <div className="login">
      <form className="panel" action={entrar}>
        <div className="mark">
          <b>GONTIJO FREITAS</b>
          <span>Recuperação de crédito</span>
        </div>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <div className="inp"><input id="email" name="email" type="email" autoComplete="username" required /></div>
        </div>
        <div className="field">
          <label htmlFor="senha">Senha</label>
          <div className="inp"><input id="senha" name="senha" type="password" autoComplete="current-password" required /></div>
        </div>
        <input type="hidden" name="next" value={next} />
        {erro && <div className="verdict out">{erro}</div>}
        <button className="btn" type="submit">Entrar</button>
        <p className="meta" style={{ margin: 0 }}>Acesso restrito à equipe e aos clientes convidados. Esqueceu a senha? Peça ao administrador.</p>
      </form>
    </div>
  );
}
