"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { etaPresentation } from "@/domain/eta";
import { statusLabel, statusStep, type PublicTrackingSnapshot } from "@/domain/order";
import { Logo } from "./logo";
import { EnableAlertsButton } from "./enable-alerts-button";

const stages = ["Recibido", "Preparando", "Listo", "Entregado"];

export function TrackingExperience({ snapshot: initialSnapshot, nonce }: { snapshot: PublicTrackingSnapshot; nonce?: string }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [now, setNow] = useState(() => new Date(initialSnapshot.serverTime));
  const [connected, setConnected] = useState(true);
  const previousStatus = useRef(initialSnapshot.status);
  const clockOffset = useRef(0);

  useEffect(() => {
    clockOffset.current = new Date(initialSnapshot.serverTime).getTime() - Date.now();
    const timer = window.setInterval(() => setNow(new Date(Date.now() + clockOffset.current)), 30_000);
    return () => window.clearInterval(timer);
  }, [initialSnapshot.serverTime]);

  useEffect(() => {
    if (!nonce) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/tracking/${nonce}`, { cache: "no-store" });
        if (!response.ok) throw new Error("TRACKING_UNAVAILABLE");
        const next = await response.json() as PublicTrackingSnapshot;
        if (!active) return;
        setConnected(true);
        clockOffset.current = new Date(next.serverTime).getTime() - Date.now();
        setSnapshot((current) => next.version >= current.version ? next : current);
        if (previousStatus.current !== "READY" && next.status === "READY") navigator.vibrate?.([180, 80, 180]);
        previousStatus.current = next.status;
      } catch {
        if (active) setConnected(false);
      }
    };
    const timer = window.setInterval(() => void refresh(), 10_000);
    const handleVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", handleVisibility); };
  }, [nonce]);

  const eta = useMemo(
    () => etaPresentation(snapshot.status, snapshot.estimatedReadyAt, now),
    [snapshot.status, snapshot.estimatedReadyAt, now],
  );
  const step = statusStep(snapshot.status);

  return (
    <main className="tracking-page" id="contenido">
      <article className="tracking-card" aria-live="polite">
        <header className="tracking-header">
          <Logo />
          <span className={`connection ${connected ? "" : "connection-offline"}`}><span className="status-dot" /> {connected ? "En vivo" : "Reconectando"}</span>
        </header>
        <p className="eyebrow">{snapshot.restaurantName}</p>
        <p className="tracking-order">Pedido {snapshot.orderNumber}</p>
        <h1 className="tracking-status">{statusLabel(snapshot.status)}</h1>
        <p className="tracking-eta">{eta.label}</p>
        {snapshot.status !== "CANCELLED" && (
          <div className="stage-list" aria-label={`Etapa ${step} de 4`}>
            {stages.map((stage, index) => (
              <span className={`stage ${index < step ? "done" : ""}`} key={stage}>{stage}</span>
            ))}
          </div>
        )}
        {snapshot.pickupInstructions && (
          <p className="pickup"><span className="pickup-label">Al recoger</span>{snapshot.pickupInstructions}</p>
        )}
        {snapshot.status === "CANCELLED" && snapshot.cancellationReason && (
          <p className="pickup"><span className="pickup-label">Motivo</span>{snapshot.cancellationReason}</p>
        )}
        <div className="live-confirmation">
          <span className="live-icon" aria-hidden="true">◉</span>
          <span>Seguimiento disponible en la pantalla bloqueada</span>
        </div>
        {nonce && <EnableAlertsButton nonce={nonce} />}
      </article>
    </main>
  );
}
