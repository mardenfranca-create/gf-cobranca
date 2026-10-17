"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { marcarLidas } from "@/lib/actions/whatsapp";

/** Recarrega a caixa de entrada de tempos em tempos enquanto a aba está visível (o webhook grava no banco; a tela só precisa reler). */
export function AutoRefresh({ segundos = 20 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, segundos * 1000);
    return () => clearInterval(t);
  }, [router, segundos]);
  return null;
}

/** Ao abrir uma conversa, marca as mensagens recebidas como lidas. */
export function MarcarLida({ telefone, pendentes }: { telefone: string; pendentes: number }) {
  const feito = useRef<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (!pendentes || feito.current === telefone) return;
    feito.current = telefone;
    marcarLidas(telefone).then(() => router.refresh()).catch(() => {});
  }, [telefone, pendentes, router]);
  return null;
}

/** Rola o chat para a última mensagem. */
export function RolaParaFim({ chave }: { chave: string }) {
  useEffect(() => {
    const el = document.getElementById("wa-chat");
    if (el) el.scrollTop = el.scrollHeight;
  }, [chave]);
  return null;
}
