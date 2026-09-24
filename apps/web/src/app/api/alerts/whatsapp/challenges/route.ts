import { NextResponse } from "next/server";
import { z } from "zod";
import { tokenDigest } from "@/lib/delivery-token";
import { createAdminClient } from "@/lib/supabase/server";
import { authorizeTrackingSession } from "@/lib/tracking-session";
import { createWhatsAppCode, createWhatsAppLaunchUrl } from "@/lib/whatsapp-alerts";

const challengeSchema = z.object({ nonce: z.uuid() });

export async function POST(request: Request) {
  const parsed = challengeSchema.safeParse(await request.json().catch(() => null));
  const session = parsed.success ? await authorizeTrackingSession(parsed.data.nonce) : null;
  if (!session) return NextResponse.json({ code: "TRACKING_INVALID" }, { status: 404 });

  const phoneNumber = process.env.WHATSAPP_BUSINESS_NUMBER;
  const encryptionKey = process.env.DELIVERY_TOKEN_ENCRYPTION_KEY;
  const controllerName = process.env.PRIVACY_CONTROLLER_NAME;
  const privacyEmail = process.env.PRIVACY_CONTACT_EMAIL;
  const n8nWebhookUrl = process.env.N8N_WHATSAPP_DELIVERY_WEBHOOK_URL;
  const n8nSecret = process.env.N8N_WEBHOOK_SECRET;
  if (!phoneNumber || !encryptionKey || !controllerName || !privacyEmail) {
    return NextResponse.json({ code: "PRIVACY_CONFIGURATION_REQUIRED" }, { status: 503 });
  }
  if (!n8nWebhookUrl || !n8nSecret) {
    return NextResponse.json({ code: "WHATSAPP_CONFIGURATION_REQUIRED" }, { status: 503 });
  }

  const code = createWhatsAppCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { data, error } = await createAdminClient().rpc("create_whatsapp_challenge", {
    requested_tracking_session_id: session.id,
    requested_code_digest: tokenDigest(code),
    requested_expires_at: expiresAt,
  });
  if (error) return NextResponse.json({ code: "CHALLENGE_CREATE_FAILED" }, { status: 500 });
  const challenge = Array.isArray(data) ? data[0] : data;
  if (!challenge) return NextResponse.json({ code: "CHALLENGE_CREATE_FAILED" }, { status: 500 });

  return NextResponse.json({
    challengeId: challenge.public_id,
    launchUrl: createWhatsAppLaunchUrl(phoneNumber, code),
    expiresAt: challenge.expires_at,
  }, { status: 201 });
}
