export type WhatsAppOrderStatus = "RECEIVED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";

export type WhatsAppOrderMessageInput = {
  restaurantName?: unknown;
  orderNumber?: unknown;
  status?: unknown;
  estimatedReadyAt?: unknown;
  serverTime?: unknown;
  pickupInstructions?: unknown;
  cancellationReason?: unknown;
};

const STATUS_VALUES = new Set<WhatsAppOrderStatus>([
  "RECEIVED",
  "PREPARING",
  "READY",
  "DELIVERED",
  "CANCELLED",
]);

export function sanitizeWhatsAppText(value: unknown, fallback = ""): string {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const sanitized = String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized || fallback;
}

export function formatWhatsAppOrderLine(input: Pick<WhatsAppOrderMessageInput, "orderNumber" | "restaurantName">): string {
  const orderNumber = sanitizeWhatsAppText(input.orderNumber, "—");
  const restaurantName = sanitizeWhatsAppText(input.restaurantName, "el restaurante");
  return `*Pedido ${orderNumber} · ${restaurantName}*`;
}

export function formatWhatsAppOrderMessage(input: WhatsAppOrderMessageInput): string {
  const status = isWhatsAppOrderStatus(input.status) ? input.status : null;
  const orderLine = formatWhatsAppOrderLine(input);

  switch (status) {
    case "RECEIVED":
      return `✅ *Pedido recibido*\n\n${orderLine}\nTu pedido ya está en seguimiento.`;
    case "PREPARING": {
      const estimateLine = formatEstimateLine(input.estimatedReadyAt, input.serverTime);
      return [`👨‍🍳 *Ya estamos preparando tu pedido*`, "", orderLine, estimateLine]
        .filter((line) => line !== null)
        .join("\n");
    }
    case "READY": {
      const pickupInstructions = sanitizeWhatsAppText(
        input.pickupInstructions,
        "Acércate al mostrador para recogerlo.",
      );
      return `🔔 *¡Tu pedido está listo!*\n\n${orderLine}\n${pickupInstructions}`;
    }
    case "DELIVERED":
      return `✅ *Pedido entregado*\n\n${orderLine}\n¡Gracias por elegirnos! Buen provecho.`;
    case "CANCELLED": {
      const cancellationReason = sanitizeWhatsAppText(input.cancellationReason);
      const reasonLine = cancellationReason ? `Motivo: ${cancellationReason}\n\n` : "";
      return `⚠️ *Pedido cancelado*\n\n${orderLine}\n${reasonLine}Si necesitas ayuda, acércate al mostrador.`;
    }
    default:
      return `ℹ️ *Pedido actualizado*\n\n${orderLine}`;
  }
}

function formatEstimateLine(estimatedReadyAt: unknown, serverTime: unknown): string | null {
  if (typeof estimatedReadyAt !== "string" || typeof serverTime !== "string") return null;
  const estimatedReadyAtMs = Date.parse(estimatedReadyAt);
  const serverTimeMs = Date.parse(serverTime);
  if (!Number.isFinite(estimatedReadyAtMs) || !Number.isFinite(serverTimeMs)) return null;
  const remainingMinutes = Math.ceil((estimatedReadyAtMs - serverTimeMs) / 60_000);
  return remainingMinutes > 0 ? `Aproximadamente *~${remainingMinutes} min*` : "*Casi listo*";
}

function isWhatsAppOrderStatus(value: unknown): value is WhatsAppOrderStatus {
  return typeof value === "string" && STATUS_VALUES.has(value as WhatsAppOrderStatus);
}
