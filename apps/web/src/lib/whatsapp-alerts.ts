import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { statusLabel, type OrderStatus } from "../domain/order";
import {
  formatWhatsAppOrderLine,
  formatWhatsAppOrderMessage,
} from "../../../../supabase/functions/process-deliveries/whatsapp-message";

const CHALLENGE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const WHATSAPP_PHONE_PATTERN = /^\d{7,20}$/;
const WHATSAPP_BSUID_PATTERN = /^([A-Za-z]{2})\.([A-Za-z0-9]{1,128})$/;

export type CommercialConsentDecision = "GRANTED" | "DECLINED" | "REVOKED";

export function createWhatsAppCode(length = 6): string {
  const bytes = randomBytes(length);
  return Array.from(
    bytes,
    (value) => CHALLENGE_ALPHABET[value % CHALLENGE_ALPHABET.length],
  ).join("");
}

export type WhatsAppInboundIdentity = {
  recipientId: string;
  phoneNumber: string | null;
  businessScopedUserId: string | null;
};

export function normalizeWhatsAppPhoneNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\+?[0-9\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  return WHATSAPP_PHONE_PATTERN.test(digits) ? digits : null;
}

export function normalizeWhatsAppBusinessScopedUserId(
  value: string,
): string | null {
  const match = value.trim().match(WHATSAPP_BSUID_PATTERN);
  return match ? `${match[1].toUpperCase()}.${match[2]}` : null;
}

export function normalizeWhatsAppId(value: string): string | null {
  return (
    normalizeWhatsAppBusinessScopedUserId(value) ??
    normalizeWhatsAppPhoneNumber(value)
  );
}

export function resolveWhatsAppInboundIdentity(input: {
  recipientId?: string;
  waId?: string;
  phoneNumber?: string;
  businessScopedUserId?: string;
}): WhatsAppInboundIdentity | null {
  let phoneNumber = input.phoneNumber
    ? normalizeWhatsAppPhoneNumber(input.phoneNumber)
    : null;
  let businessScopedUserId = input.businessScopedUserId
    ? normalizeWhatsAppBusinessScopedUserId(input.businessScopedUserId)
    : null;
  const requestedRecipient = input.recipientId ?? input.waId;
  const normalizedRecipient = requestedRecipient
    ? normalizeWhatsAppId(requestedRecipient)
    : null;
  if (requestedRecipient && !normalizedRecipient) return null;

  if (normalizedRecipient && !phoneNumber && !businessScopedUserId) {
    businessScopedUserId =
      normalizeWhatsAppBusinessScopedUserId(normalizedRecipient);
    phoneNumber = businessScopedUserId
      ? null
      : normalizeWhatsAppPhoneNumber(normalizedRecipient);
  }

  const recipientId =
    normalizedRecipient ?? businessScopedUserId ?? phoneNumber;

  if (!recipientId) return null;
  if (phoneNumber || businessScopedUserId) {
    if (recipientId !== phoneNumber && recipientId !== businessScopedUserId)
      return null;
  }

  return { recipientId, phoneNumber, businessScopedUserId };
}

export function createWhatsAppLaunchUrl(
  phoneNumber: string,
  code: string,
): string {
  const normalized = normalizeWhatsAppPhoneNumber(phoneNumber);
  if (!normalized) throw new Error("WHATSAPP_NUMBER_INVALID");
  const url = new URL(`https://wa.me/${normalized}`);
  url.searchParams.set("text", `ACTIVAR ${code}`);
  return url.toString();
}

export function signIntegrationBody(
  body: string,
  timestamp: string,
  secret: string,
): string {
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
  const timestampMs =
    timestamp.length === 10 ? numericTimestamp * 1000 : numericTimestamp;
  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS
  )
    return false;
  const expected = Buffer.from(signIntegrationBody(body, timestamp, secret));
  const received = Buffer.from(signature);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export function activationMessages(input: {
  contactContextId: string;
  orderNumber: string;
  restaurantName: string;
  status: OrderStatus;
  commercialConsentDecision: CommercialConsentDecision | null;
}) {
  const messages: Array<
    | { kind: "TEXT"; text: string }
    | {
        kind: "CONSENT_PROMPT";
        contextId: string;
        controller: "TOQUETIN";
        text: string;
      }
  > = [
    {
      kind: "TEXT",
      text: `✅ *Avisos activos*\n\n${formatWhatsAppOrderLine(input)}\nEstado actual: *${statusLabel(input.status)}*`,
    },
  ];

  if (!input.commercialConsentDecision) {
    messages.push({
      kind: "CONSENT_PROMPT",
      contextId: input.contactContextId,
      controller: "TOQUETIN",
      text: "¿Aceptas recibir novedades comerciales de *ToqueTin y sus restaurantes aliados*?\n\nEsto no afecta los avisos de tu pedido.",
    });
  }

  return messages;
}

export function statusMessage(payload: Record<string, unknown>): string {
  return formatWhatsAppOrderMessage(payload);
}

export function consentDecisionMessage(
  decision: CommercialConsentDecision,
): string {
  if (decision === "GRANTED") {
    return "✅ *Preferencias guardadas*\n\nRecibirás novedades de ToqueTin y sus restaurantes aliados. Puedes cambiar esta elección cuando quieras.";
  }
  if (decision === "DECLINED") {
    return "👍 *Entendido*\n\nSeguirás recibiendo únicamente los avisos de este pedido.";
  }
  return "✅ *Preferencia actualizada*\n\nDejaste de recibir novedades comerciales.";
}

export function optOutMessage(): string {
  return "✅ *Avisos desactivados*\n\nNo recibirás más mensajes de ToqueTin por WhatsApp.";
}
