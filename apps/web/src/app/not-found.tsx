import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return <main className="tracking-page" id="contenido"><section className="config-panel"><Logo /><p className="eyebrow not-found-eyebrow">seguimiento no disponible</p><h1>Este enlace ya no muestra un pedido.</h1><p>Puede haber vencido, haber sido revocado o no ser válido. Solicita el QR nuevamente en el restaurante.</p><Link className="button" href="/">Volver al inicio</Link></section></main>;
}
