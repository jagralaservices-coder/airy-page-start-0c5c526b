/**
 * RealtimeContext — Phase 2C extraction.
 *
 * Centralized Supabase Realtime channel registry. Instead of every hook
 * calling `supabase.channel(...).subscribe()` (which spawns N connections
 * and duplicate listeners), consumers register a table + handler and this
 * provider guarantees a SINGLE channel per (schema, table, filter) tuple.
 *
 * Public API:
 *   const { subscribe } = useRealtime();
 *   useEffect(() => subscribe(
 *     { table: 'orders', filter: 'store_id=eq.' + storeId },
 *     (payload) => { ... }
 *   ), [storeId]);
 *
 * Or the convenience hook:
 *   useRealtimeTable('orders', payload => ..., { filter: '...' });
 *
 * Additive: existing `supabase.channel(...)` call sites keep working. Migrate
 * them opportunistically in later turns.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface RealtimeSubscribeOptions {
  schema?: string;
  table: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  filter?: string;
}

type Handler = (payload: any) => void;

interface Entry {
  channel: RealtimeChannel;
  handlers: Set<Handler>;
  key: string;
}

function makeKey(opts: RealtimeSubscribeOptions): string {
  const { schema = 'public', table, event = '*', filter = '' } = opts;
  return `${schema}::${table}::${event}::${filter}`;
}

export interface RealtimeContextValue {
  subscribe: (opts: RealtimeSubscribeOptions, handler: Handler) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined);

export const RealtimeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const registry = useRef<Map<string, Entry>>(new Map());

  const subscribe = useCallback((opts: RealtimeSubscribeOptions, handler: Handler) => {
    const key = makeKey(opts);
    let entry = registry.current.get(key);
    if (!entry) {
      const { schema = 'public', table, event = '*', filter } = opts;
      const channel = supabase
        .channel(`shared:${key}`)
        .on(
          // Supabase JS uses a loose type here; the cast keeps TS happy while
          // the runtime string matches the Postgres CDC contract.
          'postgres_changes' as any,
          { event, schema, table, ...(filter ? { filter } : {}) } as any,
          (payload: any) => {
            const e = registry.current.get(key);
            if (!e) return;
            e.handlers.forEach((h) => {
              try { h(payload); } catch (err) { console.warn('[Realtime] handler error', err); }
            });
          },
        )
        .subscribe();
      entry = { channel, handlers: new Set(), key };
      registry.current.set(key, entry);
    }
    entry.handlers.add(handler);

    return () => {
      const e = registry.current.get(key);
      if (!e) return;
      e.handlers.delete(handler);
      if (e.handlers.size === 0) {
        supabase.removeChannel(e.channel);
        registry.current.delete(key);
      }
    };
  }, []);

  // Tear everything down on sign-out to avoid dangling channels with stale
  // auth tokens (Supabase Realtime rejects those and busy-loops reconnects).
  useEffect(() => {
    if (isAuthenticated) return;
    const current = registry.current;
    current.forEach((e) => supabase.removeChannel(e.channel));
    current.clear();
  }, [isAuthenticated]);

  useEffect(() => {
    const current = registry.current;
    return () => {
      current.forEach((e) => supabase.removeChannel(e.channel));
      current.clear();
    };
  }, []);

  const value = useMemo<RealtimeContextValue>(() => ({ subscribe }), [subscribe]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used within a RealtimeProvider');
  return ctx;
}

export function useRealtimeSafe(): RealtimeContextValue | null {
  return useContext(RealtimeContext) ?? null;
}

/** Convenience hook: subscribe for the lifetime of the component. */
export function useRealtimeTable(
  table: string,
  handler: Handler,
  opts?: Omit<RealtimeSubscribeOptions, 'table'>,
): void {
  const rt = useRealtimeSafe();
  useEffect(() => {
    if (!rt) return;
    const unsub = rt.subscribe({ table, ...(opts || {}) }, handler);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt, table, opts?.schema, opts?.event, opts?.filter]);
}
