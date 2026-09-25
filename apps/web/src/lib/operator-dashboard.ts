import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { orderStatusSchema, type OrderStatus } from "@/domain/order";

const timestampSchema = z.iso.datetime({ offset: true });
const finalizedStatusSchema = z.enum(["DELIVERED", "CANCELLED"]);

const activeOrderSchema = z.object({
  id: z.number().int().positive(),
  orderNumber: z.string().min(1),
  status: z.enum(["RECEIVED", "PREPARING", "READY"]),
  estimatedReadyAt: timestampSchema,
  createdAt: timestampSchema,
  readyAt: timestampSchema.nullable(),
});

const finalizedOrderSchema = z.object({
  id: z.number().int().positive(),
  orderNumber: z.string().min(1),
  status: finalizedStatusSchema,
  createdAt: timestampSchema,
  closedAt: timestampSchema,
  preparationSeconds: z.number().int().nonnegative().nullable(),
  pickupSeconds: z.number().int().nonnegative().nullable(),
});

const dashboardSnapshotSchema = z.object({
  restaurantId: z.number().int().positive(),
  restaurantName: z.string().min(1),
  timezone: z.string().min(1),
  operationalDayStartedAt: timestampSchema,
  operationalDayEndedAt: timestampSchema,
  serverTime: timestampSchema,
  counts: z.object({
    received: z.number().int().nonnegative(),
    preparing: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative(),
    delivered: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
    totalCreated: z.number().int().nonnegative(),
    totalActive: z.number().int().nonnegative(),
  }),
  averagePreparationSeconds: z.number().int().nonnegative().nullable(),
  averagePickupSeconds: z.number().int().nonnegative().nullable(),
  activeOrders: z.array(activeOrderSchema),
  finalizedOrders: z.array(finalizedOrderSchema),
  hasMore: z.boolean(),
  nextCursor: z.object({
    closedAt: timestampSchema,
    id: z.number().int().positive(),
  }).nullable(),
});

const orderHistoryEventSchema = z.object({
  fromStatus: orderStatusSchema.nullable(),
  toStatus: orderStatusSchema,
  occurredAt: timestampSchema,
  reasonCode: z.string().nullable(),
  reasonText: z.string().nullable(),
});

const operatorOrderDetailSchema = z.object({
  id: z.number().int().positive(),
  orderNumber: z.string().min(1),
  status: finalizedStatusSchema,
  createdAt: timestampSchema,
  closedAt: timestampSchema,
  pickupInstructions: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  preparationSeconds: z.number().int().nonnegative().nullable(),
  pickupSeconds: z.number().int().nonnegative().nullable(),
  totalSeconds: z.number().int().nonnegative(),
  history: z.array(orderHistoryEventSchema),
});

export type ActiveOperatorOrder = z.infer<typeof activeOrderSchema>;
export type FinalizedOperatorOrder = z.infer<typeof finalizedOrderSchema>;
export type OperatorDashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>;
export type OperatorOrderDetail = z.infer<typeof operatorOrderDetailSchema>;
export type FinalizedOrderFilter = "ALL" | z.infer<typeof finalizedStatusSchema>;

type DashboardQuery = {
  restaurantId: number;
  limit?: number;
  cursor?: OperatorDashboardSnapshot["nextCursor"];
  query?: string;
  status?: FinalizedOrderFilter;
};

export async function getOperatorDashboardSnapshot(
  client: SupabaseClient,
  { restaurantId, limit = 25, cursor = null, query = "", status = "ALL" }: DashboardQuery,
): Promise<OperatorDashboardSnapshot> {
  const { data, error } = await client.rpc("get_operator_dashboard_snapshot", {
    requested_restaurant_id: restaurantId,
    requested_limit: limit,
    requested_before_closed_at: cursor?.closedAt ?? null,
    requested_before_id: cursor?.id ?? null,
    requested_query: query.trim() || null,
    requested_status: status === "ALL" ? null : status,
  });
  if (error) throw new Error(error.message);
  return dashboardSnapshotSchema.parse(data);
}

export async function getOperatorOrderDetail(
  client: SupabaseClient,
  orderId: number,
): Promise<OperatorOrderDetail> {
  const { data, error } = await client.rpc("get_operator_order_detail", {
    requested_order_id: orderId,
  });
  if (error) throw new Error(error.message);
  return operatorOrderDetailSchema.parse(data);
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Aún no hay datos";
  if (seconds < 60) return "<1 min";
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function formatClock(timestamp: string, timezone: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(new Date(timestamp));
}

export function formatOperationalDay(timestamp: string, timezone: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  }).format(new Date(timestamp));
}

export function getActiveStatusCount(
  snapshot: OperatorDashboardSnapshot,
  status: Extract<OrderStatus, "RECEIVED" | "PREPARING" | "READY">,
): number {
  return {
    RECEIVED: snapshot.counts.received,
    PREPARING: snapshot.counts.preparing,
    READY: snapshot.counts.ready,
  }[status];
}
