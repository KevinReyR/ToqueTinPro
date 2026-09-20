import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { importPKCS8, SignJWT } from "npm:jose@6.1.0";
import webpush from "npm:web-push@3.6.7";

type Attempt = {
  attempt_id: number;
  channel: "WEB_PUSH" | "APNS_LIVE_ACTIVITY" | "FCM_LIVE_UPDATE";
  token_ciphertext: string;
  capabilities: Record<string, unknown>;
  event_kind: string;
  payload: Record<string, unknown>;
  attempt_count: number;
};

const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async () => {
  const { data, error } = await supabase.rpc("claim_delivery_attempts", { requested_limit: 25 });
  if (error) return Response.json({ code: "CLAIM_FAILED" }, { status: 500 });
  const results = await Promise.allSettled((data as Attempt[]).map(deliver));
  return Response.json({ claimed: data.length, completed: results.filter((result) => result.status === "fulfilled").length });
});

async function deliver(attempt: Attempt): Promise<void> {
  const started = performance.now();
  try {
    const token = await decryptToken(attempt.token_ciphertext);
    if (attempt.channel === "APNS_LIVE_ACTIVITY") await sendApns(token, attempt);
    if (attempt.channel === "FCM_LIVE_UPDATE") await sendFcm(token, attempt);
    if (attempt.channel === "WEB_PUSH") await sendWebPush(token, attempt);
    await complete(attempt.attempt_id, true, Math.round(performance.now() - started));
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN";
    await complete(attempt.attempt_id, false, Math.round(performance.now() - started), code);
  }
}

async function sendApns(deviceToken: string, attempt: Attempt) {
  const privateKey = await importPKCS8(required("APNS_PRIVATE_KEY").replaceAll("\\n", "\n"), "ES256");
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: required("APNS_KEY_ID") })
    .setIssuer(required("APNS_TEAM_ID"))
    .setIssuedAt()
    .sign(privateKey);
  const isClosed = ["ORDER_CLOSED", "TRACKING_REVOKED"].includes(attempt.event_kind);
  const dismissalDate = attempt.event_kind === "TRACKING_REVOKED"
    ? Math.floor(Date.now() / 1000)
    : attempt.event_kind === "ORDER_CLOSED"
      ? Math.floor(Date.now() / 1000) + 15 * 60
      : undefined;
  const body: Record<string, unknown> = {
    aps: {
      timestamp: Math.floor(Date.now() / 1000),
      event: isClosed ? "end" : "update",
      "dismissal-date": dismissalDate,
      "content-state": {
        status: attempt.payload.status,
        estimatedReadyAt: typeof attempt.payload.estimatedReadyAt === "string" ? Date.parse(attempt.payload.estimatedReadyAt) / 1000 : null,
        version: attempt.payload.version,
      },
      alert: attempt.event_kind === "ORDER_READY" ? { title: `Pedido ${attempt.payload.orderNumber}`, body: "Está listo para recoger", sound: "default" } : undefined,
    },
  };
  const response = await fetch(`${Deno.env.get("APNS_ORIGIN") ?? "https://api.push.apple.com"}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": `${required("APPLE_APP_CLIP_BUNDLE_ID")}.push-type.liveactivity`,
      "apns-push-type": "liveactivity",
      "apns-priority": attempt.event_kind === "ORDER_READY" ? "10" : "5",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`APNS_${response.status}`);
}

async function sendFcm(deviceToken: string, attempt: Attempt) {
  const accessToken = await googleAccessToken();
  const snapshot = JSON.stringify(attempt.payload);
  const message: Record<string, unknown> = {
    token: deviceToken,
    data: { snapshot, eventKind: attempt.event_kind, revoked: String(attempt.event_kind === "TRACKING_REVOKED") },
    android: { priority: attempt.event_kind === "ORDER_READY" ? "HIGH" : "NORMAL", ttl: "3600s" },
  };
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${required("FCM_PROJECT_ID")}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!response.ok) throw new Error(`FCM_${response.status}`);
}

async function sendWebPush(endpoint: string, attempt: Attempt) {
  const p256dh = String(attempt.capabilities.p256dh ?? "");
  const auth = String(attempt.capabilities.auth ?? "");
  if (!p256dh || !auth) throw new Error("WEB_PUSH_KEYS_MISSING");
  webpush.setVapidDetails("mailto:ops@toquetin.example", required("VAPID_PUBLIC_KEY"), required("VAPID_PRIVATE_KEY"));
  await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, JSON.stringify({ eventKind: attempt.event_kind, snapshot: attempt.payload }));
}

async function googleAccessToken(): Promise<string> {
  const key = await importPKCS8(required("FCM_PRIVATE_KEY").replaceAll("\\n", "\n"), "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(required("FCM_CLIENT_EMAIL"))
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt().setExpirationTime("1h").sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const result = await response.json() as { access_token?: string };
  if (!response.ok || !result.access_token) throw new Error(`FCM_AUTH_${response.status}`);
  return result.access_token;
}

async function decryptToken(serialized: string): Promise<string> {
  const [ivValue, tagValue, ciphertextValue] = serialized.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("TOKEN_CIPHERTEXT_INVALID");
  const configuredKey = required("DELIVERY_TOKEN_ENCRYPTION_KEY");
  const decodedKey = decodeBase64(configuredKey);
  const keyBytes = decodedKey.length === 32
    ? decodedKey
    : new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(configuredKey)));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const tag = decodeBase64(tagValue);
  const ciphertext = decodeBase64(ciphertextValue);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext); combined.set(tag, ciphertext.length);
  const value = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBase64(ivValue), tagLength: 128 }, key, combined);
  return new TextDecoder().decode(value);
}

async function complete(id: number, success: boolean, latency: number, code?: string) {
  const { error } = await supabase.rpc("complete_delivery_attempt", {
    requested_attempt_id: id, requested_success: success, requested_latency_ms: latency, requested_error_code: code ?? null,
  });
  if (error) throw new Error("ATTEMPT_COMPLETION_FAILED");
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
