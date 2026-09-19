import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { encryptDeliveryToken, tokenDigest } from "@/lib/delivery-token";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyTrackingToken } from "@/lib/tracking-token";

const refreshSchema = z.object({ nonce: z.uuid(), token: z.string().min(16).max(8192) });
const disableSchema = z.object({ nonce: z.uuid() });

export async function PATCH(request: Request, context: { params: Promise<{ publicId: string }> }) {
  const parsed = refreshSchema.safeParse(await request.json().catch(() => null));
  const { publicId } = await context.params;
  const session = await authorize(parsed.success ? parsed.data.nonce : "");
  const encryptionKey = process.env.DELIVERY_TOKEN_ENCRYPTION_KEY;
  if (!parsed.success || !z.uuid().safeParse(publicId).success || !session || !encryptionKey) return invalid();
  const client = createAdminClient();
  const { data, error } = await client.rpc("refresh_delivery_channel_token", {
    requested_public_id: publicId,
    requested_tracking_session_id: session.id,
    requested_ciphertext: encryptDeliveryToken(parsed.data.token, encryptionKey),
    requested_digest: tokenDigest(parsed.data.token),
    requested_expires_at: session.expires_at,
  });
  if (error || !data) return invalid();
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ publicId: string }> }) {
  const parsed = disableSchema.safeParse(await request.json().catch(() => null));
  const { publicId } = await context.params;
  const session = await authorize(parsed.success ? parsed.data.nonce : "");
  if (!parsed.success || !z.uuid().safeParse(publicId).success || !session) return invalid();
  const client = createAdminClient();
  const { data, error } = await client.rpc("disable_delivery_channel", { requested_public_id: publicId, requested_tracking_session_id: session.id });
  if (error || !data) return invalid();
  return new NextResponse(null, { status: 204 });
}

async function authorize(nonce: string): Promise<{ id: number; expires_at: string | null } | null> {
  const grant = (await cookies()).get("tt_tracking_grant")?.value;
  const secret = process.env.TRACKING_TOKEN_SECRET;
  const verified = grant && secret ? verifyTrackingToken(grant, secret) : null;
  if (!verified || verified.nonce !== nonce) return null;
  const { data } = await createAdminClient().from("tracking_sessions").select("id, expires_at").eq("public_nonce", nonce).is("revoked_at", null).maybeSingle();
  return data;
}

function invalid() {
  return NextResponse.json({ code: "DELIVERY_CHANNEL_INVALID" }, { status: 404 });
}
