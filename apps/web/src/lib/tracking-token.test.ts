import { describe, expect, it } from "vitest";
import { signTrackingToken, trackingNonceMatches, verifyTrackingToken } from "./tracking-token";

describe("tracking tokens", () => {
  const secret = "a-secure-test-secret-that-is-at-least-32-bytes";

  it("round trips a signed nonce", () => {
    const token = signTrackingToken("83555298-1a4e-40bd-bce2-c8484aaac062", secret);
    expect(verifyTrackingToken(token, secret)).toEqual({
      nonce: "83555298-1a4e-40bd-bce2-c8484aaac062",
    });
  });

  it("rejects manipulation", () => {
    const token = signTrackingToken("nonce-a", secret);
    expect(verifyTrackingToken(token.replace("nonce-a", "nonce-b"), secret)).toBeNull();
  });

  it("matches UUID nonces regardless of letter case", () => {
    expect(trackingNonceMatches(
      "83555298-1a4e-40bd-bce2-c8484aaac062",
      "83555298-1A4E-40BD-BCE2-C8484AAAC062",
    )).toBe(true);
  });
});
