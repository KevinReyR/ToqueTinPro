import { describe, expect, it } from "vitest";
import { iosTrackingURL, isIOSDevice } from "./ios-deep-link";

describe("iOS app links", () => {
  it("detects iPhone and touch-enabled iPad user agents", () => {
    expect(isIOSDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 })).toBe(true);
    expect(isIOSDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
  });

  it("does not classify Android or desktop Mac as iOS", () => {
    expect(isIOSDevice({ userAgent: "Mozilla/5.0 (Linux; Android 15)", platform: "Linux armv8l", maxTouchPoints: 5 })).toBe(false);
    expect(isIOSDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
  });

  it("builds a custom-scheme URL without exposing the token in a query", () => {
    expect(iosTrackingURL("83555298-1a4e-40bd-bce2-c8484aaac062", "v1.secret.signature"))
      .toBe("toquetin://tracking/83555298-1a4e-40bd-bce2-c8484aaac062#v1.secret.signature");
  });
});
