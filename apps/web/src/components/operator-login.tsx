"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/browser";

export function OperatorLogin() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); setError(undefined);
    const values = new FormData(event.currentTarget);
    try {
      const { error } = await createBrowserClient().auth.signInWithPassword({ email: String(values.get("email")), password: String(values.get("password")) });
      if (error) throw error;
      router.replace("/operator");
    } catch { setError("No pudimos iniciar sesión con esos datos."); setWorking(false); }
  }

  return <form className="login-form" onSubmit={submit}>
    <label>Correo<input name="email" type="email" autoComplete="email" required /></label>
    <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button-accent" disabled={working} type="submit">{working ? "Entrando…" : "Entrar"}</button>
  </form>;
}
