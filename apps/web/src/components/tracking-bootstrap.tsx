"use client";

import { useEffect, useState } from "react";
import { iosTrackingURL, isIOSDevice } from "../lib/ios-deep-link";
import { Logo } from "./logo";

export function TrackingBootstrap({ nonce }: { nonce: string }) {
  const [message, setMessage] = useState("Validando tu pedido…");
  const [appURL, setAppURL] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const trackingToken = window.location.hash.slice(1);
    if (!trackingToken) {
      queueMicrotask(() => setMessage("Este enlace no contiene un acceso válido. Solicita el QR nuevamente."));
      return;
    }

    if (isIOSDevice(window.navigator)) {
      queueMicrotask(() => {
        setToken(trackingToken);
        setAppURL(iosTrackingURL(nonce, trackingToken));
        setMessage("Elige cómo quieres seguir tu pedido.");
      });
      return;
    }

    void exchangeTracking(nonce, trackingToken, setMessage);
  }, [nonce]);

  const continueOnWeb = () => {
    if (!token) return;
    setAppURL(null);
    setMessage("Validando tu pedido…");
    void exchangeTracking(nonce, token, setMessage);
  };

  return (
    <main className="tracking-page" id="contenido">
      <section className="config-panel" aria-live="polite">
        <Logo />
        {!appURL && <div className="skeleton-lines" aria-hidden="true"><span /><span /><span /></div>}
        <p>{message}</p>
        {appURL && (
          <div className="ios-open-actions">
            <a className="button button-accent" href={appURL}>Abrir en ToqueTin</a>
            <button className="button button-quiet" type="button" onClick={continueOnWeb}>Continuar en el navegador</button>
            <p className="ios-open-help">Si ToqueTin no está instalada, continúa en el navegador.</p>
          </div>
        )}
      </section>
    </main>
  );
}

async function exchangeTracking(
  nonce: string,
  token: string,
  setMessage: (message: string) => void,
) {
  try {
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
  } catch {
    setMessage("No pudimos abrir este seguimiento. Solicita el QR nuevamente.");
  }
}
