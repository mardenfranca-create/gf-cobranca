import type { Metadata } from "next";
import Link from "next/link";
import { listaClientes } from "@/lib/data";
import { addDias, hojeISO } from "@/lib/domain/datas";
import { NovoCasoForm } from "@/components/NovoCasoForm";
import { PageHead } from "@/components/ui";

export const metadata: Metadata = { title: "Novo caso" };

/** Cadastro de um devedor sem planilha. A gravação usa a mesma regra da importação (ver src/lib/abertura-caso.ts). */
export default async function NovoCasoPage(props: PageProps<"/casos/novo">) {
  const sp = await props.searchParams;
  const cliente = typeof sp.cliente === "string" ? sp.cliente : null;
  const clientes = await listaClientes();
  return (
    <>
      <PageHead eyebrow="Casos" titulo="Novo caso" sub="Um devedor por vez, sem planilha. O caso entra na régua automática com responsável e próxima ação definidos.">
        <Link className="btn ghost" href={cliente ? `/casos?cliente=${encodeURIComponent(cliente)}` : "/casos"}>Voltar aos casos</Link>
      </PageHead>
      <div className="grid two">
        <NovoCasoForm clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))} clienteInicial={cliente} hoje={addDias(hojeISO(), -1)} />
        <div className="panel">
          <div className="panel-head"><h2>O que acontece ao abrir</h2></div>
          <div className="cols">
            <div><code>régua</code><span>O caso nasce na fase &quot;Régua automática&quot;, com a primeira notificação agendada conforme os prazos em Clientes.</span></div>
            <div><code>parcela</code><span>Valor e vencimento viram a primeira parcela do caso. Outras mensalidades podem ser somadas depois, por planilha ou por este formulário.</span></div>
            <div><code>whatsapp</code><span>Só com celular válido com DDD a régua envia as mensagens. Sem ele o caso abre do mesmo jeito, mas o contato será manual.</span></div>
            <div><code>duplicidade</code><span>O mesmo CPF/CNPJ com caso aberto no mesmo cliente não vira caso novo: a parcela entra no caso existente e você é levado até ele.</span></div>
            <div><code>histórico</code><span>A abertura fica registrada no caso com o seu nome.</span></div>
          </div>
          <p className="meta" style={{ marginTop: 14 }}>Vários devedores de uma vez? Use <Link href="/importar" style={{ color: "var(--bronze-dark)" }}>Importar</Link> com a planilha do cliente.</p>
        </div>
      </div>
    </>
  );
}
