/**
 * Símbolo do Escala (mesmo desenho de sistema-gfa/components/logo.tsx e app/icon.svg):
 * monograma E cujo traço do meio vira uma rota com o ponto de cobre no destino.
 */
export function LogoEscala({ size = 36 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <rect width="48" height="48" rx="11" fill="var(--primary)" />
      <path d="M12 12h18v5H17v6h11v5H17v6h13v5H12z" fill="#fff" />
      <path d="M28 25.5h4c3.5 0 5.5-2.5 7-5" stroke="var(--cobre-vivo)" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <circle cx="39.5" cy="19.5" r="3" fill="var(--cobre-vivo)" />
    </svg>
  );
}
