"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderStatus } from "@/domain/order";
import { statusLabel } from "@/domain/order";
import {
  formatClock,
  formatOperationalDay,
  getActiveStatusCount,
  getOperatorDashboardSnapshot,
  getOperatorOrderDetail,
  type ActiveOperatorOrder,
  type FinalizedOperatorOrder,
  type FinalizedOrderFilter,
  type OperatorDashboardSnapshot,
  type OperatorOrderDetail,
} from "@/lib/operator-dashboard";
import { createBrowserClient } from "@/lib/supabase/browser";
import { DashboardSummary } from "./dashboard-summary";
import { FinalizedOrders } from "./finalized-orders";
import { Logo } from "./logo";
import { OrderDetailDrawer } from "./order-detail-drawer";

type Restaurant = { id: number; name: string };
type CreatedOrder = { orderNumber: string; trackingUrl: string; qrDataUrl: string };
type CancellationReason = "CUSTOMER_REQUEST" | "UNAVAILABLE_ITEM" | "ORDER_ERROR" | "OPERATIONAL_ISSUE" | "OTHER";

const activeStatuses = ["RECEIVED", "PREPARING", "READY"] as const;

export function OperatorDashboard() {
  const router = useRouter();
  const client = useMemo(() => createBrowserClient(), []);
  const createPanelRef = useRef<HTMLElement>(null);
  const requestSequence = useRef(0);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantId, setRestaurantId] = useState<number>();
  const [snapshot, setSnapshot] = useState<OperatorDashboardSnapshot>();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedOrder>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<FinalizedOrderFilter>("ALL");
  const [now, setNow] = useState(() => Date.now());
  const [cancellingOrder, setCancellingOrder] = useState<ActiveOperatorOrder>();
  const [cancellationReason, setCancellationReason] = useState<CancellationReason>("CUSTOMER_REQUEST");
  const [cancellationText, setCancellationText] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<FinalizedOperatorOrder>();
  const [orderDetail, setOrderDetail] = useState<OperatorOrderDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();

  const loadSnapshot = useCallback(async ({
    selectedRestaurantId,
    search,
    status,
    cursor = null,
    append = false,
  }: {
    selectedRestaurantId: number;
    search: string;
    status: FinalizedOrderFilter;
    cursor?: OperatorDashboardSnapshot["nextCursor"];
    append?: boolean;
  }) => {
    const requestId = ++requestSequence.current;
    if (append) setLoadingMore(true);
    else setListLoading(true);
    setError(undefined);
    try {
      const result = await getOperatorDashboardSnapshot(client, {
        restaurantId: selectedRestaurantId,
        query: search,
        status,
        cursor,
      });
      if (requestId !== requestSequence.current) return;
      setSnapshot((current) => append && current
        ? { ...result, finalizedOrders: [...current.finalizedOrders, ...result.finalizedOrders] }
        : result);
    } catch {
      if (requestId === requestSequence.current) setError("No pudimos actualizar la jornada. Inténtalo de nuevo.");
    } finally {
      if (requestId === requestSequence.current) {
        setListLoading(false);
        setLoadingMore(false);
      }
    }
  }, [client]);

  useEffect(() => {
    const loadRestaurants = async () => {
      const { data: session } = await client.auth.getSession();
      if (!session.session) { router.replace("/operator/login"); return; }
      const { data, error: restaurantError } = await client.from("restaurants").select("id, name").order("name");
      if (restaurantError) { setError("No pudimos cargar tus restaurantes."); setBootstrapping(false); return; }
      const available = (data ?? []) as Restaurant[];
      setRestaurants(available);
      setRestaurantId(available[0]?.id);
      setBootstrapping(false);
    };
    void loadRestaurants();
  }, [client, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!restaurantId) return;
    const timer = window.setTimeout(() => {
      void loadSnapshot({ selectedRestaurantId: restaurantId, search: debouncedQuery, status: filter });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [debouncedQuery, filter, loadSnapshot, restaurantId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshCurrent = useCallback(async () => {
    if (!restaurantId) return;
    await loadSnapshot({ selectedRestaurantId: restaurantId, search: debouncedQuery, status: filter });
  }, [debouncedQuery, filter, loadSnapshot, restaurantId]);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!restaurantId) return;
    setCreating(true); setError(undefined);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const { data: session } = await client.auth.getSession();
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session?.access_token ?? ""}` },
      body: JSON.stringify({ restaurantId, orderNumber: form.get("orderNumber"), estimatedMinutes: Number(form.get("estimatedMinutes")), pickupInstructions: form.get("pickupInstructions") || null }),
    });
    const result = await response.json() as CreatedOrder & { code?: string };
    if (!response.ok) {
      setError(result.code === "DUPLICATE_ORDER_NUMBER" ? "Ese número ya existe en la jornada actual." : "No pudimos crear el pedido.");
      setCreating(false);
      return;
    }
    setCreated(result); setCreating(false); await refreshCurrent(); formElement.reset();
  }

  async function transition(order: ActiveOperatorOrder) {
    const target: Partial<Record<OrderStatus, OrderStatus>> = { RECEIVED: "PREPARING", PREPARING: "READY", READY: "DELIVERED" };
    const targetStatus = target[order.status];
    if (!targetStatus) return;
    const { data: session } = await client.auth.getSession();
    const response = await fetch(`/api/orders/${order.id}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session?.access_token ?? ""}` },
      body: JSON.stringify({ expectedStatus: order.status, targetStatus }),
    });
    if (!response.ok) setError("El pedido cambió en otro dispositivo. Actualizamos la lista.");
    await refreshCurrent();
  }

  async function cancelOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancellingOrder) return;
    setCancelling(true); setError(undefined);
    const { data: session } = await client.auth.getSession();
    const response = await fetch(`/api/orders/${cancellingOrder.id}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session?.access_token ?? ""}` },
      body: JSON.stringify({ expectedStatus: cancellingOrder.status, targetStatus: "CANCELLED", cancellationReasonCode: cancellationReason, cancellationReasonText: cancellationReason === "OTHER" ? cancellationText : undefined }),
    });
    setCancelling(false);
    if (!response.ok) { setError("No pudimos cancelar el pedido. Puede haber cambiado en otro dispositivo."); return; }
    setCancellingOrder(undefined); setCancellationReason("CUSTOMER_REQUEST"); setCancellationText("");
    await refreshCurrent();
  }

  const closeDetail = useCallback(() => {
    setSelectedOrder(undefined);
    setOrderDetail(undefined);
    setDetailError(undefined);
  }, []);

  const loadDetail = useCallback(async (order: FinalizedOperatorOrder) => {
    setSelectedOrder(order);
    setOrderDetail(undefined);
    setDetailError(undefined);
    setDetailLoading(true);
    try {
      setOrderDetail(await getOperatorOrderDetail(client, order.id));
    } catch {
      setDetailError("El pedido sigue seguro; vuelve a intentar cargar su historial.");
    } finally {
      setDetailLoading(false);
    }
  }, [client]);

  if (bootstrapping || (!snapshot && !error)) return <main className="tracking-page"><p>Cargando operación…</p></main>;

  const timezone = snapshot?.timezone ?? "America/Bogota";
  const oldestReadyAt = snapshot?.activeOrders
    .filter((order) => order.status === "READY" && order.readyAt)
    .map((order) => Date.parse(order.readyAt as string))
    .sort((a, b) => a - b)[0];

  return (
    <div className="app-shell">
      <nav className="topbar operator-topbar">
        <Logo />
        <div className="topbar-meta">
          <span className="topbar-coming-soon" aria-label="Clientes y campañas, próximamente">Clientes y campañas · Próximamente</span>
          <select aria-label="Restaurante activo" value={restaurantId} onChange={(event) => {
            const id = Number(event.target.value);
            setRestaurantId(id); setSnapshot(undefined); setQuery(""); setDebouncedQuery(""); setFilter("ALL"); setCreated(undefined);
          }}>{restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</select>
          <button className="button button-accent topbar-create" onClick={() => createPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} type="button">Crear pedido</button>
          <button className="button button-quiet" onClick={() => void client.auth.signOut().then(() => router.replace("/operator/login"))} type="button">Salir</button>
        </div>
      </nav>

      <main className="operator-dashboard" id="contenido">
        <header className="operator-page-header">
          <div>
            <p className="eyebrow">{snapshot ? formatOperationalDay(snapshot.operationalDayStartedAt, timezone) : "jornada actual"}</p>
            <h1 className="operator-title">Pedidos en curso</h1>
          </div>
          {snapshot && <div className="dashboard-sync"><span>Actualizado {formatClock(snapshot.serverTime, timezone)}</span><button className="refresh-button" onClick={() => void refreshCurrent()} disabled={listLoading} type="button"><span aria-hidden="true">↻</span> Actualizar</button></div>}
        </header>

        {error && <p className="form-error dashboard-error" role="alert">{error}</p>}
        {snapshot && <DashboardSummary snapshot={snapshot} />}

        <div className="operator-workspace">
          <section aria-label="Pedidos activos">
            <div className="operator-board">
              {activeStatuses.map((status) => {
                const statusOrders = snapshot?.activeOrders.filter((order) => order.status === status) ?? [];
                return (
                  <section className={`board-column board-${status.toLowerCase()}`} key={status}>
                    <header className="column-head">
                      <div><h2>{statusLabel(status)}</h2>{status === "READY" && oldestReadyAt && <p>Mayor espera: {Math.max(1, Math.floor((now - oldestReadyAt) / 60_000))} min</p>}</div>
                      <span className="column-count">{snapshot ? getActiveStatusCount(snapshot, status) : 0}</span>
                    </header>
                    {statusOrders.length === 0 ? <p className="column-empty">Sin pedidos en este estado</p> : statusOrders.map((order) => (
                      <article className="order-card" key={order.id}>
                        <p className="order-number">#{order.orderNumber}</p>
                        <div className="order-meta"><span>{activeTimeLabel(order, now)}</span><span>{formatClock(order.createdAt, timezone)}</span></div>
                        <button className="button button-accent card-action" onClick={() => void transition(order)} type="button">{status === "RECEIVED" ? "Empezar preparación" : status === "PREPARING" ? "Marcar como listo" : "Confirmar entrega"}</button>
                        {status !== "READY" && <button className="cancel-order" onClick={() => setCancellingOrder(order)} type="button">Cancelar pedido</button>}
                      </article>
                    ))}
                  </section>
                );
              })}
            </div>
          </section>

          <aside className="create-panel" ref={createPanelRef} id="crear-pedido">
            <p className="eyebrow">nuevo pedido</p><h2>Crear y mostrar QR</h2>
            <form className="login-form" onSubmit={createOrder}>
              <label>Número visible<input name="orderNumber" required maxLength={24} /></label>
              <label>Tiempo estimado<select name="estimatedMinutes" defaultValue="12"><option value="5">5 minutos</option><option value="8">8 minutos</option><option value="12">12 minutos</option><option value="15">15 minutos</option><option value="20">20 minutos</option></select></label>
              <label>Instrucciones de retiro<textarea name="pickupInstructions" maxLength={240} rows={3} /></label>
              <button className="button button-accent" disabled={creating}>{creating ? "Creando…" : "Crear pedido"}</button>
            </form>
            {created && <div className="qr-result"><Image alt={`QR del pedido ${created.orderNumber}`} src={created.qrDataUrl} width={320} height={320} unoptimized /><strong>Pedido #{created.orderNumber}</strong><p>Muestra este código al cliente.</p></div>}
          </aside>
        </div>

        {snapshot && <FinalizedOrders
          orders={snapshot.finalizedOrders}
          timezone={timezone}
          query={query}
          filter={filter}
          loading={listLoading}
          loadingMore={loadingMore}
          hasMore={snapshot.hasMore}
          onQueryChange={setQuery}
          onFilterChange={setFilter}
          onLoadMore={() => {
            if (!restaurantId || !snapshot.nextCursor) return;
            void loadSnapshot({ selectedRestaurantId: restaurantId, search: debouncedQuery, status: filter, cursor: snapshot.nextCursor, append: true });
          }}
          onOpen={(order) => void loadDetail(order)}
        />}
      </main>

      {selectedOrder && <OrderDetailDrawer detail={orderDetail} timezone={timezone} loading={detailLoading} error={detailError} onClose={closeDetail} onRetry={() => void loadDetail(selectedOrder)} />}

      {cancellingOrder && <div className="dialog-backdrop" role="presentation"><section className="cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-title"><p className="eyebrow">cerrar pedido</p><h2 id="cancel-title">Cancelar #{cancellingOrder.orderNumber}</h2><p>El cliente verá el motivo y el seguimiento finalizará.</p><form className="login-form" onSubmit={cancelOrder}><label>Motivo<select value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value as CancellationReason)}><option value="CUSTOMER_REQUEST">Solicitud del cliente</option><option value="UNAVAILABLE_ITEM">Producto no disponible</option><option value="ORDER_ERROR">Error en el pedido</option><option value="OPERATIONAL_ISSUE">Problema operativo</option><option value="OTHER">Otro</option></select></label>{cancellationReason === "OTHER" && <label>Describe el motivo<textarea required maxLength={160} rows={3} value={cancellationText} onChange={(event) => setCancellationText(event.target.value)} /></label>}<div className="dialog-actions"><button type="button" className="button button-quiet" onClick={() => setCancellingOrder(undefined)}>Volver</button><button className="button button-danger" disabled={cancelling}>{cancelling ? "Cancelando…" : "Cancelar pedido"}</button></div></form></section></div>}
    </div>
  );
}

function activeTimeLabel(order: ActiveOperatorOrder, now: number): string {
  if (order.status === "READY" && order.readyAt) {
    return `Listo hace ${Math.max(1, Math.floor((now - Date.parse(order.readyAt)) / 60_000))} min`;
  }
  const minutes = Math.ceil((Date.parse(order.estimatedReadyAt) - now) / 60_000);
  return minutes > 0 ? `~${minutes} min` : "Casi listo";
}
