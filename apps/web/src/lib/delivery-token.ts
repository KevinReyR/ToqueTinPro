import { createCipheriv, createHash, randomBytes } from "node:crypto";

export function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function encryptDeliveryToken(token: string, base64Key: string): string {
  const decodedKey = Buffer.from(base64Key, "base64");
  const key = decodedKey.length === 32
    ? decodedKey
    : createHash("sha256").update(base64Key, "utf8").digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((value) => value.toString("base64url")).join(".");
}
