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
  | 'pos:menu-updated'
  | 'pos:order-created'
  | 'pos:order-updated'
  | 'pos:customer-updated'
  | 'pos:attendance-updated'
  | 'pos:subscription-updated';

export interface PosEventPayloads {
  'pos:store-changed': { storeId: string | null } | void;
  'pos:active-store-changed': { storeId: string | null } | void;
  'pos:inventory-updated': { itemId?: string; storeId?: string | null } | void;
  'pos:menu-updated': { storeId?: string | null } | void;
  'pos:order-created': { orderId: string; storeId?: string | null } | void;
  'pos:order-updated': { orderId: string; storeId?: string | null } | void;
  'pos:customer-updated': { customerId?: string } | void;
  'pos:attendance-updated': { staffId?: string } | void;
  'pos:subscription-updated': void;
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
