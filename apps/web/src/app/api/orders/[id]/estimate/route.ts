import { NextResponse } from "next/server";
import { z } from "zod";
import { createUserClient } from "@/lib/supabase/user-server";

const inputSchema = z.object({ expectedVersion: z.number().int().positive(), estimatedReadyAt: z.iso.datetime() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = request.headers.get("authorization");
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  const { id } = await context.params;
  const orderId = Number(id);
  if (!authorization) return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  if (!parsed.success || !Number.isSafeInteger(orderId)) return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
  const client = createUserClient(authorization);
  const { data, error } = await client.rpc("update_order_estimate", {
    requested_order_id: orderId,
    expected_version: parsed.data.expectedVersion,
    requested_estimated_ready_at: parsed.data.estimatedReadyAt,
  });
  if (error) return NextResponse.json({ code: error.message.includes("CONFLICT") ? "CONFLICT" : "ESTIMATE_UPDATE_FAILED" }, { status: 409 });
  return NextResponse.json(data);
}
