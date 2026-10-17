/** Busca em qualquer aba da mesa: devedor, CPF/CNPJ, telefone, referência. Cai na aba Casos com o filtro aplicado. */
export function BuscaGlobal() {
  return (
    <form action="/casos" method="get" role="search" className="busca-topo">
      <input type="hidden" name="fase" value="todos" />
      <input className="search" name="q" type="search" placeholder="Buscar devedor, CPF, telefone…" aria-label="Buscar em toda a carteira" />
    </form>
  );
}
