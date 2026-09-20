import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { publicTrackingSnapshotSchema } from "@/domain/order";
import { trackingNonceMatches, verifyTrackingToken } from "@/lib/tracking-token";

export async function GET(_: Request, context: { params: Promise<{ nonce: string }> }) {
  const { nonce } = await context.params;
  const grant = (await cookies()).get("tt_tracking_grant")?.value;
  const secret = process.env.TRACKING_TOKEN_SECRET;
  const verified = grant && secret ? verifyTrackingToken(grant, secret) : null;
  if (!verified || !trackingNonceMatches(verified.nonce, nonce)) return invalidTracking();

  const client = createAdminClient();
  const { data, error } = await client.rpc("public_tracking_snapshot", { requested_nonce: nonce });
  const parsed = publicTrackingSnapshotSchema.safeParse(data);
  if (error || !parsed.success) return invalidTracking();
  return NextResponse.json(parsed.data, { headers: { "Cache-Control": "private, no-store" } });
}

function invalidTracking() {
  return NextResponse.json({ code: "TRACKING_INVALID" }, { status: 404 });
}
