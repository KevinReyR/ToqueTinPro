import type { OrderStatus } from "./order";

export type EtaPresentation = {
  label: string;
  minutes: number | null;
  isOverdue: boolean;
};

export function etaPresentation(
  status: OrderStatus,
  estimatedReadyAt: string | null,
  now: Date,
): EtaPresentation {
  if (status === "READY") {
    return { label: "Listo para recoger", minutes: null, isOverdue: false };
  }

  if (status === "DELIVERED") {
    return { label: "Pedido entregado", minutes: null, isOverdue: false };
  }

  if (status === "CANCELLED") {
    return { label: "Pedido cancelado", minutes: null, isOverdue: false };
  }

  if (!estimatedReadyAt) {
    return { label: "Calculando tiempo", minutes: null, isOverdue: false };
  }

  const milliseconds = new Date(estimatedReadyAt).getTime() - now.getTime();
  const minutes = Math.ceil(milliseconds / 60_000);

  if (minutes <= 0) {
    return { label: "Casi listo", minutes: 0, isOverdue: true };
  }

  return { label: `~${minutes} min`, minutes, isOverdue: false };
}
