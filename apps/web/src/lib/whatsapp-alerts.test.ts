import { describe, expect, it } from "vitest";
import {
  activationMessages,
  createWhatsAppCode,
  createWhatsAppLaunchUrl,
  normalizeWhatsAppId,
  signIntegrationBody,
  statusMessage,
  verifyIntegrationSignature,
} from "./whatsapp-alerts";

describe("WhatsApp activation", () => {
  it("creates an opaque code and a prepared wa.me link", () => {
    const code = createWhatsAppCode();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(createWhatsAppLaunchUrl("+57 300 123 4567", code)).toContain(`text=ACTIVAR+${code}`);
  });

  it("normalizes identifiers without accepting malformed values", () => {
    expect(normalizeWhatsAppId("+57 300-123-4567")).toBe("573001234567");
    expect(normalizeWhatsAppId("123")).toBeNull();
  });

  it("validates signatures and rejects stale timestamps", () => {
    const body = JSON.stringify({ kind: "OPT_IN" });
    const secret = "test-secret-that-is-long-enough";
    const now = Date.parse("2026-09-23T18:00:00.000Z");
    const timestamp = String(Math.floor(now / 1000));
    const signature = signIntegrationBody(body, timestamp, secret);
    expect(verifyIntegrationSignature(body, timestamp, signature, secret, now)).toBe(true);
    expect(verifyIntegrationSignature(`${body}x`, timestamp, signature, secret, now)).toBe(false);
    expect(verifyIntegrationSignature(body, String(Math.floor((now - 6 * 60_000) / 1000)), signature, secret, now)).toBe(false);
  });

  it("identifies ToqueTin, the restaurant, order and state", () => {
    expect(statusMessage({ restaurantName: "RestaurantePrueba", orderNumber: "143", status: "READY" }))
      .toBe("ToqueTin · RestaurantePrueba · Pedido 143: Listo para recoger. Ya puedes acercarte a recogerlo.");
    expect(activationMessages({
      contactContextId: "context",
      restaurantName: "RestaurantePrueba",
      orderNumber: "143",
      status: "RECEIVED",
      commercialConsentDecision: null,
    })[0].text)
      .toContain("Avisos activos para el Pedido 143 de RestaurantePrueba");
  });

  it("asks once for a combined commercial consent", () => {
    const messages = activationMessages({
      contactContextId: "context",
      restaurantName: "RestaurantePrueba",
      orderNumber: "143",
      status: "RECEIVED",
      commercialConsentDecision: null,
    });

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      kind: "CONSENT_PROMPT",
      controller: "TOQUETIN",
      text: expect.stringContaining("ToqueTin y sus restaurantes aliados"),
    });
  });

  it.each(["GRANTED", "DECLINED", "REVOKED"] as const)(
    "does not ask again when the commercial decision is %s",
    (commercialConsentDecision) => {
      const messages = activationMessages({
        contactContextId: "context",
        restaurantName: "RestaurantePrueba",
        orderNumber: "144",
        status: "RECEIVED",
        commercialConsentDecision,
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].kind).toBe("TEXT");
    },
  );
});
