import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeTrackingSession } from "@/lib/tracking-session";
import { createAdminClient } from "@/lib/supabase/server";

const querySchema = z.uuid();

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get("nonce"));
  const session = parsed.success ? await authorizeTrackingSession(parsed.data) : null;
  if (!session) return NextResponse.json({ code: "TRACKING_INVALID" }, { status: 404 });

  const { data, error } = await createAdminClient().rpc("list_delivery_channels", {
    requested_tracking_session_id: session.id,
  });
  if (error) return NextResponse.json({ code: "CHANNELS_UNAVAILABLE" }, { status: 500 });

  const channels = (Array.isArray(data) ? data : []).map((channel) => ({
    publicId: channel.public_id as string,
    channel: channel.channel as string,
    expiresAt: channel.expires_at as string | null,
  }));
  return NextResponse.json({ channels, app: { status: "COMING_SOON" } });
}
