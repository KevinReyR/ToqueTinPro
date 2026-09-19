import type { Metadata } from "next";
import { TrackingExperience } from "@/components/tracking-experience";

export const metadata: Metadata = { title: "Pedido 143" };
export const dynamic = "force-dynamic";

export default function TrackingPreviewPage() {
  const serverTime = new Date();
  const estimatedReadyAt = new Date(serverTime.getTime() + 4 * 60_000);
  return <TrackingExperience snapshot={{ restaurantName: "Cocina La Esquina", orderNumber: "143", status: "PREPARING", estimatedReadyAt: estimatedReadyAt.toISOString(), estimateUpdatedAt: serverTime.toISOString(), pickupInstructions: "Acércate a la barra central cuando aparezca como listo.", cancellationReason: null, serverTime: serverTime.toISOString(), version: 4, activityExpiresAt: new Date(serverTime.getTime() + 8 * 60 * 60_000).toISOString(), lastUpdatedAt: serverTime.toISOString() }} />;
}
