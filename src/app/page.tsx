import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth";

export default async function Home() {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  redirect(u.papel === "cliente" ? "/portal" : "/fila");
}
