import Link from "next/link";
import { Logo } from "@/components/logo";
import { OrderBoard } from "@/components/order-board";
import { SystemPreview } from "@/components/system-preview";

export default function HomePage() {
  return (
    <div className="app-shell">
      <nav className="topbar" aria-label="Principal">
        <Link className="brand" href="/"><Logo /></Link>
        <div className="topbar-meta"><span className="status-dot" /><span>Cocina conectada</span><Link className="button button-accent" href="/preview/tracking">Ver seguimiento</Link></div>
      </nav>
      <main id="contenido">
        <section className="hero">
          <div>
            <p className="eyebrow">tu pedido, siempre visible</p>
            <h1>Menos espera. Más claridad.</h1>
            <p className="hero-copy">Un QR convierte el teléfono del cliente en su localizador. El estado y el tiempo restante permanecen visibles en la pantalla bloqueada, sin cuentas ni datos personales.</p>
            <div className="hero-actions">
              <Link className="button button-accent" href="/preview/dashboard">Abrir operación</Link>
              <Link className="button button-quiet" href="/preview/tracking">Ver experiencia cliente</Link>
            </div>
          </div>
          <SystemPreview />
        </section>
        <section className="section" id="operacion">
          <header className="section-heading"><h2>La jornada, de un vistazo.</h2><p>El equipo ve qué requiere atención y cada pedido conserva una única acción válida. Sin menús laterales ni controles que compitan entre sí.</p></header>
          <OrderBoard />
        </section>
      </main>
      <footer className="legal"><span>© 2026 ToqueTin</span><span>Privacidad · Términos</span></footer>
    </div>
  );
}
