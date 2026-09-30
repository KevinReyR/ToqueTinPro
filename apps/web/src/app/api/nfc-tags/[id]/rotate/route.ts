import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/env";
import { createNfcToken, nfcTokenDigest } from "@/lib/nfc-token";
import { createUserClient } from "@/lib/supabase/user-server";
import { mapNfcError } from "../../route";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authorization = request.headers.get("authorization");
  const { id } = await context.params;
  const tagId = Number(id);
  if (!authorization)
    return NextResponse.json(
      { code: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  if (!Number.isSafeInteger(tagId) || tagId <= 0) {
    return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const token = createNfcToken();
  const { data, error } = await createUserClient(authorization).rpc(
    "rotate_nfc_tag",
    {
      requested_tag_id: tagId,
      requested_token_digest: nfcTokenDigest(token),
    },
  );
  if (error)
    return NextResponse.json(
      { code: mapNfcError(error.message) },
      { status: 403 },
    );
  const result =
    data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return NextResponse.json({
    ...result,
    programmingUrl: `${siteUrl()}/n/${token}`,
  });
}
