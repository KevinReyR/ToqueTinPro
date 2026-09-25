"use client";

import { useEffect, useRef } from "react";
import { statusLabel } from "@/domain/order";
import { formatClock, formatDuration, type OperatorOrderDetail } from "@/lib/operator-dashboard";
import { OrderResult } from "./finalized-orders";

type OrderDetailDrawerProps = {
  detail?: OperatorOrderDetail;
  timezone: string;
  loading: boolean;
  error?: string;
  onClose: () => void;
  onRetry: () => void;
};

export function OrderDetailDrawer({ detail, timezone, loading, error, onClose, onRetry }: OrderDetailDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => drawerRef.current?.querySelector<HTMLElement>("button")?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }} role="presentation">
      <aside ref={drawerRef} className="order-drawer" role="dialog" aria-modal="true" aria-labelledby="order-detail-title">
        <header className="drawer-header">
          <div>
            <p className="eyebrow">detalle del pedido</p>
            <h2 id="order-detail-title">{detail ? `Pedido #${detail.orderNumber}` : "Pedido finalizado"}</h2>
          </div>
          <button className="drawer-close" onClick={onClose} type="button" aria-label="Cerrar detalle del pedido">×</button>
        </header>

        {loading ? (
          <div className="drawer-loading" aria-label="Cargando detalle"><span /><span /><span /><span /></div>
        ) : error ? (
          <div className="drawer-error" role="alert">
            <h3>No pudimos cargar el detalle</h3>
            <p>{error}</p>
            <button className="button button-quiet" onClick={onRetry} type="button">Intentar de nuevo</button>
          </div>
        ) : detail ? (
          <div className="drawer-content">
            <div className="drawer-overview">
              <OrderResult status={detail.status} />
              <p>Creado a las {formatClock(detail.createdAt, timezone)} · Finalizado a las {formatClock(detail.closedAt, timezone)}</p>
            </div>

            <dl className="duration-grid">
              <div><dt>Preparación</dt><dd>{formatDuration(detail.preparationSeconds)}</dd></div>
              <div><dt>Retiro</dt><dd>{formatDuration(detail.pickupSeconds)}</dd></div>
              <div><dt>Tiempo total</dt><dd>{formatDuration(detail.totalSeconds)}</dd></div>
            </dl>

            <section className="detail-section" aria-labelledby="timeline-title">
              <h3 id="timeline-title">Línea de tiempo</h3>
              <ol className="order-timeline">
                {detail.history.map((event, index) => (
                  <li key={`${event.toStatus}-${event.occurredAt}-${index}`}>
                    <span className="timeline-dot" aria-hidden="true" />
                    <div><strong>{statusLabel(event.toStatus)}</strong><time dateTime={event.occurredAt}>{formatClock(event.occurredAt, timezone)}</time></div>
                  </li>
                ))}
              </ol>
            </section>

            {detail.pickupInstructions && (
              <section className="detail-section"><h3>Instrucciones de retiro</h3><p>{detail.pickupInstructions}</p></section>
            )}
            {detail.cancellationReason && (
              <section className="detail-section detail-cancellation"><h3>Motivo de cancelación</h3><p>{detail.cancellationReason}</p></section>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
