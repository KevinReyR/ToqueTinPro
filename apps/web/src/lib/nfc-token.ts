import { createHash, randomBytes } from "node:crypto";

const NFC_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function createNfcToken(): string {
  return randomBytes(24).toString("base64url");
}

export function isNfcToken(value: string): boolean {
  return NFC_TOKEN_PATTERN.test(value);
}

export function nfcTokenDigest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
