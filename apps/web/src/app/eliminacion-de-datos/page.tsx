import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Eliminación de datos",
  description: "Instrucciones para solicitar la eliminación de datos en ToqueTin.",
};
export const dynamic = "force-dynamic";

export default function DataDeletionPage() {
  const controllerName = process.env.PRIVACY_CONTROLLER_NAME;
  const contactEmail = process.env.PRIVACY_CONTACT_EMAIL;
  const configured = Boolean(controllerName && contactEmail);

  return (
    <div className="legal-page">
      <nav className="topbar">
        <Link className="brand" href="/">
          <Logo />
        </Link>
        <Link className="button button-quiet" href="/">
          Volver
        </Link>
      </nav>
      <main className="legal-content" id="contenido">
        <p className="eyebrow">privacidad y control</p>
        <h1>Solicitud de eliminación de datos</h1>
        {!configured && (
          <p className="legal-notice">
            El canal responsable de recibir solicitudes está pendiente de configuración.
          </p>
        )}
        <p>
          Puedes solicitar la eliminación de los datos asociados a tu uso de ToqueTin. El
          seguimiento básico de pedidos no exige una cuenta, nombre, correo ni teléfono.
        </p>
        <h2>Cómo solicitarla</h2>
        <ol>
          <li>
            Envía un correo a{" "}
            {configured ? (
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            ) : (
              "nuestro canal de privacidad"
            )}{" "}
            con el asunto «Eliminación de datos ToqueTin».
          </li>
          <li>
            Indica el número de WhatsApp que utilizaste para activar avisos, sin incluir códigos
            de acceso ni enlaces privados del pedido.
          </li>
          <li>
            Responderemos por el mismo canal para validar la solicitud y confirmar su atención.
          </li>
        </ol>
        <h2>Qué eliminaremos</h2>
        <p>
          Eliminaremos o anonimizaremos los identificadores de WhatsApp y revocaremos los
          consentimientos asociados, salvo la evidencia mínima que debamos conservar para
          acreditar la solicitud o cumplir una obligación legal.
        </p>
        <h2>Responsable</h2>
        <p>
          {configured
            ? `${controllerName} es responsable de atender esta solicitud.`
            : "La identificación del responsable está pendiente de configuración."}
        </p>
        <p>
          Consulta también nuestra <Link href="/privacidad">política de privacidad</Link>.
        </p>
      </main>
    </div>
  );
}
