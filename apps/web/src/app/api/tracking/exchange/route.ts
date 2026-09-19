import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyTrackingToken } from "@/lib/tracking-token";

const inputSchema = z.object({ nonce: z.uuid(), token: z.string().min(32).max(512) });

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  const secret = process.env.TRACKING_TOKEN_SECRET;
  if (!parsed.success || !secret) return invalidTracking();
  const verified = verifyTrackingToken(parsed.data.token, secret);
  if (!verified || verified.nonce !== parsed.data.nonce) return invalidTracking();

  const client = createAdminClient();
  const { data, error } = await client
    .from("tracking_sessions")
    .select("public_nonce, revoked_at, expires_at")
    .eq("public_nonce", parsed.data.nonce)
    .maybeSingle();
  if (error || !data || data.revoked_at || (data.expires_at && new Date(data.expires_at) <= new Date())) {
    return invalidTracking();
  }

  const store = await cookies();
  store.set("tt_tracking_grant", parsed.data.token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return NextResponse.json({ ok: true });
}

function invalidTracking() {
  return NextResponse.json({ code: "TRACKING_INVALID" }, { status: 404 });
}
