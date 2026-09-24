import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Privacidad" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const controllerName = process.env.PRIVACY_CONTROLLER_NAME;
  const contactEmail = process.env.PRIVACY_CONTACT_EMAIL;
  const configured = Boolean(controllerName && contactEmail);
  return (
    <div className="legal-page">
      <nav className="topbar"><Link className="brand" href="/"><Logo /></Link><Link className="button button-quiet" href="/">Volver</Link></nav>
      <main className="legal-content" id="contenido">
        <p className="eyebrow">tratamiento de datos</p>
        <h1>Tu pedido no depende de entregar tus datos.</h1>
        {!configured && <p className="legal-notice">La identificación legal del responsable y su canal de atención están pendientes de configuración. Por seguridad, la activación de WhatsApp permanece bloqueada hasta completarlos.</p>}
        <p>El seguimiento web de ToqueTin funciona sin cuenta, nombre, correo ni teléfono. Solo tratamos un identificador de WhatsApp cuando eliges voluntariamente ese canal.</p>
        <h2>Responsable y contacto</h2>
        <p>{configured ? <>{controllerName}. Solicitudes sobre datos personales: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.</> : "Configuración legal pendiente."}</p>
        <h2>Finalidades</h2>
        <ul>
          <li>Avisos operativos: comunicar los cambios de estado del pedido durante su seguimiento.</li>
          <li>Novedades del restaurante: solo con una autorización comercial independiente.</li>
          <li>Novedades de ToqueTin: solo con otra autorización comercial independiente.</li>
        </ul>
        <p>Rechazar una finalidad comercial no afecta los avisos operativos ni el seguimiento. Las campañas no están habilitadas en esta etapa.</p>
        <h2>Seguridad y conservación</h2>
        <p>Los identificadores se almacenan cifrados y se comparan mediante un digest no reversible. No publicamos el número, el código ni el token del pedido. Sin consentimiento comercial, el identificador se elimina o anonimiza cuando termina su necesidad operativa. Con consentimiento, se conserva hasta la revocación.</p>
        <h2>Tus decisiones</h2>
        <p>Puedes desactivar cada canal desde «Gestionar avisos» o solicitar la baja por WhatsApp. También puedes pedir consulta, corrección, actualización o supresión mediante el contacto indicado arriba.</p>
        <p>Versión de política: {process.env.PRIVACY_POLICY_VERSION ?? "2026-09-23"}.</p>
      </main>
    </div>
  );
}
