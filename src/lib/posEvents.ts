/**
 * posEvents — Phase 2C typed event bus.
 *
 * A thin wrapper around window CustomEvents that gives the app one place to
 * emit/subscribe to POS-wide notifications. The old `pos:active-store-changed`
 * / `pos:store-changed` / ad-hoc `window.dispatchEvent(new CustomEvent(...))`
 * scatter is replaced by two functions: `emitPosEvent` and `onPosEvent`.
 *
 * Additive: we intentionally emit the raw browser events so every existing
 * `window.addEventListener('pos:...')` in the codebase keeps working. New
 * code should use these helpers so the surface can be swapped later without
 * touching consumers.
 */

export type PosEventName =
  | 'pos:store-changed'
  | 'pos:active-store-changed' // legacy alias, always co-emitted with store-changed
  | 'pos:inventory-updated'
  | 'pos:inventory-adjusted'
  | 'pos:stock-deducted'
  | 'pos:recipe-updated'
  | 'pos:menu-updated'
  | 'pos:products-updated'
  | 'pos:order-created'
  | 'pos:order-updated'
  | 'pos:order-completed'
  | 'pos:order-cancelled'
  | 'pos:customer-updated'
  | 'pos:customer-created'
  | 'pos:customer-deleted'
  | 'pos:credit-updated'
  | 'pos:credit-payment-added'
  | 'pos:credit-cleared'
  | 'pos:attendance-updated'
  | 'pos:subscription-updated'
  // Slice 5: Tables + KOT typed events.
  | 'pos:table-updated'
  | 'pos:table-status-changed'
  | 'pos:kot-created'
  | 'pos:kot-updated'
  | 'pos:kot-completed'
  | 'pos:kot-cancelled'
  // Slice 6: Held Bills + Offline Sync typed events.
  | 'pos:heldbill-created'
  | 'pos:heldbill-updated'
  | 'pos:heldbill-deleted'
  | 'pos:sync-started'
  | 'pos:sync-completed'
  | 'pos:sync-failed'
  | 'pos:queue-updated'
  // Slice 8: Expenses + Reports/Dashboard/Analytics derived caches.
  | 'pos:expense-updated'
  | 'pos:reports-refreshed'
  // Slice 9: Staff / Attendance / Leaves / Shifts / Payroll read models.
  | 'pos:staff-updated'
  | 'pos:leave-updated'
  | 'pos:shift-updated'
  | 'pos:payroll-updated';

export interface PosEventPayloads {
  'pos:store-changed': { storeId: string | null } | void;
  'pos:active-store-changed': { storeId: string | null } | void;
  'pos:inventory-updated': { itemId?: string; storeId?: string | null } | void;
  'pos:inventory-adjusted': { itemId?: string; storeId?: string | null; delta?: number } | void;
  'pos:stock-deducted': { orderId?: string; storeId?: string | null } | void;
  'pos:recipe-updated': { parentInventoryId?: string; storeId?: string | null } | void;
  'pos:menu-updated': { storeId?: string | null } | void;
  'pos:products-updated': { productId?: string; storeId?: string | null } | void;
  'pos:order-created': { orderId: string; storeId?: string | null } | void;
  'pos:order-updated': { orderId: string; storeId?: string | null } | void;
  'pos:order-completed': { orderId?: string; storeId?: string | null } | void;
  'pos:order-cancelled': { orderId?: string; storeId?: string | null } | void;
  'pos:customer-updated': { customerId?: string } | void;
  'pos:customer-created': { customerId?: string } | void;
  'pos:customer-deleted': { customerId?: string } | void;
  'pos:credit-updated': { creditId?: string; customerId?: string; storeId?: string | null } | void;
  'pos:credit-payment-added': { creditId?: string; paymentId?: string; storeId?: string | null } | void;
  'pos:credit-cleared': { creditId?: string; customerId?: string; storeId?: string | null } | void;
  'pos:attendance-updated': { staffId?: string } | void;
  'pos:subscription-updated': void;
  'pos:table-updated': { tableId?: string; storeId?: string | null } | void;
  'pos:table-status-changed': { tableId?: string; status?: string; storeId?: string | null } | void;
  'pos:kot-created': { kotId?: string; orderId?: string; storeId?: string | null } | void;
  'pos:kot-updated': { kotId?: string; orderId?: string; storeId?: string | null } | void;
  'pos:kot-completed': { kotId?: string; orderId?: string; storeId?: string | null } | void;
  'pos:kot-cancelled': { kotId?: string; orderId?: string; storeId?: string | null } | void;
  // Slice 6: Held Bills + Offline Sync payloads.
  'pos:heldbill-created': { billId?: string; storeId?: string | null } | void;
  'pos:heldbill-updated': { billId?: string; storeId?: string | null } | void;
  'pos:heldbill-deleted': { billId?: string; storeId?: string | null } | void;
  'pos:sync-started': { storeId?: string | null; reason?: string } | void;
  'pos:sync-completed': { storeId?: string | null; drained?: number } | void;
  'pos:sync-failed': { storeId?: string | null; error?: string } | void;
  'pos:queue-updated': { pending?: number; poisoned?: number } | void;
  // Slice 8: Expenses + derived cache refresh events.
  'pos:expense-updated': { expenseId?: string; storeId?: string | null } | void;
  'pos:reports-refreshed': { storeId?: string | null; reportType?: string } | void;
}



export function emitPosEvent<T extends PosEventName>(
  name: T,
  detail?: PosEventPayloads[T],
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
  // Keep the legacy sibling in sync so existing listeners on either name fire.
  if (name === 'pos:store-changed') {
    window.dispatchEvent(new CustomEvent('pos:active-store-changed', { detail }));
  } else if (name === 'pos:active-store-changed') {
    window.dispatchEvent(new CustomEvent('pos:store-changed', { detail }));
  }
}

export function onPosEvent<T extends PosEventName>(
  name: T,
  handler: (detail: PosEventPayloads[T]) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const wrapped = (e: Event) => handler((e as CustomEvent).detail as PosEventPayloads[T]);
  window.addEventListener(name, wrapped);
  return () => window.removeEventListener(name, wrapped);
}
