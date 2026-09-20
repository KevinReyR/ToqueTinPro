import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackingBootstrap } from "./tracking-bootstrap";

const nonce = "83555298-1a4e-40bd-bce2-c8484aaac062";

describe("TrackingBootstrap", () => {
  beforeEach(() => {
    window.location.hash = "#v1.secret.signature";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.location.hash = "";
  });

  it("offers the native app and web choices on iOS without exchanging immediately", async () => {
    setNavigator("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "iPhone", 5);
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    render(<TrackingBootstrap nonce={nonce} />);

    const appLink = await screen.findByRole("link", { name: "Abrir en ToqueTin" });
    expect(appLink).toHaveAttribute("href", `toquetin://tracking/${nonce}#v1.secret.signature`);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continuar en el navegador" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });

  it("keeps the automatic web exchange on Android", async () => {
    setNavigator("Mozilla/5.0 (Linux; Android 15)", "Linux armv8l", 5);
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    render(<TrackingBootstrap nonce={nonce} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.queryByRole("link", { name: "Abrir en ToqueTin" })).not.toBeInTheDocument();
  });
});

function setNavigator(userAgent: string, platform: string, maxTouchPoints: number) {
  Object.defineProperties(window.navigator, {
    userAgent: { configurable: true, value: userAgent },
    platform: { configurable: true, value: platform },
    maxTouchPoints: { configurable: true, value: maxTouchPoints },
  });
}
