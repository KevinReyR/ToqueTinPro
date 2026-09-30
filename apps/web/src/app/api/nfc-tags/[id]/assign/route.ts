import { NextResponse } from "next/server";
import { z } from "zod";
import { createUserClient } from "@/lib/supabase/user-server";
import { mapNfcError } from "../../route";

const assignSchema = z.object({
  orderId: z.number().int().positive(),
  force: z.boolean().default(false),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authorization = request.headers.get("authorization");
  const { id } = await context.params;
  const tagId = Number(id);
  const parsed = assignSchema.safeParse(await request.json().catch(() => null));
  if (!authorization)
    return NextResponse.json(
      { code: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  if (!Number.isSafeInteger(tagId) || tagId <= 0 || !parsed.success) {
    return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const { data, error } = await createUserClient(authorization).rpc(
    "assign_nfc_tag",
    {
      requested_tag_id: tagId,
      requested_order_id: parsed.data.orderId,
      requested_force: parsed.data.force,
    },
  );
  if (error) {
    const code = mapNfcError(error.message);
    const status =
      code === "NFC_TAG_ALREADY_ASSIGNED" ||
      code === "ORDER_ALREADY_HAS_NFC_TAG"
        ? 409
        : code === "ORDER_NOT_ACTIVE"
          ? 422
          : 403;
    return NextResponse.json({ code }, { status });
  }
  return NextResponse.json(data);
}
