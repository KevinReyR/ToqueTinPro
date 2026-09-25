import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrderDetailDrawer } from "./order-detail-drawer";

describe("OrderDetailDrawer", () => {
  it("renders the immutable timeline and closes with Escape", () => {
    const onClose = vi.fn();
    render(<OrderDetailDrawer
      timezone="America/Bogota"
      loading={false}
      onClose={onClose}
      onRetry={vi.fn()}
      detail={{
        id: 143,
        orderNumber: "143",
        status: "DELIVERED",
        createdAt: "2026-09-24T17:04:00+00:00",
        closedAt: "2026-09-24T17:18:00+00:00",
        pickupInstructions: "Mostrador principal",
        cancellationReason: null,
        preparationSeconds: 660,
        pickupSeconds: 180,
        totalSeconds: 840,
        history: [
          { fromStatus: null, toStatus: "RECEIVED", occurredAt: "2026-09-24T17:04:00+00:00", reasonCode: null, reasonText: null },
          { fromStatus: "READY", toStatus: "DELIVERED", occurredAt: "2026-09-24T17:18:00+00:00", reasonCode: null, reasonText: null },
        ],
      }}
    />);

    expect(screen.getByRole("dialog", { name: "Pedido #143" })).toBeInTheDocument();
    expect(screen.getByText("Recibido")).toBeInTheDocument();
    expect(screen.getByText("Mostrador principal")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
