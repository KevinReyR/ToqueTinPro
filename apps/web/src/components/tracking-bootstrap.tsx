"use client";

import { useEffect, useState } from "react";
import { Logo } from "./logo";

export function TrackingBootstrap({ nonce }: { nonce: string }) {
  const [message, setMessage] = useState("Validando tu pedido…");

  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (!token) {
      queueMicrotask(() => setMessage("Este enlace no contiene un acceso válido. Solicita el QR nuevamente."));
      return;
    }

    const exchange = async () => {
      const response = await fetch("/api/tracking/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce, token }),
      });
      if (!response.ok) {
        setMessage("No pudimos abrir este seguimiento. Solicita el QR nuevamente.");
        return;
      }
      window.history.replaceState(null, "", window.location.pathname);
      window.location.reload();
    };

    void exchange();
  }, [nonce]);

  return (
    <main className="tracking-page" id="contenido">
      <section className="config-panel" aria-live="polite">
        <Logo />
        <div className="skeleton-lines" aria-hidden="true"><span /><span /><span /></div>
        <p>{message}</p>
      </section>
    </main>
  );
}
