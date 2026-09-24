import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyTrackingToken } from "@/lib/tracking-token";

export type AuthorizedTrackingSession = {
  id: number;
  order_id: number;
  expires_at: string | null;
};

export async function authorizeTrackingSession(nonce: string): Promise<AuthorizedTrackingSession | null> {
  const grant = (await cookies()).get("tt_tracking_grant")?.value;
  const secret = process.env.TRACKING_TOKEN_SECRET;
  const verified = grant && secret ? verifyTrackingToken(grant, secret) : null;
  if (!verified || verified.nonce !== nonce) return null;

  const { data } = await createAdminClient()
    .from("tracking_sessions")
    .select("id, order_id, expires_at")
    .eq("public_nonce", nonce)
    .is("revoked_at", null)
    .maybeSingle();
  if (!data || (data.expires_at && Date.parse(data.expires_at) <= Date.now())) return null;
  return data;
}
