import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinalizedOrders } from "./finalized-orders";

const delivered = {
  id: 1,
  orderNumber: "143",
  status: "DELIVERED" as const,
  createdAt: "2026-09-24T17:04:00+00:00",
  closedAt: "2026-09-24T17:18:00+00:00",
  preparationSeconds: 660,
  pickupSeconds: 180,
};

describe("FinalizedOrders", () => {
  it("exposes search, filters and the detail action", () => {
    const onQueryChange = vi.fn();
    const onFilterChange = vi.fn();
    const onOpen = vi.fn();
    render(<FinalizedOrders
      orders={[delivered]}
      timezone="America/Bogota"
      query=""
      filter="ALL"
      loading={false}
      loadingMore={false}
      hasMore={false}
      onQueryChange={onQueryChange}
      onFilterChange={onFilterChange}
      onLoadMore={vi.fn()}
      onOpen={onOpen}
    />);

    fireEvent.change(screen.getByPlaceholderText("Buscar pedido"), { target: { value: "143" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelados" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));

    expect(onQueryChange).toHaveBeenCalledWith("143");
    expect(onFilterChange).toHaveBeenCalledWith("CANCELLED");
    expect(onOpen).toHaveBeenCalledWith(delivered);
    expect(screen.getByText("11 min")).toBeInTheDocument();
  });

  it("distinguishes an empty jornada from an empty filter", () => {
    const { rerender } = render(<FinalizedOrders
      orders={[]}
      timezone="America/Bogota"
      query=""
      filter="ALL"
      loading={false}
      loadingMore={false}
      hasMore={false}
      onQueryChange={vi.fn()}
      onFilterChange={vi.fn()}
      onLoadMore={vi.fn()}
      onOpen={vi.fn()}
    />);
    expect(screen.getByText("Aún no hay pedidos finalizados")).toBeInTheDocument();

    rerender(<FinalizedOrders
      orders={[]}
      timezone="America/Bogota"
      query="999"
      filter="ALL"
      loading={false}
      loadingMore={false}
      hasMore={false}
      onQueryChange={vi.fn()}
      onFilterChange={vi.fn()}
      onLoadMore={vi.fn()}
      onOpen={vi.fn()}
    />);
    expect(screen.getByText("No encontramos ese pedido")).toBeInTheDocument();
  });
});
