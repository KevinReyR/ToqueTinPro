import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { deliveryChannelSchema } from "@/domain/order";
import { createAdminClient } from "@/lib/supabase/server";
import { encryptDeliveryToken, tokenDigest } from "@/lib/delivery-token";
import { verifyTrackingToken } from "@/lib/tracking-token";

const registrationSchema = z.object({
  nonce: z.uuid(),
  channel: deliveryChannelSchema,
  token: z.string().min(16).max(8192),
  capabilities: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).default({}),
});

export async function POST(request: Request) {
  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  const secret = process.env.TRACKING_TOKEN_SECRET;
  const encryptionKey = process.env.DELIVERY_TOKEN_ENCRYPTION_KEY;
  const grant = (await cookies()).get("tt_tracking_grant")?.value;
  if (!parsed.success || !secret || !encryptionKey || !grant) return unauthorized();
  const verified = verifyTrackingToken(grant, secret);
  if (!verified || verified.nonce !== parsed.data.nonce) return unauthorized();

  const client = createAdminClient();
  const { data: session } = await client
    .from("tracking_sessions")
    .select("id, revoked_at, expires_at")
    .eq("public_nonce", parsed.data.nonce)
    .maybeSingle();
  if (!session || session.revoked_at) return unauthorized();

  const digest = tokenDigest(parsed.data.token);
  const { data, error } = await client.rpc("register_delivery_channel", {
    requested_tracking_session_id: session.id,
    requested_channel: parsed.data.channel,
    requested_ciphertext: encryptDeliveryToken(parsed.data.token, encryptionKey),
    requested_digest: digest,
    requested_capabilities: parsed.data.capabilities,
    requested_expires_at: session.expires_at,
  });
  if (error) {
    console.error("Delivery channel registration failed", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ code: "DELIVERY_REGISTRATION_FAILED" }, { status: 500 });
  }
  return NextResponse.json(Array.isArray(data) ? data[0] : data, { status: 201 });
}

function unauthorized() {
  return NextResponse.json({ code: "TRACKING_INVALID" }, { status: 404 });
}
