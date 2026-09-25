import type { FinalizedOperatorOrder, FinalizedOrderFilter } from "@/lib/operator-dashboard";
import { formatClock, formatDuration } from "@/lib/operator-dashboard";

type FinalizedOrdersProps = {
  orders: FinalizedOperatorOrder[];
  timezone: string;
  query: string;
  filter: FinalizedOrderFilter;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: FinalizedOrderFilter) => void;
  onLoadMore: () => void;
  onOpen: (order: FinalizedOperatorOrder) => void;
};

const filters: Array<{ value: FinalizedOrderFilter; label: string }> = [
  { value: "ALL", label: "Todos" },
  { value: "DELIVERED", label: "Entregados" },
  { value: "CANCELLED", label: "Cancelados" },
];

export function FinalizedOrders({
  orders,
  timezone,
  query,
  filter,
  loading,
  loadingMore,
  hasMore,
  onQueryChange,
  onFilterChange,
  onLoadMore,
  onOpen,
}: FinalizedOrdersProps) {
  const hasFilters = query.trim().length > 0 || filter !== "ALL";

  return (
    <section className="finalized-section" aria-labelledby="finalized-title">
      <header className="finalized-header">
        <div>
          <p className="eyebrow">historial de la jornada</p>
          <h2 id="finalized-title">Pedidos finalizados</h2>
          <p>Entregados y cancelados, ordenados por su cierre más reciente.</p>
        </div>
        <div className="finalized-controls">
          <label className="order-search">
            <span className="sr-only">Buscar por número de pedido</span>
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Buscar pedido"
              inputMode="search"
            />
          </label>
          <div className="status-filters" aria-label="Filtrar pedidos finalizados">
            {filters.map((option) => (
              <button
                className={filter === option.value ? "status-filter is-active" : "status-filter"}
                aria-pressed={filter === option.value}
                key={option.value}
                onClick={() => onFilterChange(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {loading ? (
        <div className="finalized-loading" aria-label="Cargando pedidos finalizados">
          <span /><span /><span />
        </div>
      ) : orders.length === 0 ? (
        <div className="dashboard-empty">
          <span className="empty-mark" aria-hidden="true">✓</span>
          <h3>{hasFilters ? "No encontramos ese pedido" : "Aún no hay pedidos finalizados"}</h3>
          <p>{hasFilters ? "Prueba con otro número o cambia el filtro." : "Los pedidos entregados o cancelados aparecerán aquí."}</p>
        </div>
      ) : (
        <div className="finalized-table-wrap">
          <table className="finalized-table">
            <thead>
              <tr>
                <th scope="col">Pedido</th>
                <th scope="col">Creado</th>
                <th scope="col">Resultado</th>
                <th scope="col">Preparación</th>
                <th scope="col">Retiro</th>
                <th scope="col">Finalizado</th>
                <th scope="col"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <th data-label="Pedido" scope="row">#{order.orderNumber}</th>
                  <td data-label="Creado">{formatClock(order.createdAt, timezone)}</td>
                  <td data-label="Resultado"><OrderResult status={order.status} /></td>
                  <td data-label="Preparación">{order.preparationSeconds === null ? "—" : formatDuration(order.preparationSeconds)}</td>
                  <td data-label="Retiro">{order.pickupSeconds === null ? "—" : formatDuration(order.pickupSeconds)}</td>
                  <td data-label="Finalizado">{formatClock(order.closedAt, timezone)}</td>
                  <td className="table-action"><button className="row-detail-button" type="button" onClick={() => onOpen(order)}>Ver detalle</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && hasMore && (
        <button className="button button-quiet load-more" disabled={loadingMore} onClick={onLoadMore} type="button">
          {loadingMore ? "Cargando…" : "Cargar más"}
        </button>
      )}
    </section>
  );
}

export function OrderResult({ status }: { status: FinalizedOperatorOrder["status"] }) {
  return (
    <span className={`result-badge result-${status.toLowerCase()}`}>
      <span aria-hidden="true">{status === "DELIVERED" ? "✓" : "×"}</span>
      {status === "DELIVERED" ? "Entregado" : "Cancelado"}
    </span>
  );
}
