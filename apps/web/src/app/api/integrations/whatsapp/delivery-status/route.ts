import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyIntegrationSignature } from "@/lib/whatsapp-alerts";

const deliveryStatusSchema = z.object({
  attemptId: z.number().int().positive(),
  providerMessageId: z.string().min(1).max(240),
  status: z.enum(["accepted", "sent", "delivered", "read", "failed"]),
  occurredAt: z.iso.datetime({ offset: true }),
});

export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-toquetin-timestamp");
  const signature = request.headers.get("x-toquetin-signature");
  const eventId = request.headers.get("x-toquetin-event-id");
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret || !eventId || !verifyIntegrationSignature(rawBody, timestamp, signature, secret)) {
    return NextResponse.json({ code: "INVALID_SIGNATURE" }, { status: 401 });
  }
  let payload: unknown = null;
  try { payload = JSON.parse(rawBody); } catch { /* Invalid JSON is handled by the schema. */ }
  const parsed = deliveryStatusSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ code: "INVALID_EVENT" }, { status: 400 });

  const client = createAdminClient();
  const receivedAt = new Date(Number(timestamp) * (timestamp?.length === 10 ? 1000 : 1)).toISOString();
  const { data: claimed } = await client.rpc("claim_integration_webhook_event", {
    requested_source: "N8N_WHATSAPP_STATUS",
    requested_event_id: eventId,
    requested_received_at: receivedAt,
  });
  if (!claimed) return NextResponse.json({ code: "REPLAY_DETECTED" }, { status: 409 });

  const { data, error } = await client.rpc("record_whatsapp_delivery_status", {
    requested_attempt_id: parsed.data.attemptId,
    requested_provider_message_id: parsed.data.providerMessageId,
    requested_status: parsed.data.status,
    requested_occurred_at: parsed.data.occurredAt,
  });
  if (error || !data) return NextResponse.json({ code: "ATTEMPT_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
