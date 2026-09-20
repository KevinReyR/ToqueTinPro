import { NextResponse } from "next/server";
import { z } from "zod";
import { orderStatusSchema } from "@/domain/order";
import { createUserClient } from "@/lib/supabase/user-server";
import { processPendingDeliveries } from "@/lib/delivery-dispatcher";

const inputSchema = z.object({
  expectedStatus: orderStatusSchema,
  targetStatus: orderStatusSchema,
  cancellationReasonCode: z.enum(["CUSTOMER_REQUEST", "UNAVAILABLE_ITEM", "ORDER_ERROR", "OPERATIONAL_ISSUE", "OTHER"]).optional(),
  cancellationReasonText: z.string().trim().max(160).optional(),
}).superRefine((value, context) => {
  if (value.targetStatus === "CANCELLED" && !value.cancellationReasonCode) {
    context.addIssue({ code: "custom", message: "Cancellation reason is required" });
  }
  if (value.targetStatus === "CANCELLED" && value.cancellationReasonCode === "OTHER" && !value.cancellationReasonText) {
    context.addIssue({ code: "custom", message: "Cancellation text is required" });
  }
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = request.headers.get("authorization");
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  const { id } = await context.params;
  const orderId = Number(id);
  if (!authorization) return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  if (!parsed.success || !Number.isSafeInteger(orderId)) return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
  const client = createUserClient(authorization);
  const { data, error } = parsed.data.targetStatus === "CANCELLED"
    ? await client.rpc("cancel_order", {
      requested_order_id: orderId,
      expected_status: parsed.data.expectedStatus,
      requested_reason_code: parsed.data.cancellationReasonCode,
      requested_reason_text: parsed.data.cancellationReasonText ?? null,
    })
    : await client.rpc("transition_order", { requested_order_id: orderId, expected_status: parsed.data.expectedStatus, target_status: parsed.data.targetStatus });
  if (error) return NextResponse.json({ code: error.message.includes("CONFLICT") ? "CONFLICT" : "INVALID_TRANSITION" }, { status: 409 });
  await processPendingDeliveries().catch((deliveryError: unknown) => {
    console.error("Delivery dispatch failed", deliveryError instanceof Error ? deliveryError.message : "UNKNOWN");
  });
  return NextResponse.json(data);
}
