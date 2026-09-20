import { createDecipheriv, createHash, createPrivateKey, sign } from "node:crypto";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/server";

type DeliveryAttempt = {
  attempt_id: number;
  channel: "WEB_PUSH" | "APNS_LIVE_ACTIVITY" | "FCM_LIVE_UPDATE";
  token_ciphertext: string;
  capabilities: Record<string, unknown>;
  event_kind: string;
  payload: Record<string, unknown>;
};

export async function processPendingDeliveries(): Promise<void> {
  const client = createAdminClient();
  const { data, error } = await client.rpc("claim_delivery_attempts", { requested_limit: 25 });
  if (error) throw new Error("DELIVERY_CLAIM_FAILED");

  for (const attempt of (data ?? []) as DeliveryAttempt[]) {
    const startedAt = performance.now();
    try {
      const token = decryptToken(attempt.token_ciphertext, required("DELIVERY_TOKEN_ENCRYPTION_KEY"));
      const hydratedAttempt = await hydrateAttemptPayload(client, attempt);
      if (attempt.channel === "FCM_LIVE_UPDATE") await sendFcm(token, hydratedAttempt);
      else if (attempt.channel === "WEB_PUSH") await sendWebPush(token, hydratedAttempt);
      else throw new Error("CHANNEL_NOT_CONFIGURED");
      console.info("Delivery attempt succeeded", {
        attemptId: attempt.attempt_id,
        channel: attempt.channel,
        eventKind: attempt.event_kind,
      });
      await completeAttempt(attempt.attempt_id, true, Math.round(performance.now() - startedAt));
    } catch (deliveryError) {
      const code = deliveryError instanceof Error ? deliveryError.message.slice(0, 120) : "UNKNOWN";
      console.error("Delivery attempt failed", {
        attemptId: attempt.attempt_id,
        channel: attempt.channel,
        code,
      });
      await completeAttempt(attempt.attempt_id, false, Math.round(performance.now() - startedAt), code);
    }
  }
}

async function hydrateAttemptPayload(
  client: ReturnType<typeof createAdminClient>,
  attempt: DeliveryAttempt,
): Promise<DeliveryAttempt> {
  const publicNonce = attempt.payload.publicNonce;
  if (typeof publicNonce !== "string") throw new Error("DELIVERY_NONCE_MISSING");
  const { data, error } = await client.rpc("public_tracking_snapshot", { requested_nonce: publicNonce });
  if (error || typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("DELIVERY_SNAPSHOT_FAILED");
  }
  return { ...attempt, payload: { ...attempt.payload, ...data as Record<string, unknown> } };
}

async function sendWebPush(endpoint: string, attempt: DeliveryAttempt): Promise<void> {
  const p256dh = attempt.capabilities.p256dh;
  const auth = attempt.capabilities.auth;
  if (typeof p256dh !== "string" || !p256dh || typeof auth !== "string" || !auth) {
    throw new Error("WEB_PUSH_KEYS_MISSING");
  }
  webpush.setVapidDetails(
    "mailto:ops@toquetin.app",
    required("VAPID_PUBLIC_KEY"),
    required("VAPID_PRIVATE_KEY"),
  );
  await webpush.sendNotification(
    { endpoint, keys: { p256dh, auth } },
    JSON.stringify({ eventKind: attempt.event_kind, snapshot: attempt.payload }),
  );
}

async function sendFcm(token: string, attempt: DeliveryAttempt): Promise<void> {
  const accessToken = await googleAccessToken();
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${required("FCM_PROJECT_ID")}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        data: {
          snapshot: JSON.stringify(attempt.payload),
          eventKind: attempt.event_kind,
          revoked: String(attempt.event_kind === "TRACKING_REVOKED"),
        },
        android: {
          priority: fcmPriority(attempt.event_kind),
          ttl: "3600s",
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`FCM_${response.status}`);
}

function fcmPriority(eventKind: string): "HIGH" | "NORMAL" {
  return ["TRACKING_STARTED", "STATUS_CHANGED", "ORDER_READY", "ORDER_CLOSED"].includes(eventKind)
    ? "HIGH"
    : "NORMAL";
}

async function googleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const payload = encodeJson({
    iss: required("FCM_CLIENT_EMAIL"),
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const unsigned = `${header}.${payload}`;
  const privateKey = createPrivateKey(normalizeFcmPrivateKey(required("FCM_PRIVATE_KEY")));
  const signature = sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const result = await response.json() as { access_token?: string };
  if (!response.ok || !result.access_token) throw new Error(`FCM_AUTH_${response.status}`);
  return result.access_token;
}

async function completeAttempt(id: number, success: boolean, latencyMs: number, errorCode?: string): Promise<void> {
  const client = createAdminClient();
  const { error } = await client.rpc("complete_delivery_attempt", {
    requested_attempt_id: id,
    requested_success: success,
    requested_latency_ms: latencyMs,
    requested_error_code: errorCode ?? null,
  });
  if (error) throw new Error("DELIVERY_COMPLETION_FAILED");
}

function decryptToken(serialized: string, base64Key: string): string {
  const [ivValue, tagValue, ciphertextValue] = serialized.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("TOKEN_CIPHERTEXT_INVALID");
  const decodedKey = Buffer.from(base64Key, "base64");
  const key = decodedKey.length === 32
    ? decodedKey
    : createHash("sha256").update(base64Key, "utf8").digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function normalizeFcmPrivateKey(rawValue: string): string {
  const trimmed = rawValue.trim();
  let candidate = trimmed;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === "string") candidate = parsed;
    if (isServiceAccount(parsed)) candidate = parsed.private_key;
  } catch {
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      candidate = trimmed.slice(1, -1);
    }
  }

  const normalized = candidate.replaceAll("\\n", "\n").trim();
  if (!normalized.startsWith("-----BEGIN PRIVATE KEY-----") || !normalized.endsWith("-----END PRIVATE KEY-----")) {
    throw new Error("FCM_PRIVATE_KEY_INVALID");
  }
  return normalized;
}

function isServiceAccount(value: unknown): value is { private_key: string } {
  return typeof value === "object"
    && value !== null
    && "private_key" in value
    && typeof value.private_key === "string";
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
