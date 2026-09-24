"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChannelStatus = "AVAILABLE" | "ACTIVATING" | "ACTIVE" | "BLOCKED" | "UNAVAILABLE" | "COMING_SOON" | "WAITING";
type ChannelName = "WEB_PUSH" | "WHATSAPP";
type ActiveChannel = { publicId: string; channel: ChannelName; expiresAt: string | null };

const statusCopy: Record<ChannelStatus, string> = {
  AVAILABLE: "Disponible",
  ACTIVATING: "Activando",
  ACTIVE: "Activo",
  BLOCKED: "Bloqueado",
  UNAVAILABLE: "No disponible",
  COMING_SOON: "Próximamente",
  WAITING: "Confirma el mensaje en WhatsApp",
};

function decodeKey(value: string): Uint8Array<ArrayBuffer> {
  const normalized = `${value}${"=".repeat((4 - value.length % 4) % 4)}`.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(window.atob(normalized), (character) => character.charCodeAt(0));
}

function browserAvailability(): ChannelStatus {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "UNAVAILABLE";
  return Notification.permission === "denied" ? "BLOCKED" : "AVAILABLE";
}

export function NotificationChannelSelector({ nonce, preview = false }: { nonce: string; preview?: boolean }) {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<ActiveChannel[]>([]);
  const [browserStatus, setBrowserStatus] = useState<ChannelStatus>("AVAILABLE");
  const [whatsAppStatus, setWhatsAppStatus] = useState<ChannelStatus>("AVAILABLE");
  const [message, setMessage] = useState<string>();
  const [challengeExpiresAt, setChallengeExpiresAt] = useState<string>();
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const refreshChannels = useCallback(async () => {
    if (preview) return false;
    try {
      const response = await fetch(`/api/alerts/channels?nonce=${encodeURIComponent(nonce)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("CHANNELS_UNAVAILABLE");
      const result = await response.json() as { channels: ActiveChannel[] };
      setChannels(result.channels);
      const hasBrowser = result.channels.some((channel) => channel.channel === "WEB_PUSH");
      const hasWhatsApp = result.channels.some((channel) => channel.channel === "WHATSAPP");
      setBrowserStatus(hasBrowser ? "ACTIVE" : browserAvailability());
      setWhatsAppStatus(hasWhatsApp ? "ACTIVE" : (current) => current === "WAITING" ? current : "AVAILABLE");
      if (hasWhatsApp) setChallengeExpiresAt(undefined);
      return hasWhatsApp;
    } catch {
      setMessage("No pudimos consultar tus avisos. El seguimiento continúa disponible.");
      return false;
    }
  }, [nonce, preview]);

  useEffect(() => {
    if (preview) return;
    const timer = window.setTimeout(() => void refreshChannels(), 0);
    return () => window.clearTimeout(timer);
  }, [preview, refreshChannels]);

  useEffect(() => {
    if (!challengeExpiresAt || whatsAppStatus !== "WAITING") return;
    const refresh = () => {
      if (Date.now() >= Date.parse(challengeExpiresAt)) {
        setChallengeExpiresAt(undefined);
        setWhatsAppStatus("AVAILABLE");
        setMessage("El código venció. Puedes generar uno nuevo.");
        return;
      }
      void refreshChannels();
    };
    const timer = window.setInterval(refresh, 3_000);
    const handleVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [challengeExpiresAt, refreshChannels, whatsAppStatus]);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => sheetRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [open]);

  async function activateBrowser() {
    if (preview) {
      setChannels((current) => [...current.filter((channel) => channel.channel !== "WEB_PUSH"), { publicId: "preview-browser", channel: "WEB_PUSH", expiresAt: null }]);
      setBrowserStatus("ACTIVE");
      setMessage("Vista previa: avisos del navegador activados.");
      return;
    }
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (browserAvailability() === "UNAVAILABLE") { setBrowserStatus("UNAVAILABLE"); return; }
    if (browserAvailability() === "BLOCKED") { setBrowserStatus("BLOCKED"); return; }
    if (!publicKey) { setMessage("Los avisos del navegador todavía no están configurados."); return; }
    try {
      setBrowserStatus("ACTIVATING");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setBrowserStatus("BLOCKED"); return; }
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
      const serialized = subscription.toJSON();
      const response = await fetch("/api/delivery-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce,
          channel: "WEB_PUSH",
          token: subscription.endpoint,
          capabilities: { p256dh: serialized.keys?.p256dh ?? "", auth: serialized.keys?.auth ?? "" },
        }),
      });
      if (!response.ok) throw new Error("REGISTRATION_FAILED");
      await refreshChannels();
      setMessage("Avisos del navegador activados.");
    } catch {
      setBrowserStatus(browserAvailability());
      setMessage("No pudimos activar el navegador. Puedes seguir el pedido aquí.");
    }
  }

  async function activateWhatsApp() {
    if (preview) {
      setWhatsAppStatus("WAITING");
      setMessage("Vista previa: confirma el mensaje en WhatsApp para completar la activación.");
      return;
    }
    const placeholder = window.open("about:blank", "_blank");
    try {
      setWhatsAppStatus("ACTIVATING");
      const response = await fetch("/api/alerts/whatsapp/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce }),
      });
      const result = await response.json() as { launchUrl?: string; expiresAt?: string; code?: string };
      if (!response.ok || !result.launchUrl || !result.expiresAt) throw new Error(result.code ?? "CHALLENGE_FAILED");
      setChallengeExpiresAt(result.expiresAt);
      setWhatsAppStatus("WAITING");
      setMessage("Envía el mensaje preparado en WhatsApp. Al volver, confirmaremos la activación.");
      if (placeholder) placeholder.location.href = result.launchUrl;
      else window.location.href = result.launchUrl;
    } catch (error) {
      placeholder?.close();
      setWhatsAppStatus("AVAILABLE");
      setMessage(error instanceof Error && error.message === "PRIVACY_CONFIGURATION_REQUIRED"
        ? "WhatsApp estará disponible cuando terminemos la configuración de privacidad."
        : error instanceof Error && error.message === "WHATSAPP_CONFIGURATION_REQUIRED"
          ? "WhatsApp estará disponible cuando terminemos su conexión segura."
          : "No pudimos abrir WhatsApp. Inténtalo de nuevo.");
    }
  }

  async function disableChannel(channel: ActiveChannel) {
    setMessage(undefined);
    if (preview) {
      setChannels((current) => current.filter((candidate) => candidate.publicId !== channel.publicId));
      if (channel.channel === "WEB_PUSH") setBrowserStatus("AVAILABLE");
      if (channel.channel === "WHATSAPP") setWhatsAppStatus("AVAILABLE");
      setMessage("Vista previa: canal desactivado.");
      return;
    }
    const response = await fetch(`/api/delivery-channels/${channel.publicId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce }),
    });
    if (!response.ok) { setMessage("No pudimos desactivar este canal. Inténtalo de nuevo."); return; }
    if (channel.channel === "WEB_PUSH" && "serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await (await registration.pushManager.getSubscription())?.unsubscribe();
    }
    await refreshChannels();
    setMessage("Canal desactivado.");
  }

  const hasActiveChannel = channels.some((channel) => channel.channel === "WEB_PUSH" || channel.channel === "WHATSAPP");
  const browserChannel = channels.find((channel) => channel.channel === "WEB_PUSH");
  const whatsAppChannel = channels.find((channel) => channel.channel === "WHATSAPP");

  return (
    <>
      <button ref={triggerRef} className="button button-quiet alerts-button" disabled={!ready} onClick={() => { setOpen(true); if (!preview) void refreshChannels(); }} type="button">
        {hasActiveChannel ? "Gestionar avisos" : "Recibir avisos del pedido"}
      </button>
      {open && (
        <div className="alerts-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }} role="presentation">
          <div ref={sheetRef} className="alerts-sheet" role="dialog" aria-modal="true" aria-labelledby="alerts-title" aria-describedby="alerts-description">
            <div className="sheet-handle" aria-hidden="true" />
            <header className="alerts-sheet-header">
              <div>
                <p className="eyebrow">avisos del pedido</p>
                <h2 id="alerts-title">¿Dónde quieres recibir avisos?</h2>
                <p id="alerts-description">Puedes activar más de uno. Recibirás un aviso en cada canal activo.</p>
              </div>
              <button className="sheet-close" onClick={() => setOpen(false)} type="button" aria-label="Cerrar selector de avisos">×</button>
            </header>

            <div className="channel-list">
              <ChannelOption
                icon="◉"
                name="Navegador"
                description={browserStatus === "BLOCKED"
                  ? "Habilita las notificaciones en los permisos del navegador. En iPhone, añade ToqueTin a inicio."
                  : browserStatus === "UNAVAILABLE"
                    ? "Este navegador no admite avisos web; el seguimiento seguirá funcionando."
                    : "Notificaciones en este navegador, incluso si no estás mirando la página."}
                status={browserStatus}
                onActivate={() => void activateBrowser()}
                onDisable={browserChannel ? () => void disableChannel(browserChannel) : undefined}
              />
              <ChannelOption
                icon="T"
                name="App"
                description="Abrirá el pedido directamente en la app cuando esté disponible en las tiendas."
                status="COMING_SOON"
              />
              <ChannelOption
                icon="W"
                name="WhatsApp"
                description="Abre el WhatsApp oficial de ToqueTin y envía el mensaje preparado. El código vence en 10 minutos."
                status={whatsAppStatus}
                onActivate={() => void activateWhatsApp()}
                onDisable={whatsAppChannel ? () => void disableChannel(whatsAppChannel) : undefined}
              />
            </div>

            {message && <p className="alerts-feedback" role="status">{message}</p>}
            <p className="alerts-privacy">Activar un canal es opcional. Puedes desactivarlo cuando quieras y seguir viendo el pedido sin registrarte. <a href="/privacidad">Cómo tratamos tus datos</a>.</p>
            <button className="button button-quiet sheet-dismiss" onClick={() => setOpen(false)} type="button">Ahora no</button>
          </div>
        </div>
      )}
    </>
  );
}

function ChannelOption({
  icon,
  name,
  description,
  status,
  onActivate,
  onDisable,
}: {
  icon: string;
  name: string;
  description: string;
  status: ChannelStatus;
  onActivate?: () => void;
  onDisable?: () => void;
}) {
  const busy = status === "ACTIVATING";
  const actionable = status === "AVAILABLE" || status === "WAITING";
  return (
    <section className="channel-option" aria-label={`${name}: ${statusCopy[status]}`}>
      <span className={`channel-icon channel-icon-${name.toLowerCase()}`} aria-hidden="true">{icon}</span>
      <div className="channel-copy">
        <div className="channel-title-row"><h3>{name}</h3><span className={`channel-status channel-status-${status.toLowerCase()}`}>{statusCopy[status]}</span></div>
        <p>{description}</p>
      </div>
      {status === "ACTIVE" && onDisable && <button className="channel-action channel-action-muted" onClick={onDisable} type="button">Desactivar</button>}
      {actionable && onActivate && <button className="channel-action" onClick={onActivate} type="button">{status === "WAITING" ? "Abrir de nuevo" : "Activar"}</button>}
      {busy && <span className="channel-working" aria-hidden="true" />}
    </section>
  );
}
