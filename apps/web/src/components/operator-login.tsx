"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/browser";

const REMEMBERED_EMAIL_KEY = "toquetin.operator.email";

export function OperatorLogin() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);
  const [email, setEmail] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string>();
  const [recoveryWorking, setRecoveryWorking] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const rememberedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (rememberedEmail) {
        setEmail(rememberedEmail);
        setRememberEmail(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); setError(undefined); setRecoveryMessage(undefined);
    const values = new FormData(event.currentTarget);
    try {
      const { error: signInError } = await createBrowserClient().auth.signInWithPassword({ email: String(values.get("email")), password: String(values.get("password")) });
      if (signInError) throw signInError;
      if (rememberEmail) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      else window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      router.replace("/operator");
    } catch { setError("No pudimos iniciar sesión con esos datos."); setWorking(false); }
  }

  async function recoverPassword() {
    setError(undefined); setRecoveryMessage(undefined);
    if (!email.trim()) {
      setError("Escribe tu correo para enviarte el enlace de recuperación.");
      return;
    }

    setRecoveryWorking(true);
    const { error: recoveryError } = await createBrowserClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/operator/reset-password`,
    });
    setRecoveryWorking(false);
    if (recoveryError) {
      setError("No pudimos enviar el enlace. Inténtalo nuevamente en unos minutos.");
      return;
    }
    setRecoveryMessage("Si el correo está registrado, recibirás un enlace para crear una nueva contraseña.");
  }

  return <form className="login-form" onSubmit={submit}>
    <label>Correo<input name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
    <div className="login-options">
      <label className="remember-option"><input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} />Recordar mi correo</label>
      <button className="text-button" disabled={recoveryWorking} onClick={() => void recoverPassword()} type="button">{recoveryWorking ? "Enviando…" : "¿Olvidaste tu contraseña?"}</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {recoveryMessage && <p className="form-success" role="status">{recoveryMessage}</p>}
    <button className="button button-accent" disabled={working} type="submit">{working ? "Entrando…" : "Entrar"}</button>
  </form>;
}
