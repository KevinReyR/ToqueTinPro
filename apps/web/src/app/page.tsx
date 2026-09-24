import Link from "next/link";
import { Logo } from "@/components/logo";
import { OrderBoard } from "@/components/order-board";
import { SystemPreview } from "@/components/system-preview";
import { RecoveryRedirect } from "@/components/recovery-redirect";

export default function HomePage() {
  return (
    <div className="app-shell">
      <RecoveryRedirect />
      <nav className="topbar" aria-label="Principal">
        <Link className="brand" href="/"><Logo /></Link>
        <div className="topbar-meta"><span className="status-dot" /><span>Cocina conectada</span><Link className="button button-accent" href="/preview/tracking">Ver seguimiento</Link></div>
      </nav>
      <main id="contenido">
        <section className="hero">
          <div>
            <p className="eyebrow">tu pedido, siempre visible</p>
            <h1>Menos espera. Más claridad.</h1>
            <p className="hero-copy">Un QR convierte el teléfono del cliente en su localizador. Puede seguir el pedido sin cuenta ni instalación y, si quiere, activar avisos en sus canales preferidos.</p>
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
      <footer className="legal"><span>© 2026 ToqueTin</span><span className="legal-links"><Link href="/privacidad">Privacidad</Link><Link href="/terminos">Términos</Link></span></footer>
    </div>
  );
}
