import { exigeCliente } from "@/lib/auth";
import { sair } from "@/app/login/actions";

/** Portal do cliente: entra na etapa 2. Esta página só garante que um usuário-cliente não caia na mesa. */
export default async function PortalPage() {
  const u = await exigeCliente();
  return (
    <main className="wrap">
      <div className="panel" style={{ display: "grid", gap: 12, marginTop: 40 }}>
        <div className="eyebrow">Portal do cliente</div>
        <h1>Olá, {u.nome}</h1>
        <p className="sub">O portal do cliente entra na próxima etapa. Enquanto isso, a equipe do Gontijo Freitas acompanha a sua carteira pela mesa de operação.</p>
        <form action={sair}><button className="btn ghost sm" type="submit">Sair</button></form>
      </div>
    </main>
  );
}
