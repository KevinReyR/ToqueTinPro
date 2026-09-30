import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/env";
import { isNfcToken, nfcTokenDigest } from "@/lib/nfc-token";
import { createAdminClient } from "@/lib/supabase/server";
import { signTrackingToken } from "@/lib/tracking-token";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const secret = process.env.TRACKING_TOKEN_SECRET;
  if (!secret || !isNfcToken(token)) return unavailable();

  const { data, error } = await createAdminClient().rpc("consume_nfc_tag", {
    requested_token_digest: nfcTokenDigest(token),
  });
  const row = Array.isArray(data)
    ? (data[0] as { public_nonce?: unknown } | undefined)
    : undefined;
  const nonce =
    typeof row?.public_nonce === "string" ? row.public_nonce : undefined;
  if (error || !nonce) return unavailable();

  const destination = new URL(`/tracking/${nonce}`, siteUrl());
  destination.hash = signTrackingToken(nonce, secret);
  return noStoreRedirect(destination);
}

function unavailable() {
  return noStoreRedirect(new URL("/nfc-unavailable", siteUrl()));
}

function noStoreRedirect(destination: URL) {
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
