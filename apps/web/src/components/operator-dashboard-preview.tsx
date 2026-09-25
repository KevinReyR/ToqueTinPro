"use client";

import { useMemo, useState } from "react";
import { DashboardSummary } from "./dashboard-summary";
import { FinalizedOrders } from "./finalized-orders";
import { Logo } from "./logo";
import { OrderBoard } from "./order-board";
import { OrderDetailDrawer } from "./order-detail-drawer";
import type { FinalizedOperatorOrder, FinalizedOrderFilter, OperatorDashboardSnapshot, OperatorOrderDetail } from "@/lib/operator-dashboard";

const finalizedOrders: FinalizedOperatorOrder[] = [
  { id: 141, orderNumber: "140", status: "DELIVERED", createdAt: "2026-09-24T17:04:00+00:00", closedAt: "2026-09-24T17:18:00+00:00", preparationSeconds: 660, pickupSeconds: 180 },
  { id: 142, orderNumber: "142", status: "CANCELLED", createdAt: "2026-09-24T17:08:00+00:00", closedAt: "2026-09-24T17:10:00+00:00", preparationSeconds: null, pickupSeconds: null },
  { id: 143, orderNumber: "139", status: "DELIVERED", createdAt: "2026-09-24T16:41:00+00:00", closedAt: "2026-09-24T16:57:00+00:00", preparationSeconds: 720, pickupSeconds: 240 },
];

const previewSnapshot: OperatorDashboardSnapshot = {
  restaurantId: 1,
  restaurantName: "Cocina La Esquina",
  timezone: "America/Bogota",
  operationalDayStartedAt: "2026-09-24T05:00:00+00:00",
  operationalDayEndedAt: "2026-09-25T05:00:00+00:00",
  serverTime: "2026-09-24T17:21:00+00:00",
  counts: { received: 2, preparing: 2, ready: 1, delivered: 5, cancelled: 2, totalCreated: 12, totalActive: 5 },
  averagePreparationSeconds: 660,
  averagePickupSeconds: 180,
  activeOrders: [],
  finalizedOrders,
  hasMore: false,
  nextCursor: null,
};

const details: Record<number, OperatorOrderDetail> = {
  141: { id: 141, orderNumber: "140", status: "DELIVERED", createdAt: "2026-09-24T17:04:00+00:00", closedAt: "2026-09-24T17:18:00+00:00", pickupInstructions: "Recoge en el mostrador principal.", cancellationReason: null, preparationSeconds: 660, pickupSeconds: 180, totalSeconds: 840, history: [
    { fromStatus: null, toStatus: "RECEIVED", occurredAt: "2026-09-24T17:04:00+00:00", reasonCode: null, reasonText: null },
    { fromStatus: "RECEIVED", toStatus: "PREPARING", occurredAt: "2026-09-24T17:04:00+00:00", reasonCode: null, reasonText: null },
    { fromStatus: "PREPARING", toStatus: "READY", occurredAt: "2026-09-24T17:15:00+00:00", reasonCode: null, reasonText: null },
    { fromStatus: "READY", toStatus: "DELIVERED", occurredAt: "2026-09-24T17:18:00+00:00", reasonCode: null, reasonText: null },
  ] },
  142: { id: 142, orderNumber: "142", status: "CANCELLED", createdAt: "2026-09-24T17:08:00+00:00", closedAt: "2026-09-24T17:10:00+00:00", pickupInstructions: null, cancellationReason: "Producto no disponible", preparationSeconds: null, pickupSeconds: null, totalSeconds: 120, history: [
    { fromStatus: null, toStatus: "RECEIVED", occurredAt: "2026-09-24T17:08:00+00:00", reasonCode: null, reasonText: null },
    { fromStatus: "RECEIVED", toStatus: "CANCELLED", occurredAt: "2026-09-24T17:10:00+00:00", reasonCode: "UNAVAILABLE_ITEM", reasonText: null },
  ] },
  143: { id: 143, orderNumber: "139", status: "DELIVERED", createdAt: "2026-09-24T16:41:00+00:00", closedAt: "2026-09-24T16:57:00+00:00", pickupInstructions: null, cancellationReason: null, preparationSeconds: 720, pickupSeconds: 240, totalSeconds: 960, history: [
    { fromStatus: null, toStatus: "RECEIVED", occurredAt: "2026-09-24T16:41:00+00:00", reasonCode: null, reasonText: null },
    { fromStatus: "RECEIVED", toStatus: "PREPARING", occurredAt: "2026-09-24T16:41:00+00:00", reasonCode: null, reasonText: null },
    { fromStatus: "PREPARING", toStatus: "READY", occurredAt: "2026-09-24T16:53:00+00:00", reasonCode: null, reasonText: null },
    { fromStatus: "READY", toStatus: "DELIVERED", occurredAt: "2026-09-24T16:57:00+00:00", reasonCode: null, reasonText: null },
  ] },
};

export function OperatorDashboardPreview() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FinalizedOrderFilter>("ALL");
  const [selected, setSelected] = useState<FinalizedOperatorOrder>();
  const visible = useMemo(() => finalizedOrders.filter((order) =>
    (filter === "ALL" || order.status === filter) && order.orderNumber.includes(query.trim()),
  ), [filter, query]);

  return (
    <div className="app-shell">
      <nav className="topbar operator-topbar"><Logo /><div className="topbar-meta"><span>Cocina La Esquina</span><button className="button button-accent" type="button" onClick={() => document.getElementById("preview-create")?.scrollIntoView({ behavior: "smooth" })}>Crear pedido</button></div></nav>
      <main className="operator-dashboard" id="contenido">
        <header className="operator-page-header"><div><p className="eyebrow">jueves, 24 de septiembre</p><h1 className="operator-title">Pedidos en curso</h1></div><div className="dashboard-sync"><span>Actualizado 12:21 p. m.</span><button className="refresh-button" type="button"><span aria-hidden="true">↻</span> Actualizar</button></div></header>
        <DashboardSummary snapshot={previewSnapshot} />
        <div className="operator-workspace">
          <section aria-label="Pedidos activos"><OrderBoard /></section>
          <aside className="create-panel" id="preview-create"><p className="eyebrow">nuevo pedido</p><h2>Crear y mostrar QR</h2><form className="login-form" onSubmit={(event) => event.preventDefault()}><label>Número visible<input defaultValue="150" /></label><label>Tiempo estimado<select defaultValue="12"><option value="8">8 minutos</option><option value="12">12 minutos</option><option value="15">15 minutos</option></select></label><label>Instrucciones de retiro<textarea rows={3} defaultValue="Recoge en el mostrador principal." /></label><button className="button button-accent">Crear pedido</button></form></aside>
        </div>
        <FinalizedOrders orders={visible} timezone={previewSnapshot.timezone} query={query} filter={filter} loading={false} loadingMore={false} hasMore={false} onQueryChange={setQuery} onFilterChange={setFilter} onLoadMore={() => undefined} onOpen={setSelected} />
      </main>
      {selected && <OrderDetailDrawer detail={details[selected.id]} timezone={previewSnapshot.timezone} loading={false} onClose={() => setSelected(undefined)} onRetry={() => undefined} />}
    </div>
  );
}
