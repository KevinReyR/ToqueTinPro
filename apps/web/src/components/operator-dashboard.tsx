"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderStatus } from "@/domain/order";
import { statusLabel } from "@/domain/order";
import { createBrowserClient } from "@/lib/supabase/browser";
import { Logo } from "./logo";

type Restaurant = { id: number; name: string };
type OperatorOrder = {
  id: number;
  order_number: string;
  status: OrderStatus;
  estimated_ready_at: string;
  created_at: string;
};
type CreatedOrder = { orderNumber: string; trackingUrl: string; qrDataUrl: string };
type CancellationReason = "CUSTOMER_REQUEST" | "UNAVAILABLE_ITEM" | "ORDER_ERROR" | "OPERATIONAL_ISSUE" | "OTHER";

const activeStatuses: OrderStatus[] = ["RECEIVED", "PREPARING", "READY"];

export function OperatorDashboard() {
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantId, setRestaurantId] = useState<number>();
  const [orders, setOrders] = useState<OperatorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedOrder>();
  const [error, setError] = useState<string>();
  const [cancellingOrder, setCancellingOrder] = useState<OperatorOrder>();
  const [cancellationReason, setCancellationReason] = useState<CancellationReason>("CUSTOMER_REQUEST");
  const [cancellationText, setCancellationText] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const client = useMemo(() => createBrowserClient(), []);

  const refresh = useCallback(async (selectedRestaurantId: number) => {
    const { data, error } = await client.from("orders").select("id, order_number, status, estimated_ready_at, created_at").eq("restaurant_id", selectedRestaurantId).in("status", activeStatuses).order("created_at");
    if (error) throw error;
    setOrders((data ?? []) as OperatorOrder[]);
  }, [client]);

  useEffect(() => {
    const load = async () => {
      const { data: session } = await client.auth.getSession();
      if (!session.session) { router.replace("/operator/login"); return; }
      const { data, error } = await client.from("restaurants").select("id, name").order("name");
      if (error) { setError("No pudimos cargar tus restaurantes."); setLoading(false); return; }
      const available = (data ?? []) as Restaurant[];
      setRestaurants(available);
      const first = available[0]?.id;
      setRestaurantId(first);
      if (first) await refresh(first);
      setLoading(false);
    };
    void load();
  }, [client, refresh, router]);

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
    if (!response.ok) { setError(result.code === "DUPLICATE_ORDER_NUMBER" ? "Ese número ya existe en la jornada actual." : "No pudimos crear el pedido."); setCreating(false); return; }
    setCreated(result); setCreating(false); await refresh(restaurantId); formElement.reset();
  }

  async function transition(order: OperatorOrder) {
    const target: Partial<Record<OrderStatus, OrderStatus>> = { RECEIVED: "PREPARING", PREPARING: "READY", READY: "DELIVERED" };
    const targetStatus = target[order.status];
    if (!targetStatus) return;
    const { data: session } = await client.auth.getSession();
    const response = await fetch(`/api/orders/${order.id}/transition`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session?.access_token ?? ""}` }, body: JSON.stringify({ expectedStatus: order.status, targetStatus }) });
    if (!response.ok) { setError("El pedido cambió en otro dispositivo. Actualizamos la lista."); }
    if (restaurantId) await refresh(restaurantId);
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
    if (restaurantId) await refresh(restaurantId);
  }

  if (loading) return <main className="tracking-page"><p>Cargando operación…</p></main>;
  return <div className="app-shell">
    <nav className="topbar"><Logo /><div className="topbar-meta"><span className="topbar-coming-soon" aria-label="Clientes y campañas, próximamente">Clientes y campañas · Próximamente</span><select aria-label="Restaurante activo" value={restaurantId} onChange={(event) => { const id = Number(event.target.value); setRestaurantId(id); void refresh(id); }}>{restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</select><button className="button button-quiet" onClick={() => void client.auth.signOut().then(() => router.replace("/operator/login"))}>Salir</button></div></nav>
    <main className="operator-layout" id="contenido">
      <section><p className="eyebrow">jornada actual</p><h1 className="operator-title">Pedidos en curso</h1>{error && <p className="form-error" role="alert">{error}</p>}
        <div className="operator-board">{activeStatuses.map((status) => <section className="board-column" key={status}><header className="column-head"><h2>{statusLabel(status)}</h2><span className="column-count">{orders.filter((order) => order.status === status).length}</span></header>{orders.filter((order) => order.status === status).map((order) => <article className="order-card" key={order.id}><p className="order-number">#{order.order_number}</p><div className="order-meta"><span>{Math.max(0, Math.ceil((new Date(order.estimated_ready_at).getTime() - Date.now()) / 60_000))} min</span></div><button className="button button-accent card-action" onClick={() => void transition(order)}>{status === "RECEIVED" ? "Empezar preparación" : status === "PREPARING" ? "Marcar como listo" : "Confirmar entrega"}</button>{status !== "READY" && <button className="cancel-order" onClick={() => setCancellingOrder(order)}>Cancelar pedido</button>}</article>)}</section>)}</div>
      </section>
      <aside className="create-panel"><p className="eyebrow">nuevo pedido</p><h2>Crear y mostrar QR</h2><form className="login-form" onSubmit={createOrder}><label>Número visible<input name="orderNumber" required maxLength={24} /></label><label>Tiempo estimado<select name="estimatedMinutes" defaultValue="12"><option value="5">5 minutos</option><option value="8">8 minutos</option><option value="12">12 minutos</option><option value="15">15 minutos</option><option value="20">20 minutos</option></select></label><label>Instrucciones de retiro<textarea name="pickupInstructions" maxLength={240} rows={3} /></label><button className="button button-accent" disabled={creating}>{creating ? "Creando…" : "Crear pedido"}</button></form>
        {created && <div className="qr-result"><Image alt={`QR del pedido ${created.orderNumber}`} src={created.qrDataUrl} width={320} height={320} unoptimized /><strong>Pedido #{created.orderNumber}</strong><p>Muestra este código al cliente.</p></div>}
      </aside>
    </main>
    {cancellingOrder && <div className="dialog-backdrop" role="presentation"><section className="cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-title"><p className="eyebrow">cerrar pedido</p><h2 id="cancel-title">Cancelar #{cancellingOrder.order_number}</h2><p>El cliente verá el motivo y el seguimiento finalizará.</p><form className="login-form" onSubmit={cancelOrder}><label>Motivo<select value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value as CancellationReason)}><option value="CUSTOMER_REQUEST">Solicitud del cliente</option><option value="UNAVAILABLE_ITEM">Producto no disponible</option><option value="ORDER_ERROR">Error en el pedido</option><option value="OPERATIONAL_ISSUE">Problema operativo</option><option value="OTHER">Otro</option></select></label>{cancellationReason === "OTHER" && <label>Describe el motivo<textarea required maxLength={160} rows={3} value={cancellationText} onChange={(event) => setCancellationText(event.target.value)} /></label>}<div className="dialog-actions"><button type="button" className="button button-quiet" onClick={() => setCancellingOrder(undefined)}>Volver</button><button className="button button-danger" disabled={cancelling}>{cancelling ? "Cancelando…" : "Cancelar pedido"}</button></div></form></section></div>}
  </div>;
}
