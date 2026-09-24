import { describe, expect, it } from "vitest";
import {
  activationMessages,
  consentDecisionMessage,
  createWhatsAppCode,
  createWhatsAppLaunchUrl,
  normalizeWhatsAppBusinessScopedUserId,
  normalizeWhatsAppId,
  normalizeWhatsAppPhoneNumber,
  optOutMessage,
  resolveWhatsAppInboundIdentity,
  signIntegrationBody,
  statusMessage,
  verifyIntegrationSignature,
} from "./whatsapp-alerts";

describe("WhatsApp activation", () => {
  it("creates an opaque code and a prepared wa.me link", () => {
    const code = createWhatsAppCode();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(createWhatsAppLaunchUrl("+57 300 123 4567", code)).toContain(
      `text=ACTIVAR+${code}`,
    );
  });

  it("normalizes identifiers without accepting malformed values", () => {
    expect(normalizeWhatsAppId("+57 300-123-4567")).toBe("573001234567");
    expect(normalizeWhatsAppId("CO.1794829331833954")).toBe(
      "CO.1794829331833954",
    );
    expect(normalizeWhatsAppPhoneNumber("CO.1794829331833954")).toBeNull();
    expect(normalizeWhatsAppBusinessScopedUserId("co.1794829331833954")).toBe(
      "CO.1794829331833954",
    );
    expect(normalizeWhatsAppId("123")).toBeNull();
    expect(normalizeWhatsAppBusinessScopedUserId("CO.invalid-id")).toBeNull();
  });

  it("resolves phone and business-scoped identifiers without losing aliases", () => {
    expect(
      resolveWhatsAppInboundIdentity({
        recipientId: "CO.1794829331833954",
        phoneNumber: "573001234567",
        businessScopedUserId: "CO.1794829331833954",
      }),
    ).toEqual({
      recipientId: "CO.1794829331833954",
      phoneNumber: "573001234567",
      businessScopedUserId: "CO.1794829331833954",
    });

    expect(
      resolveWhatsAppInboundIdentity({ waId: "+57 300 123 4567" }),
    ).toEqual({
      recipientId: "573001234567",
      phoneNumber: "573001234567",
      businessScopedUserId: null,
    });

    expect(
      resolveWhatsAppInboundIdentity({ recipientId: "CO.1794829331833954" }),
    ).toEqual({
      recipientId: "CO.1794829331833954",
      phoneNumber: null,
      businessScopedUserId: "CO.1794829331833954",
    });

    expect(
      resolveWhatsAppInboundIdentity({
        recipientId: "573001234567",
        businessScopedUserId: "CO.1794829331833954",
      }),
    ).toBeNull();
  });

  it("validates signatures and rejects stale timestamps", () => {
    const body = JSON.stringify({ kind: "OPT_IN" });
    const secret = "test-secret-that-is-long-enough";
    const now = Date.parse("2026-09-23T18:00:00.000Z");
    const timestamp = String(Math.floor(now / 1000));
    const signature = signIntegrationBody(body, timestamp, secret);
    expect(
      verifyIntegrationSignature(body, timestamp, signature, secret, now),
    ).toBe(true);
    expect(
      verifyIntegrationSignature(`${body}x`, timestamp, signature, secret, now),
    ).toBe(false);
    expect(
      verifyIntegrationSignature(
        body,
        String(Math.floor((now - 6 * 60_000) / 1000)),
        signature,
        secret,
        now,
      ),
    ).toBe(false);
  });

  it("formats activation and combined commercial consent exactly", () => {
    const messages = activationMessages({
      contactContextId: "context",
      restaurantName: "RestaurantePrueba",
      orderNumber: "143",
      status: "RECEIVED",
      commercialConsentDecision: null,
    });

    expect(messages).toEqual([
      {
        kind: "TEXT",
        text: "✅ *Avisos activos*\n\n*Pedido 143 · RestaurantePrueba*\nEstado actual: *Recibido*",
      },
      {
        kind: "CONSENT_PROMPT",
        contextId: "context",
        controller: "TOQUETIN",
        text: "¿Aceptas recibir novedades comerciales de *ToqueTin y sus restaurantes aliados*?\n\nEsto no afecta los avisos de tu pedido.",
      },
    ]);
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

describe("WhatsApp order messages", () => {
  const basePayload = {
    restaurantName: "RestaurantePrueba",
    orderNumber: "143",
  };

  it("formats RECEIVED", () => {
    expect(statusMessage({ ...basePayload, status: "RECEIVED" })).toBe(
      "✅ *Pedido recibido*\n\n*Pedido 143 · RestaurantePrueba*\nTu pedido ya está en seguimiento.",
    );
  });

  it("formats PREPARING with a rounded-up future estimate", () => {
    expect(
      statusMessage({
        ...basePayload,
        status: "PREPARING",
        serverTime: "2026-09-24T15:00:00.000Z",
        estimatedReadyAt: "2026-09-24T15:03:01.000Z",
      }),
    ).toBe(
      "👨‍🍳 *Ya estamos preparando tu pedido*\n\n*Pedido 143 · RestaurantePrueba*\nAproximadamente *~4 min*",
    );
  });

  it("uses Casi listo for an expired estimate", () => {
    expect(
      statusMessage({
        ...basePayload,
        status: "PREPARING",
        serverTime: "2026-09-24T15:04:00.000Z",
        estimatedReadyAt: "2026-09-24T15:03:00.000Z",
      }),
    ).toBe(
      "👨‍🍳 *Ya estamos preparando tu pedido*\n\n*Pedido 143 · RestaurantePrueba*\n*Casi listo*",
    );
  });

  it.each([
    {},
    { serverTime: "invalid", estimatedReadyAt: "2026-09-24T15:03:00.000Z" },
    { serverTime: "2026-09-24T15:00:00.000Z", estimatedReadyAt: "invalid" },
  ])("omits an unavailable or invalid estimate", (estimate) => {
    expect(
      statusMessage({ ...basePayload, status: "PREPARING", ...estimate }),
    ).toBe(
      "👨‍🍳 *Ya estamos preparando tu pedido*\n\n*Pedido 143 · RestaurantePrueba*",
    );
  });

  it("formats READY with the default pickup instruction", () => {
    expect(statusMessage({ ...basePayload, status: "READY" })).toBe(
      "🔔 *¡Tu pedido está listo!*\n\n*Pedido 143 · RestaurantePrueba*\nAcércate al mostrador para recogerlo.",
    );
  });

  it("prefers and sanitizes the configured pickup instruction", () => {
    expect(
      statusMessage({
        ...basePayload,
        restaurantName: "Restaurante *Prueba*_~`",
        status: "READY",
        pickupInstructions: "Busca el mostrador *azul*\n_y pregunta por Kevin_",
      }),
    ).toBe(
      "🔔 *¡Tu pedido está listo!*\n\n*Pedido 143 · Restaurante Prueba*\nBusca el mostrador azul y pregunta por Kevin",
    );
  });

  it("formats DELIVERED", () => {
    expect(statusMessage({ ...basePayload, status: "DELIVERED" })).toBe(
      "✅ *Pedido entregado*\n\n*Pedido 143 · RestaurantePrueba*\n¡Gracias por elegirnos! Buen provecho.",
    );
  });

  it("formats CANCELLED with a sanitized reason", () => {
    expect(
      statusMessage({
        ...basePayload,
        status: "CANCELLED",
        cancellationReason: "Producto *no* disponible\n~hoy~",
      }),
    ).toBe(
      "⚠️ *Pedido cancelado*\n\n*Pedido 143 · RestaurantePrueba*\nMotivo: Producto no disponible hoy\n\nSi necesitas ayuda, acércate al mostrador.",
    );
  });

  it("omits an unavailable cancellation reason", () => {
    expect(statusMessage({ ...basePayload, status: "CANCELLED" })).toBe(
      "⚠️ *Pedido cancelado*\n\n*Pedido 143 · RestaurantePrueba*\nSi necesitas ayuda, acércate al mostrador.",
    );
  });
});

describe("WhatsApp consent responses", () => {
  it("uses a warm response for every commercial consent decision", () => {
    expect(consentDecisionMessage("GRANTED")).toBe(
      "✅ *Preferencias guardadas*\n\nRecibirás novedades de ToqueTin y sus restaurantes aliados. Puedes cambiar esta elección cuando quieras.",
    );
    expect(consentDecisionMessage("DECLINED")).toBe(
      "👍 *Entendido*\n\nSeguirás recibiendo únicamente los avisos de este pedido.",
    );
    expect(consentDecisionMessage("REVOKED")).toBe(
      "✅ *Preferencia actualizada*\n\nDejaste de recibir novedades comerciales.",
    );
  });

  it("confirms the total opt-out", () => {
    expect(optOutMessage()).toBe(
      "✅ *Avisos desactivados*\n\nNo recibirás más mensajes de ToqueTin por WhatsApp.",
    );
  });
});
