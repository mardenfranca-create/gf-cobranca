"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Filtro global de cliente. Vive na URL (?cliente=) para ser compartilhável e sobreviver a recarga. */
export function SeletorCliente({ clientes }: { clientes: { id: string; nome: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const atual = sp.get("cliente") ?? "";
  return (
    <div className="client-pick">
      <label htmlFor="sel-cliente">Cliente</label>
      <select
        id="sel-cliente"
        value={atual}
        onChange={(e) => {
          const p = new URLSearchParams(sp.toString());
          if (e.target.value) p.set("cliente", e.target.value);
          else p.delete("cliente");
          router.push(`${path}?${p.toString()}`);
        }}
      >
        <option value="">Todos os clientes</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>{c.nome}</option>
        ))}
      </select>
    </div>
  );
}
