import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { statusLabel, type OrderStatus } from "../domain/order";

const CHALLENGE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function createWhatsAppCode(length = 6): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (value) => CHALLENGE_ALPHABET[value % CHALLENGE_ALPHABET.length]).join("");
}

export function normalizeWhatsAppId(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return /^\d{7,20}$/.test(digits) ? digits : null;
}

export function createWhatsAppLaunchUrl(phoneNumber: string, code: string): string {
  const normalized = normalizeWhatsAppId(phoneNumber);
  if (!normalized) throw new Error("WHATSAPP_NUMBER_INVALID");
  const url = new URL(`https://wa.me/${normalized}`);
  url.searchParams.set("text", `ACTIVAR ${code}`);
  return url.toString();
}

export function signIntegrationBody(body: string, timestamp: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function verifyIntegrationSignature(
  body: string,
  timestamp: string | null,
  signature: string | null,
  secret: string,
  now = Date.now(),
): boolean {
  if (!timestamp || !signature || !/^\d{10,13}$/.test(timestamp)) return false;
  const numericTimestamp = Number(timestamp);
  const timestampMs = timestamp.length === 10 ? numericTimestamp * 1000 : numericTimestamp;
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS) return false;
  const expected = Buffer.from(signIntegrationBody(body, timestamp, secret));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function activationMessages(input: {
  contactContextId: string;
  orderNumber: string;
  restaurantName: string;
  status: OrderStatus;
}) {
  return [
    {
      kind: "TEXT",
      text: `ToqueTin: Avisos activos para el Pedido ${input.orderNumber} de ${input.restaurantName}. Estado actual: ${statusLabel(input.status)}.`,
    },
    {
      kind: "CONSENT_PROMPT",
      contextId: input.contactContextId,
      controller: "RESTAURANT",
      text: `¿Aceptas recibir novedades comerciales de ${input.restaurantName}? Responde usando los botones Sí o No. Esto no afecta los avisos de tu pedido.`,
    },
  ] as const;
}

export function statusMessage(payload: Record<string, unknown>): string {
  const restaurantName = typeof payload.restaurantName === "string" ? payload.restaurantName : "el restaurante";
  const orderNumber = typeof payload.orderNumber === "string" ? payload.orderNumber : "";
  const status = typeof payload.status === "string" && ["RECEIVED", "PREPARING", "READY", "DELIVERED", "CANCELLED"].includes(payload.status)
    ? statusLabel(payload.status as OrderStatus)
    : "Actualizado";
  const instruction = payload.status === "READY" ? " Ya puedes acercarte a recogerlo." : "";
  return `ToqueTin · ${restaurantName} · Pedido ${orderNumber}: ${status}.${instruction}`;
}
