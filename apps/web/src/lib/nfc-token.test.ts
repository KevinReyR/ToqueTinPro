import { describe, expect, it } from "vitest";
import { createNfcToken, isNfcToken, nfcTokenDigest } from "./nfc-token";

describe("NFC tokens", () => {
  it("creates opaque URL-safe tokens with 192 bits of entropy", () => {
    const first = createNfcToken();
    const second = createNfcToken();

    expect(first).toHaveLength(32);
    expect(isNfcToken(first)).toBe(true);
    expect(second).not.toBe(first);
  });

  it("creates a stable digest without retaining the source token", () => {
    expect(nfcTokenDigest("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(
      "22a48051594c1949deed7040850c1f0f8764537f5191be56732d16a54c1d8153",
    );
  });

  it("rejects malformed tokens", () => {
    expect(isNfcToken("short")).toBe(false);
    expect(isNfcToken("a".repeat(31) + ".")).toBe(false);
    expect(isNfcToken("a".repeat(33))).toBe(false);
  });
});
