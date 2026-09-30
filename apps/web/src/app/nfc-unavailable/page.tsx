import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NfcUnavailablePage() {
  return (
    <main className="tracking-page">
      <nav className="topbar">
        <Logo />
      </nav>
      <section className="config-panel nfc-unavailable-card">
        <p className="eyebrow">tarjeta disponible</p>
        <h1>Esta tarjeta no tiene un pedido asignado.</h1>
        <p>
          Acércate al mostrador para que el equipo vuelva a vincularla con tu
          pedido.
        </p>
        <Link className="button button-accent" href="/">
          Volver al inicio
        </Link>
      </section>
    </main>
  );
}
