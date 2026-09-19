"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/browser";

type RecoveryState = "loading" | "ready" | "invalid" | "complete";

export function ResetPasswordForm() {
  const [state, setState] = useState<RecoveryState>("loading");
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const client = createBrowserClient();
    let active = true;

    async function prepareRecovery() {
      const code = new URLSearchParams(window.location.search).get("code");

      if (code) {
        const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (active) setState("invalid");
          return;
        }
        window.history.replaceState({}, "", window.location.pathname);
      }

      const { data } = await client.auth.getSession();
      if (active) setState(data.session ? "ready" : "invalid");
    }

    const { data: listener } = client.auth.onAuthStateChange((event) => {
      if (active && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) setState("ready");
    });

    void prepareRecovery();
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(undefined);
    const values = new FormData(event.currentTarget);
    const password = String(values.get("password"));
    const confirmation = String(values.get("confirmation"));

    if (password.length < 10) {
      setError("La contraseña debe tener al menos 10 caracteres.");
      setWorking(false);
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      setWorking(false);
      return;
    }

    const client = createBrowserClient();
    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) {
      setError("No pudimos actualizar la contraseña. Solicita un enlace nuevo e inténtalo otra vez.");
      setWorking(false);
      return;
    }

    await client.auth.signOut();
    setState("complete");
    setWorking(false);
  }

  if (state === "loading") return <p>Validando el enlace seguro…</p>;
  if (state === "invalid") return <><p className="form-error" role="alert">Este enlace venció o no es válido.</p><Link className="button button-accent" href="/operator/login">Volver al acceso</Link></>;
  if (state === "complete") return <><p>Tu contraseña fue actualizada correctamente.</p><Link className="button button-accent" href="/operator/login">Iniciar sesión</Link></>;

  return (
    <form className="login-form" onSubmit={submit}>
      <label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={10} required /></label>
      <label>Confirmar contraseña<input name="confirmation" type="password" autoComplete="new-password" minLength={10} required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-accent" disabled={working} type="submit">{working ? "Guardando…" : "Guardar contraseña"}</button>
    </form>
  );
}
