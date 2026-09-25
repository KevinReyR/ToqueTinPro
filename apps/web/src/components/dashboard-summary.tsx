import { formatDuration, type OperatorDashboardSnapshot } from "@/lib/operator-dashboard";

export function DashboardSummary({ snapshot }: { snapshot: OperatorDashboardSnapshot }) {
  const metrics = [
    { label: "Creados hoy", value: String(snapshot.counts.totalCreated), note: "en esta jornada" },
    { label: "Activos", value: String(snapshot.counts.totalActive), note: "requieren seguimiento" },
    { label: "Preparación media", value: formatDuration(snapshot.averagePreparationSeconds), note: "de preparando a listo" },
    { label: "Retiro medio", value: formatDuration(snapshot.averagePickupSeconds), note: "de listo a entregado" },
  ];

  return (
    <dl className="dashboard-summary" aria-label="Resumen de la jornada">
      {metrics.map((metric) => (
        <div className="summary-metric" key={metric.label}>
          <dt>{metric.label}</dt>
          <dd>{metric.value}</dd>
          <span>{metric.note}</span>
        </div>
      ))}
    </dl>
  );
}
