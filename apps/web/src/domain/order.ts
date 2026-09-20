import { z } from "zod";

export const orderStatuses = [
  "RECEIVED",
  "PREPARING",
  "READY",
  "DELIVERED",
  "CANCELLED",
] as const;

export const orderStatusSchema = z.enum(orderStatuses);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const deliveryChannels = [
  "WEB_PUSH",
  "APNS_LIVE_ACTIVITY",
  "FCM_LIVE_UPDATE",
] as const;
export const deliveryChannelSchema = z.enum(deliveryChannels);
export type DeliveryChannel = z.infer<typeof deliveryChannelSchema>;

export const deliveryEventKinds = [
  "TRACKING_STARTED",
  "STATUS_CHANGED",
  "ESTIMATE_CHANGED",
  "ORDER_READY",
  "ORDER_CLOSED",
  "TRACKING_REVOKED",
] as const;
export const deliveryEventKindSchema = z.enum(deliveryEventKinds);
export type DeliveryEventKind = z.infer<typeof deliveryEventKindSchema>;

const utcTimestampSchema = z.iso.datetime({ offset: true });

export const publicTrackingSnapshotSchema = z.object({
  restaurantName: z.string().min(1),
  orderNumber: z.string().min(1),
  status: orderStatusSchema,
  estimatedReadyAt: utcTimestampSchema.nullable(),
  estimateUpdatedAt: utcTimestampSchema.nullable(),
  pickupInstructions: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  serverTime: utcTimestampSchema,
  version: z.number().int().nonnegative(),
  activityExpiresAt: utcTimestampSchema.nullable(),
  lastUpdatedAt: utcTimestampSchema,
});

export type PublicTrackingSnapshot = z.infer<
  typeof publicTrackingSnapshotSchema
>;

const transitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  RECEIVED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return transitions[from].includes(to);
}

export function statusLabel(status: OrderStatus): string {
  return {
    RECEIVED: "Recibido",
    PREPARING: "Preparando",
    READY: "Listo para recoger",
    DELIVERED: "Entregado",
    CANCELLED: "Cancelado",
  }[status];
}

export function statusStep(status: OrderStatus): number {
  return {
    RECEIVED: 1,
    PREPARING: 2,
    READY: 3,
    DELIVERED: 4,
    CANCELLED: 0,
  }[status];
}
