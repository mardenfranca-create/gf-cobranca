import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const ui = Inter({ variable: "--font-ui", subsets: ["latin"], display: "swap" });
// Mesmas fontes do Escala: Inter no corpo, Plus Jakarta Sans nos títulos.
const display = Plus_Jakarta_Sans({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700", "800"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Escala Cobrança", template: "%s · Escala Cobrança" },
  description: "Escala Cobrança: recuperação de crédito do Gontijo Freitas Advogados.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${ui.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
