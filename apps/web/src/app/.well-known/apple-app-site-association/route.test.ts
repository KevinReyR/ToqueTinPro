import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("apple-app-site-association", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("serves the main app association without requiring an App Clip", async () => {
    vi.stubEnv("APPLE_TEAM_ID", "47LCR3FMKT");
    vi.stubEnv("APPLE_APP_BUNDLE_ID", "com.toquetin.app");
    vi.stubEnv("APPLE_APP_CLIP_BUNDLE_ID", "");

    const response = GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.appclips).toBeUndefined();
    expect(payload.applinks.details[0].appIDs).toEqual(["47LCR3FMKT.com.toquetin.app"]);
  });

  it("includes the optional App Clip when configured", async () => {
    vi.stubEnv("APPLE_TEAM_ID", "47LCR3FMKT");
    vi.stubEnv("APPLE_APP_BUNDLE_ID", "com.toquetin.app");
    vi.stubEnv("APPLE_APP_CLIP_BUNDLE_ID", "com.toquetin.app.clip");

    const payload = await GET().json();

    expect(payload.appclips.apps).toEqual(["47LCR3FMKT.com.toquetin.app.clip"]);
    expect(payload.applinks.details[0].appIDs).toEqual([
      "47LCR3FMKT.com.toquetin.app",
      "47LCR3FMKT.com.toquetin.app.clip",
    ]);
  });
});
