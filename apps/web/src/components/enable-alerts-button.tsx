"use client";

import { useState } from "react";

function decodeKey(value: string): Uint8Array<ArrayBuffer> {
  const normalized = `${value}${"=".repeat((4 - value.length % 4) % 4)}`.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(window.atob(normalized), (character) => character.charCodeAt(0));
}

export function EnableAlertsButton({ nonce }: { nonce: string }) {
  const [state, setState] = useState<"idle" | "working" | "enabled" | "unavailable">("idle");

  async function enable() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !publicKey) {
      setState("unavailable");
      return;
    }
    setState("working");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") { setState("unavailable"); return; }
    const registration = await navigator.serviceWorker.register("/sw.js");
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
    const json = subscription.toJSON();
    const response = await fetch("/api/delivery-channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce, channel: "WEB_PUSH", token: subscription.endpoint, capabilities: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } }),
    });
    setState(response.ok ? "enabled" : "unavailable");
  }

  if (state === "enabled") return <p className="alerts-result">Avisos activados para este pedido</p>;
  if (state === "unavailable") return <p className="alerts-result">Los avisos no están disponibles. El seguimiento seguirá funcionando aquí.</p>;
  return <button className="button button-quiet alerts-button" disabled={state === "working"} onClick={() => void enable()} type="button">{state === "working" ? "Activando…" : "Avísame cuando esté listo"}</button>;
}
