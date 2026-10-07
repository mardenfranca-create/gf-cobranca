import type { Metadata } from "next";
import { exigeAdmin } from "@/lib/auth";
import { listaClientes } from "@/lib/data";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { fmtData } from "@/lib/domain/datas";
import type { Papel } from "@/lib/domain/types";
import { alterarPerfil, criarUsuario, redefinirSenha } from "@/lib/actions/equipe";
import { PageHead } from "@/components/ui";

export const metadata: Metadata = { title: "Equipe" };
const PAPEL: Record<Papel, string> = { admin: "Admin", operador: "Operação", cliente: "Cliente (portal)" };

export default async function EquipePage(props: PageProps<"/equipe">) {
  const eu = await exigeAdmin();
  const sp = await props.searchParams;
  const sb = await supabaseServer();
  const [{ data: perfis }, clientes] = await Promise.all([sb.from("perfis").select("*").order("papel").order("nome"), listaClientes()]);
  let emails: Record<string, { email: string; ultimo: string | null }> = {};
  let temChave = true;
  try {
    const { data } = await supabaseAdmin().auth.admin.listUsers({ perPage: 200 });
    emails = Object.fromEntries((data?.users ?? []).map((u) => [u.id, { email: u.email ?? "", ultimo: u.last_sign_in_at ?? null }]));
  } catch { temChave = false; }
  const msg = (k: "ok" | "erro") => (typeof sp[k] === "string" ? sp[k] : null);
  const senha = typeof sp.senha === "string" ? sp.senha : null;

  return (
    <>
      <PageHead eyebrow="Equipe" titulo="Usuários da mesa e do portal" sub="Crie acessos para a equipe e para os clientes sem entrar no painel do Supabase. A senha temporária aparece uma única vez." />
      {msg("ok") && <div className="verdict in" style={{ marginBottom: 12 }}>{msg("ok")}{senha && <div style={{ marginTop: 6 }}>Senha temporária: <code className="mono" style={{ fontSize: 15, userSelect: "all" }}>{senha}</code></div>}</div>}
      {msg("erro") && <div className="verdict out" style={{ marginBottom: 12 }}>{msg("erro")}</div>}
      {!temChave && <div className="verdict warn" style={{ marginBottom: 12 }}>A chave de serviço (SUPABASE_SERVICE_ROLE_KEY) não está configurada na Vercel. Dá para editar papéis, mas não criar usuários nem redefinir senhas por aqui.</div>}
      <div className="grid two">
        <div className="panel">
          <div className="panel-head"><h2>Usuários</h2><p>{perfis?.length ?? 0} cadastrados</p></div>
          <div style={{ display: "grid", gap: 10 }}>
            {(perfis ?? []).map((p) => (
              <form key={p.id} action={alterarPerfil} className="card" style={{ padding: "12px 14px", gap: 10 }}>
                <input type="hidden" name="id" value={p.id} />
                <div className="card-top">
                  <div><b>{p.nome}</b><div className="meta">{emails[p.id]?.email ?? "e-mail não disponível"}{emails[p.id]?.ultimo ? ` · último acesso ${fmtData(emails[p.id].ultimo!.slice(0, 10))}` : " · nunca entrou"}</div></div>
                  <span className={`flag ${p.ativo ? "in" : "done"}`}>{p.ativo ? PAPEL[p.papel] : "desativado"}</span>
                </div>
                <div className="frow">
                  <div className="field"><label>Nome</label><div className="inp"><input name="nome" defaultValue={p.nome} required /></div></div>
                  <div className="field"><label>Papel</label><div className="inp"><select name="papel" defaultValue={p.papel} disabled={p.id === eu.id}>{Object.entries(PAPEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div></div>
                  <div className="field"><label>Carteira (se cliente)</label><div className="inp"><select name="cliente_id" defaultValue={p.cliente_id ?? ""}><option value="">—</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div></div>
                </div>
                <div className="actions" style={{ alignItems: "center" }}>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}><input type="checkbox" name="ativo" defaultChecked={p.ativo} disabled={p.id === eu.id} /> ativo</label>
                  <button className="btn ghost sm" type="submit">Salvar</button>
                  {temChave && p.id !== eu.id && <button className="btn ghost sm" type="submit" formAction={redefinirSenha}>Redefinir senha</button>}
                </div>
              </form>
            ))}
          </div>
        </div>
        <form className="card" action={criarUsuario}>
          <h2>Novo usuário</h2>
          <div className="field"><label>Nome (como aparece na mesa e no histórico)</label><div className="inp"><input name="nome" required placeholder="Ana Paula" /></div></div>
          <div className="field"><label>E-mail</label><div className="inp"><input name="email" type="email" required placeholder="nome@dominio.com.br" /></div></div>
          <div className="frow">
            <div className="field"><label>Papel</label><div className="inp"><select name="papel" defaultValue="operador">{Object.entries(PAPEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div></div>
            <div className="field"><label>Carteira (só cliente)</label><div className="inp"><select name="cliente_id" defaultValue=""><option value="">—</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div></div>
          </div>
          <div className="field"><label>Senha</label><div className="inp"><input name="senha" type="text" autoComplete="off" placeholder="em branco = gerar temporária" minLength={8} /></div><small>Sem confirmação por e-mail: o usuário já entra com a senha informada.</small></div>
          <div className="actions"><button className="btn" type="submit" disabled={!temChave}>Criar acesso</button></div>
          <div className="meta">Admin: Marden e Letícia. Operação: Ana Paula. Cliente: um usuário por carteira, só enxerga a própria.</div>
        </form>
      </div>
    </>
  );
}
