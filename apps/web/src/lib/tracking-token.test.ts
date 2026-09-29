import { describe, expect, it } from "vitest";
import { signTrackingToken, verifyTrackingToken } from "./tracking-token";

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

  it("rejects a non-canonical base64url signature", () => {
    const token = signTrackingToken("nonce-a", secret);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const lastCharacter = token.at(-1)!;
    const replacement = alphabet[alphabet.indexOf(lastCharacter) + 1]!;
    const manipulated = `${token.slice(0, -1)}${replacement}`;
    const signature = token.slice(token.lastIndexOf(".") + 1);
    const manipulatedSignature = manipulated.slice(manipulated.lastIndexOf(".") + 1);

    expect(Buffer.from(manipulatedSignature, "base64url")).toEqual(
      Buffer.from(signature, "base64url"),
    );
    expect(verifyTrackingToken(manipulated, secret)).toBeNull();
  });
});
