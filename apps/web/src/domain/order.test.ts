import { describe, expect, it } from "vitest";
import { canTransition } from "./order";
import { etaPresentation } from "./eta";

describe("order transitions", () => {
  it("allows only the sequential happy path", () => {
    expect(canTransition("RECEIVED", "PREPARING")).toBe(true);
    expect(canTransition("PREPARING", "READY")).toBe(true);
    expect(canTransition("READY", "DELIVERED")).toBe(true);
    expect(canTransition("RECEIVED", "READY")).toBe(false);
    expect(canTransition("DELIVERED", "PREPARING")).toBe(false);
  });

  it("allows cancellation only before the order is ready", () => {
    expect(canTransition("RECEIVED", "CANCELLED")).toBe(true);
    expect(canTransition("PREPARING", "CANCELLED")).toBe(true);
    expect(canTransition("READY", "CANCELLED")).toBe(false);
  });
});

describe("eta presentation", () => {
  const now = new Date("2026-09-19T17:00:00.000Z");

  it("rounds remaining time up", () => {
    expect(
      etaPresentation("PREPARING", "2026-09-19T17:03:01.000Z", now).label,
    ).toBe("~4 min");
  });

  it("never exposes a negative countdown", () => {
    expect(
      etaPresentation("PREPARING", "2026-09-19T16:59:00.000Z", now),
    ).toMatchObject({ label: "Casi listo", minutes: 0, isOverdue: true });
  });

  it("prioritizes ready state over the estimate", () => {
    expect(
      etaPresentation("READY", "2026-09-19T17:20:00.000Z", now).label,
    ).toBe("Listo para recoger");
  });
});
