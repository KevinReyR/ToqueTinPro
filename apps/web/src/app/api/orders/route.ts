import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { z } from "zod";
import { siteUrl } from "@/lib/env";
import { createUserClient } from "@/lib/supabase/user-server";
import { signTrackingToken } from "@/lib/tracking-token";

const createOrderSchema = z.object({
  restaurantId: z.number().int().positive(),
  orderNumber: z.string().trim().min(1).max(24),
  estimatedMinutes: z.number().int().min(1).max(240),
  pickupInstructions: z.string().trim().max(240).nullable().default(null),
});

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const secret = process.env.TRACKING_TOKEN_SECRET;
  const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));
  if (!authorization || !secret) return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  if (!parsed.success) return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
  const client = createUserClient(authorization);
  const { data, error } = await client.rpc("create_order", {
    requested_restaurant_id: parsed.data.restaurantId,
    requested_order_number: parsed.data.orderNumber,
    requested_estimated_minutes: parsed.data.estimatedMinutes,
    requested_pickup_instructions: parsed.data.pickupInstructions,
  });
  if (error || !data) {
    const code = error?.message.includes("DUPLICATE_ORDER_NUMBER") ? "DUPLICATE_ORDER_NUMBER" : "CREATE_ORDER_FAILED";
    return NextResponse.json({ code }, { status: code === "DUPLICATE_ORDER_NUMBER" ? 409 : 400 });
  }
  const result = data as { publicNonce: string; orderId: number; orderNumber: string; estimatedReadyAt: string };
  const token = signTrackingToken(result.publicNonce, secret);
  const trackingUrl = `${siteUrl()}/tracking/${result.publicNonce}#${token}`;
  const qrDataUrl = await QRCode.toDataURL(trackingUrl, { width: 640, margin: 2, color: { dark: "#2b211b", light: "#fffaf2" } });
  return NextResponse.json({ ...result, trackingUrl, qrDataUrl }, { status: 201 });
}
