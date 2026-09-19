import Link from "next/link";
import { Logo } from "@/components/logo";
import { OrderBoard } from "@/components/order-board";

export default function DashboardPreviewPage() {
  return (
    <div className="app-shell">
      <nav className="topbar"><Link className="brand" href="/"><Logo /></Link><div className="topbar-meta"><span>Cocina La Esquina</span><button className="button button-accent">Crear pedido</button></div></nav>
      <main className="section" id="contenido">
        <header className="section-heading"><div><p className="eyebrow">sábado · jornada actual</p><h2>Pedidos en curso</h2></div><p>5 activos · preparación media 11 min · retiro medio 3 min</p></header>
        <OrderBoard />
      </main>
    </div>
  );
}
