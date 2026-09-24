import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Términos" };

export default function TermsPage() {
  return (
    <div className="legal-page">
      <nav className="topbar"><Link className="brand" href="/"><Logo /></Link><Link className="button button-quiet" href="/">Volver</Link></nav>
      <main className="legal-content" id="contenido">
        <p className="eyebrow">condiciones del servicio</p>
        <h1>Seguimiento claro, sin reemplazar al restaurante.</h1>
        <p>ToqueTin muestra la información que el restaurante registra sobre un pedido. El tiempo presentado es aproximado y puede cambiar durante la preparación.</p>
        <h2>Acceso al pedido</h2>
        <p>El QR y su enlace son temporales y corresponden a un único pedido. No debes compartirlos públicamente ni intentar consultar pedidos ajenos.</p>
        <h2>Avisos opcionales</h2>
        <p>Los avisos dependen del dispositivo, el navegador, WhatsApp, la conexión y los permisos elegidos. La vista de seguimiento sigue siendo el medio principal y permanece disponible aunque un canal falle o sea desactivado.</p>
        <h2>Uso aceptable</h2>
        <p>No se permite manipular códigos, automatizar intentos de acceso, interferir con el servicio ni usar los canales para fines distintos al seguimiento autorizado.</p>
        <h2>Atención</h2>
        <p>Las dudas sobre preparación, productos, cambios o entrega deben dirigirse al restaurante. Las solicitudes de privacidad se atienden por el canal publicado en la política de privacidad.</p>
      </main>
    </div>
  );
}
