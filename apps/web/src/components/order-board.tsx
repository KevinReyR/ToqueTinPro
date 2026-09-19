type BoardOrder = {
  number: string;
  eta: string;
  age: string;
  action: string;
};

const columns: Array<{ title: string; orders: BoardOrder[] }> = [
  {
    title: "Recibidos",
    orders: [
      { number: "148", eta: "~12 min", age: "hace 2 min", action: "Empezar preparación" },
      { number: "149", eta: "~18 min", age: "ahora", action: "Empezar preparación" },
    ],
  },
  {
    title: "Preparando",
    orders: [
      { number: "143", eta: "~4 min", age: "hace 8 min", action: "Marcar como listo" },
      { number: "146", eta: "Casi listo", age: "hace 13 min", action: "Marcar como listo" },
    ],
  },
  {
    title: "Listos",
    orders: [
      { number: "141", eta: "Esperando retiro", age: "listo hace 3 min", action: "Confirmar entrega" },
    ],
  },
];

export function OrderBoard() {
  return (
    <div className="board">
      {columns.map((column) => (
        <section className="board-column" key={column.title}>
          <header className="column-head">
            <h3>{column.title}</h3>
            <span className="column-count">{column.orders.length}</span>
          </header>
          {column.orders.map((order) => (
            <article className="order-card" key={order.number}>
              <p className="order-number">#{order.number}</p>
              <div className="order-meta"><span>{order.eta}</span><span>{order.age}</span></div>
              <button className="button button-accent card-action" type="button">{order.action}</button>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
