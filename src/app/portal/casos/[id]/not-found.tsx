import Link from "next/link";
export default function NaoEncontrado() {
  return <div className="panel empty">Este caso não está na sua carteira. <Link href="/portal/carteira">Voltar à carteira</Link></div>;
}
