export function SystemPreview() {
  return (
    <aside className="system-preview" aria-label="Vista previa en pantalla bloqueada">
      <p className="preview-label">visible sin abrir el teléfono</p>
      <div className="island" aria-label="Dynamic Island">
        <span aria-hidden="true">●</span>
        <span>Pedido #143</span>
        <span className="island-time">~4 min</span>
      </div>
      <div className="lock-card">
        <div className="lock-head"><span>Cocina La Esquina</span><span>ahora</span></div>
        <p className="lock-status">Preparando</p>
        <p className="lock-eta">Pedido 143 · aproximadamente 4 min</p>
        <div className="progress-line" aria-label="2 de 4 etapas completadas">
          <span className="progress-segment active" />
          <span className="progress-segment active" />
          <span className="progress-segment" />
          <span className="progress-segment" />
        </div>
      </div>
    </aside>
  );
}
