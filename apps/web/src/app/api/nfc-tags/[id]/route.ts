import { NextResponse } from "next/server";
import { z } from "zod";
import { mapNfcError } from "../route";
import { createUserClient } from "@/lib/supabase/user-server";

const updateSchema = z.object({ active: z.boolean() });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authorization = request.headers.get("authorization");
  const { id } = await context.params;
  const tagId = Number(id);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!authorization)
    return NextResponse.json(
      { code: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  if (!Number.isSafeInteger(tagId) || tagId <= 0 || !parsed.success) {
    return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const { error } = await createUserClient(authorization).rpc(
    "set_nfc_tag_active",
    {
      requested_tag_id: tagId,
      requested_active: parsed.data.active,
    },
  );
  if (error)
    return NextResponse.json(
      { code: mapNfcError(error.message) },
      { status: 403 },
    );
  return NextResponse.json({ ok: true });
}
