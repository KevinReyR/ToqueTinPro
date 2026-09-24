import { NextResponse } from "next/server";
import { z } from "zod";
import { encryptDeliveryToken, tokenDigest } from "@/lib/delivery-token";
import { createAdminClient } from "@/lib/supabase/server";
import {
  activationMessages,
  consentDecisionMessage,
  normalizeWhatsAppId,
  optOutMessage,
  verifyIntegrationSignature,
} from "@/lib/whatsapp-alerts";

const inboundSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("OPT_IN"), code: z.string().regex(/^[A-Z2-9]{6}$/), waId: z.string().min(7).max(32) }),
  z.object({
    kind: z.literal("CONSENT"),
    waId: z.string().min(7).max(32),
    contextId: z.uuid(),
    controller: z.enum(["RESTAURANT", "TOQUETIN"]),
    decision: z.enum(["GRANTED", "DECLINED", "REVOKED"]),
    policyVersion: z.string().min(1).max(40),
  }),
  z.object({ kind: z.literal("STOP"), waId: z.string().min(7).max(32), scope: z.enum(["ORDER", "RESTAURANT", "TOQUETIN", "ALL"]).default("ALL") }),
]);

export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-toquetin-timestamp");
  const signature = request.headers.get("x-toquetin-signature");
  const eventId = request.headers.get("x-toquetin-event-id");
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret || !eventId || !verifyIntegrationSignature(rawBody, timestamp, signature, secret)) return unauthorized();

  const parsed = inboundSchema.safeParse(parseJson(rawBody));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_EVENT" }, { status: 400 });
  const waId = normalizeWhatsAppId(parsed.data.waId);
  const encryptionKey = process.env.DELIVERY_TOKEN_ENCRYPTION_KEY;
  if (!waId || !encryptionKey) return NextResponse.json({ code: "INVALID_EVENT" }, { status: 400 });

  const client = createAdminClient();
  const receivedAt = new Date(Number(timestamp) * (timestamp?.length === 10 ? 1000 : 1)).toISOString();
  const { data: claimed } = await client.rpc("claim_integration_webhook_event", {
    requested_source: "N8N_WHATSAPP_INBOUND",
    requested_event_id: eventId,
    requested_received_at: receivedAt,
  });
  if (!claimed) return NextResponse.json({ code: "REPLAY_DETECTED" }, { status: 409 });

  if (parsed.data.kind === "OPT_IN") {
    const { data, error } = await client.rpc("consume_whatsapp_challenge", {
      requested_code_digest: tokenDigest(parsed.data.code),
      requested_whatsapp_ciphertext: encryptDeliveryToken(waId, encryptionKey),
      requested_whatsapp_digest: tokenDigest(waId),
      requested_policy_version: process.env.PRIVACY_POLICY_VERSION ?? "2026-09-23",
    });
    if (error || !data) return NextResponse.json({ code: "CHALLENGE_INVALID" }, { status: 422 });
    const activation = data as {
      contactContextId: string;
      orderNumber: string;
      restaurantName: string;
      status: "RECEIVED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";
      commercialConsentDecision: "GRANTED" | "DECLINED" | "REVOKED" | null;
    };
    return NextResponse.json({ ok: true, messages: activationMessages(activation) });
  }

  if (parsed.data.kind === "CONSENT") {
    const { error } = await client.rpc("record_whatsapp_consent", {
      requested_context_id: parsed.data.contextId,
      requested_whatsapp_digest: tokenDigest(waId),
      requested_controller: "TOQUETIN",
      requested_decision: parsed.data.decision,
      requested_policy_version: parsed.data.policyVersion,
    });
    if (error) return NextResponse.json({ code: "CONSENT_INVALID" }, { status: 422 });
    return NextResponse.json({
      ok: true,
      messages: [{ kind: "TEXT", text: consentDecisionMessage(parsed.data.decision) }],
    });
  }

  const { error } = await client.rpc("revoke_whatsapp_contact", {
    requested_whatsapp_digest: tokenDigest(waId),
    requested_scope: parsed.data.scope,
  });
  if (error) return NextResponse.json({ code: "REVOCATION_FAILED" }, { status: 500 });
  if (parsed.data.scope === "ALL") await client.rpc("cleanup_expired_whatsapp_contacts");
  return NextResponse.json({ ok: true, messages: [{ kind: "TEXT", text: optOutMessage() }] });
}

function unauthorized() {
  return NextResponse.json({ code: "INVALID_SIGNATURE" }, { status: 401 });
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}
