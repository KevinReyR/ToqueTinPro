import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";

export function signTrackingToken(nonce: string, secret: string): string {
  const payload = `${TOKEN_VERSION}.${nonce}`;
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyTrackingToken(
  token: string,
  secret: string,
): { nonce: string } | null {
  const [version, nonce, signature, extra] = token.split(".");
  if (extra || version !== TOKEN_VERSION || !nonce || !signature) return null;

  const expected = createHmac("sha256", secret)
    .update(`${version}.${nonce}`)
    .digest("base64url");
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(receivedBuffer, expectedBuffer)) return null;
  return { nonce };
}
