import type { NextConfig } from "next";

// Sistema interno: toda tela depende da sessão e de dados vivos do banco.
// Usamos o modelo de renderização dinâmica (sem Cache Components) de propósito.
const nextConfig: NextConfig = {
  cacheComponents: false,
  partialPrefetching: false,
  serverExternalPackages: ["xlsx"],
  experimental: {
    // Exportação do Trello passa de 4 MB; planilhas grandes também.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
