import { NextResponse } from "next/server";
import { z } from "zod";
import { siteUrl } from "@/lib/env";
import { createNfcToken, nfcTokenDigest } from "@/lib/nfc-token";
import { createUserClient } from "@/lib/supabase/user-server";

const listSchema = z.object({
  restaurantId: z.coerce.number().int().positive(),
});
const createSchema = z.object({
  restaurantId: z.number().int().positive(),
  label: z.string().trim().min(1).max(48),
});

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const parsed = listSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!authorization)
    return NextResponse.json(
      { code: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  if (!parsed.success)
    return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });

  const { data, error } = await createUserClient(authorization).rpc(
    "list_nfc_tags",
    {
      requested_restaurant_id: parsed.data.restaurantId,
    },
  );
  if (error)
    return NextResponse.json(
      { code: mapNfcError(error.message) },
      { status: 403 },
    );
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!authorization)
    return NextResponse.json(
      { code: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  if (!parsed.success)
    return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });

  const token = createNfcToken();
  const { data, error } = await createUserClient(authorization).rpc(
    "register_nfc_tag",
    {
      requested_restaurant_id: parsed.data.restaurantId,
      requested_label: parsed.data.label,
      requested_token_digest: nfcTokenDigest(token),
    },
  );
  if (error) {
    const code = mapNfcError(error.message);
    return NextResponse.json(
      { code },
      { status: code === "NFC_TAG_CONFLICT" ? 409 : 403 },
    );
  }
  return NextResponse.json(
    { ...asObject(data), programmingUrl: `${siteUrl()}/n/${token}` },
    { status: 201 },
  );
}

export function mapNfcError(message: string): string {
  return (
    [
      "NFC_TAG_CONFLICT",
      "NFC_TAG_DISABLED",
      "NFC_TAG_ALREADY_ASSIGNED",
      "ORDER_ALREADY_HAS_NFC_TAG",
      "ORDER_NOT_ACTIVE",
      "VALIDATION_ERROR",
      "FORBIDDEN",
    ].find((code) => message.includes(code)) ?? "NFC_OPERATION_FAILED"
  );
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
