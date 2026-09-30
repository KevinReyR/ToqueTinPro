import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NfcTagManager } from "./nfc-tag-manager";
import {
  assignNfcTag,
  getNfcInventory,
  registerNfcTag,
} from "@/lib/nfc-tags-client";

vi.mock("@/lib/supabase/browser", () => ({ createBrowserClient: () => ({}) }));
vi.mock("@/lib/nfc-tags-client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/nfc-tags-client")>();
  return {
    ...original,
    assignNfcTag: vi.fn(),
    getNfcInventory: vi.fn(),
    registerNfcTag: vi.fn(),
    rotateNfcTag: vi.fn(),
    setNfcTagActive: vi.fn(),
  };
});

const inventory = {
  tags: [
    {
      id: 1,
      label: "Tarjeta 01",
      active: true,
      createdAt: "2026-09-30T12:00:00+00:00",
      assignment: null,
    },
  ],
  orderStates: [],
};

describe("NfcTagManager", () => {
  beforeEach(() => {
    vi.mocked(getNfcInventory).mockResolvedValue(inventory);
    vi.mocked(registerNfcTag).mockResolvedValue({
      id: 2,
      label: "Tarjeta 02",
      programmingUrl:
        "https://toquetinpro.netlify.app/n/abcdefghijklmnopqrstuvwxyzABCDEF",
    });
    vi.mocked(assignNfcTag).mockResolvedValue(undefined);
  });

  it("registers a card and exposes its one-time programming URL", async () => {
    render(
      <NfcTagManager
        restaurantId={1}
        onAssignmentTargetChange={vi.fn()}
        onInventoryChange={vi.fn()}
      />,
    );

    await screen.findByText("Tarjeta 01");
    fireEvent.change(screen.getByPlaceholderText("Tarjeta 01"), {
      target: { value: "Tarjeta 02" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar y obtener enlace" }),
    );

    expect(await screen.findByText("Programa Tarjeta 02")).toBeInTheDocument();
    expect(
      screen.getByText(/toquetinpro\.netlify\.app\/n\//),
    ).toBeInTheDocument();
  });

  it("assigns an available card after the order exists", async () => {
    const close = vi.fn();
    render(
      <NfcTagManager
        restaurantId={1}
        assignmentTarget={{ id: 8, orderNumber: "143" }}
        onAssignmentTargetChange={close}
        onInventoryChange={vi.fn()}
      />,
    );

    const select = await screen.findByLabelText("Tarjeta NFC");
    fireEvent.change(select, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar tarjeta" }));

    await waitFor(() =>
      expect(assignNfcTag).toHaveBeenCalledWith(expect.anything(), 1, 8, false),
    );
    await waitFor(() => expect(close).toHaveBeenCalledWith(undefined));
  });
});
