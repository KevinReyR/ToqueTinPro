import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationChannelSelector } from "./notification-channel-selector";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NotificationChannelSelector", () => {
  it("opens an accessible multichannel sheet and closes with Escape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ channels: [], app: { status: "COMING_SOON" } }) }));
    render(<NotificationChannelSelector nonce="6ad0c7aa-c627-45df-94c8-cdf42b9f12ac" />);
    const trigger = screen.getByRole("button", { name: "Recibir avisos del pedido" });
    await waitFor(() => expect(trigger).toBeEnabled());
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "¿Dónde quieres recibir avisos?" })).toBeInTheDocument();
    expect(screen.getByText("Navegador")).toBeInTheDocument();
    expect(screen.getByText("App")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Próximamente")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("changes the main action when WhatsApp is already active", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ channels: [{ publicId: "channel-id", channel: "WHATSAPP", expiresAt: null }], app: { status: "COMING_SOON" } }),
    }));
    render(<NotificationChannelSelector nonce="6ad0c7aa-c627-45df-94c8-cdf42b9f12ac" />);
    expect(await screen.findByRole("button", { name: "Gestionar avisos" })).toBeInTheDocument();
  });
});
