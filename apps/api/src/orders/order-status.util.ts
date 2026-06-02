import { OrderStatus } from '@prisma/client';

/** UI / legacy filter values mapped to Prisma OrderStatus. */
const ORDER_STATUS_ALIASES: Record<string, OrderStatus> = {
  PENDING: OrderStatus.SUBMITTED,
  QUEUED: OrderStatus.SUBMITTED,
  SHIPPED: OrderStatus.PROCESSING,
  DISPATCHED: OrderStatus.PROCESSING,
  FULFILLED: OrderStatus.COMPLETED,
};

const VALID = new Set<string>(Object.values(OrderStatus));

export function normalizeOrderStatusFilter(status?: string): OrderStatus | undefined {
  if (!status?.trim()) return undefined;
  const key = status.trim().toUpperCase();
  const mapped = ORDER_STATUS_ALIASES[key] ?? key;
  if (!VALID.has(mapped)) return undefined;
  return mapped as OrderStatus;
}

export function normalizeOrderStatusUpdate(status: string): OrderStatus {
  const normalized = normalizeOrderStatusFilter(status);
  if (!normalized) {
    throw new Error(
      `Invalid order status "${status}". Allowed: ${[...VALID].join(', ')}`,
    );
  }
  return normalized;
}
