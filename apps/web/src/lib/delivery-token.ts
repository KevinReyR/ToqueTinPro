import { createCipheriv, createHash, randomBytes } from "node:crypto";

export function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function encryptDeliveryToken(token: string, base64Key: string): string {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("DELIVERY_TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((value) => value.toString("base64url")).join(".");
}
