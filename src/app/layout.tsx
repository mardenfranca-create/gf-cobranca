import type { Metadata } from "next";
import { Inter, Inria_Serif } from "next/font/google";
import "./globals.css";

const ui = Inter({ variable: "--font-ui", subsets: ["latin"], display: "swap" });
const display = Inria_Serif({ variable: "--font-display", subsets: ["latin"], weight: ["400", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Cobrança GF", template: "%s · Cobrança GF" },
  description: "Recuperação de crédito · Gontijo Freitas Advogados",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${ui.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
