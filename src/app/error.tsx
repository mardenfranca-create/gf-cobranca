"use client";
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="wrap">
      <div className="panel" style={{ display: "grid", gap: 12 }}>
        <h2>Algo deu errado</h2>
        <div className="verdict out">{error.message}</div>
        <div className="actions"><button className="btn ghost sm" onClick={reset}>Tentar de novo</button></div>
      </div>
    </main>
  );
}
