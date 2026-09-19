import Link from "next/link";
import { Logo } from "@/components/logo";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <main className="config-panel" id="contenido">
      <Link className="brand" href="/"><Logo /></Link>
      <p className="eyebrow" style={{ marginTop: "2rem" }}>acceso seguro</p>
      <h1 style={{ fontSize: "clamp(2.4rem, 7vw, 4rem)" }}>Crea una nueva contraseña.</h1>
      <p>Usa al menos 10 caracteres. El enlace solo puede utilizarse durante un tiempo limitado.</p>
      <ResetPasswordForm />
    </main>
  );
}
