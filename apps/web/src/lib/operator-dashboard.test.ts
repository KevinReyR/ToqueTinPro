import { describe, expect, it } from "vitest";
import { formatClock, formatDuration, formatOperationalDay } from "./operator-dashboard";

describe("operator dashboard formatting", () => {
  it("formats incomplete and completed durations without misleading precision", () => {
    expect(formatDuration(null)).toBe("Aún no hay datos");
    expect(formatDuration(32)).toBe("<1 min");
    expect(formatDuration(659)).toBe("11 min");
    expect(formatDuration(3_900)).toBe("1 h 5 min");
  });

  it("uses the restaurant timezone for operational timestamps", () => {
    expect(formatClock("2026-09-24T17:18:00+00:00", "America/Bogota")).toMatch(/12:18/);
    expect(formatOperationalDay("2026-09-24T05:00:00+00:00", "America/Bogota")).toMatch(/jueves, 24 de septiembre/i);
  });
});
