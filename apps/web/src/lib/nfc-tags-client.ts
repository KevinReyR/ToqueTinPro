import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const timestampSchema = z.iso.datetime({ offset: true });

const nfcAssignmentSchema = z.object({
  id: z.number().int().positive(),
  orderId: z.number().int().positive(),
  orderNumber: z.string().min(1),
  assignedAt: timestampSchema,
});

const nfcTagSchema = z.object({
  id: z.number().int().positive(),
  label: z.string().min(1),
  active: z.boolean(),
  createdAt: timestampSchema,
  assignment: nfcAssignmentSchema.nullable(),
});

const nfcOrderStateSchema = z.object({
  orderId: z.number().int().positive(),
  tagId: z.number().int().positive(),
  tagLabel: z.string().min(1),
  status: z.enum(["PENDING", "CONSUMED", "RELEASED"]),
  assignedAt: timestampSchema,
  endedAt: timestampSchema.nullable(),
});

const nfcInventorySchema = z.object({
  tags: z.array(nfcTagSchema),
  orderStates: z.array(nfcOrderStateSchema),
});

const programmingResultSchema = z.object({
  id: z.number().int().positive(),
  label: z.string().min(1),
  programmingUrl: z.url(),
});

export type NfcTag = z.infer<typeof nfcTagSchema>;
export type NfcOrderState = z.infer<typeof nfcOrderStateSchema>;
export type NfcInventory = z.infer<typeof nfcInventorySchema>;
export type NfcProgrammingResult = z.infer<typeof programmingResultSchema>;

export class NfcRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export async function getNfcInventory(
  client: SupabaseClient,
  restaurantId: number,
): Promise<NfcInventory> {
  const response = await nfcFetch(
    client,
    `/api/nfc-tags?restaurantId=${restaurantId}`,
  );
  return nfcInventorySchema.parse(await response.json());
}

export async function registerNfcTag(
  client: SupabaseClient,
  restaurantId: number,
  label: string,
): Promise<NfcProgrammingResult> {
  const response = await nfcFetch(client, "/api/nfc-tags", {
    method: "POST",
    body: JSON.stringify({ restaurantId, label }),
  });
  return programmingResultSchema.parse(await response.json());
}

export async function rotateNfcTag(
  client: SupabaseClient,
  tagId: number,
): Promise<NfcProgrammingResult> {
  const response = await nfcFetch(client, `/api/nfc-tags/${tagId}/rotate`, {
    method: "POST",
  });
  return programmingResultSchema.parse(await response.json());
}

export async function setNfcTagActive(
  client: SupabaseClient,
  tagId: number,
  active: boolean,
): Promise<void> {
  await nfcFetch(client, `/api/nfc-tags/${tagId}`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export async function assignNfcTag(
  client: SupabaseClient,
  tagId: number,
  orderId: number,
  force: boolean,
): Promise<void> {
  await nfcFetch(client, `/api/nfc-tags/${tagId}/assign`, {
    method: "POST",
    body: JSON.stringify({ orderId, force }),
  });
}

async function nfcFetch(
  client: SupabaseClient,
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const { data } = await client.auth.getSession();
  const response = await fetch(input, {
    ...init,
    headers: {
      ...init.headers,
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      code?: unknown;
    } | null;
    throw new NfcRequestError(
      typeof payload?.code === "string" ? payload.code : "NFC_OPERATION_FAILED",
    );
  }
  return response;
}
