import { supabase } from '@/integrations/supabase/client';
import {
  getOrders, setOrders,
  getCreditLedger, setCreditLedger,
  getCreditPayments, setCreditPayments,
  getCustomers, setCustomers,
  safeMerge,
} from './store';
import { idb, bulkPutRecords, CoreTable } from './idb';
import {
  pendingForStore, ackSuccess, ackFailure, withLeaderLock,
  adoptOrphanedItems, queueStats, listPoisoned,
  retryPoisoned, discardPoisoned,
} from './syncQueue';
import { runIDBMigration } from './idbMigration';

const getStoreId = () => {
  const storeData = localStorage.getItem('pos_active_store_data');
  if (storeData) {
    try {
      const parsed = JSON.parse(storeData);
      if (parsed?.id) return parsed.id;
    } catch {}
  }
  const activeStore = localStorage.getItem('pos_active_store');
  if (activeStore) {
    try { return JSON.parse(activeStore); } catch { return activeStore; }
  }
  return null;
};

// Build the server-side metadata envelope from a queue item.
// Phase 2.5 — single JSONB column on orders/customers/menu_items/products.
const buildMetadata = (item: any, storeId: string) => ({
  organization_id: item.organization_id || '',
  store_id: storeId,
  session_id: item.session_id || '',
  version_number: typeof item.version_number === 'number' ? item.version_number : 1,
  updated_by: item.updated_by || '',
  updated_at: new Date().toISOString(),
});

// Map a queue item to the Supabase row payload for that table.
const buildPayload = (table: CoreTable, payload: any, storeId: string, queueItem?: any): any => {
  const metadata = queueItem ? buildMetadata(queueItem, storeId) : undefined;
  switch (table) {
    case 'orders':
      return {
        id: payload.id,
        store_id: payload.storeId || payload.store_id || storeId,
        bill_number: payload.billNumber,
        items: payload.items,
        subtotal: payload.subtotal,
        tax: payload.tax,
        discount: payload.discount,
        total: payload.total,
        status: payload.status,
        order_type: payload.orderType,
        table_number: payload.tableNumber,
        customer_name: payload.customerName,
        customer_phone: payload.customerPhone,
        payment_method: payload.paymentMethod,
        created_at: payload.createdAt,
        cancel_reason: payload.cancelReason,
        cancelled_at: payload.cancelledAt,
        payment_breakdown: payload.paymentBreakdown,
        ...(metadata ? { metadata } : {}),
      };
    case 'credit_ledger': {
      // Phase 2.6 — normalized schema (customer_id, order_id, due_amount, status).
      // Strip legacy display fields so PostgREST doesn't reject the row.
      return {
        id: payload.id,
        store_id: payload.store_id || storeId,
        customer_id: payload.customer_id,
        order_id: payload.order_id || null,
        due_amount: Number(payload.due_amount || 0),
        paid_amount: Number(payload.paid_amount || 0),
        status: payload.status || (Number(payload.due_amount) <= 0 ? 'paid' : (Number(payload.paid_amount) > 0 ? 'partial' : 'open')),
        notes: payload.notes ?? null,
        created_at: typeof payload.created_at === 'string' ? payload.created_at : new Date(payload.created_at || Date.now()).toISOString(),
        ...(metadata ? { metadata } : {}),
      };
    }
    case 'credit_payments' as any: {
      return {
        id: payload.id,
        store_id: payload.store_id || storeId,
        credit_ledger_id: payload.credit_ledger_id || payload.credit_id,
        amount: Number(payload.amount || 0),
        payment_method: payload.payment_method,
        reference: payload.reference || payload.received_by || null,
        created_at: typeof payload.created_at === 'string' ? payload.created_at : new Date(payload.created_at || Date.now()).toISOString(),
        ...(metadata ? { metadata } : {}),
      };
    }
    case 'customers':
      // CRIT-2 resolved — route to dedicated pos_customers table (store-scoped).
      return {
        id: payload.id,
        store_id: payload.storeId || payload.store_id || storeId,
        name: payload.name,
        phone: payload.phone,
        email: payload.email,
        address: payload.address,
        city: payload.city,
        state: payload.state,
        pincode: payload.pincode,
        credit_limit: payload.creditLimit ?? payload.credit_limit ?? 0,
        credit_balance: payload.creditBalance ?? payload.credit_balance ?? 0,
        notes: payload.notes,
        created_at: payload.createdAt || payload.created_at,
        ...(metadata ? { metadata } : {}),
      };
    case 'menu_items':
      return {
        id: payload.id,
        store_id: storeId,
        name: payload.name,
        price: payload.price,
        category_id: payload.category,
        is_available: payload.isAvailable,
        stock: payload.stock,
        sku: payload.sku,
        barcode: payload.barcode,
        image_url: payload.image,
        updated_at: payload.lastUpdated || new Date().toISOString(),
        ...(metadata ? { metadata } : {}),
      };
    case 'inventory': {
      const p = { ...payload };
      delete p.pendingSync;
      delete p.lastUpdated;
      if (!p.store_id) p.store_id = storeId;
      if (metadata) p.metadata = metadata;
      return p;
    }
    default:
      return payload;
  }
};

// Which Supabase table receives upserts for a given core table.
const supabaseTableFor = (t: CoreTable): string => {
  switch (t) {
    case 'orders': return 'orders';
    case 'credit_ledger': return 'credit_ledger';
    case 'credit_payments' as any: return 'credit_payments';
    // CRIT-2 resolved — POS customers live in their own table.
    case 'customers': return 'pos_customers';
    case 'menu_items': return 'menu_items';
    case 'inventory': return 'products';
    default: return t;
  }
};

class SyncEngine {
  private isSyncing = false;
  private interval: any = null;
  private queueInterval: any = null;
  private realtimeChannel: any = null;
  private booted = false;
  private activeStoreId: string | null = null;
  public realtimeStatus: 'idle' | 'connecting' | 'subscribed' | 'closed' | 'error' = 'idle';
  public realtimeTables: string[] = [];

  async boot() {
    if (this.booted) return;
    this.booted = true;
    await runIDBMigration();
  }

  start() {
    if (typeof window === 'undefined') return;

    // Fire-and-forget boot: migrate localStorage → IDB and hydrate back.
    this.boot();

    window.addEventListener('online', this.onOnline);
    // Pull loop (cloud → local)
    this.interval = setInterval(this.sync, 30000);
    // Queue drain loop (local → cloud) — faster cadence
    this.queueInterval = setInterval(this.drainQueue, 5000);

    setTimeout(this.sync, 2000);
    setTimeout(this.drainQueue, 1000);

    // Phase 3 — rebind realtime when the active store changes.
    //   * 'storage' fires only in OTHER tabs (HIGH-1 fix: also covered via sync/drain ticks)
    //   * 'pos:active-store-changed' is a custom event dispatched in the SAME tab by
    //     store-switch UI; gives instant rebind without waiting for the next tick.
    window.addEventListener('storage', this.onStorage);
    window.addEventListener('pos:active-store-changed', this.bindRealtime as any);

    // Sync Latency Optimization — drain immediately when something is enqueued.
    window.addEventListener('pos:queue-enqueued', this.onQueueEnqueued as any);

    this.bindRealtime();
  }

  // Coalesce burst enqueues (cart of N items) into a single drain within 75ms.
  private drainCoalesceTimer: any = null;
  private onQueueEnqueued = (_e?: Event) => {
    if (this.drainCoalesceTimer) return;
    this.drainCoalesceTimer = setTimeout(() => {
      this.drainCoalesceTimer = null;
      this.drainQueue();
    }, 75);
  };

  private onStorage = (e: StorageEvent) => {
    if (e.key === 'pos_active_store_data' || e.key === 'pos_active_store') {
      this.bindRealtime();
    }
  };

  // Phase 3 — expanded realtime coverage. Re-binds when the active store changes.
  private bindRealtime = () => {
    const storeId = getStoreId();
    if (!storeId) return;
    if (this.activeStoreId === storeId && this.realtimeChannel) return;

    if (this.realtimeChannel) {
      try { supabase.removeChannel(this.realtimeChannel); } catch {}
      this.realtimeChannel = null;
    }

    this.activeStoreId = storeId;
    this.realtimeStatus = 'connecting';
    // CRIT-1 + CRIT-2 resolved — pos_customers, credit_ledger, credit_payments now exist
    // with store_id columns and metadata triggers. All bindings are filtered by store_id.
    this.realtimeTables = ['orders', 'menu_items', 'products', 'pos_customers', 'credit_ledger', 'credit_payments'];

    this.realtimeChannel = supabase.channel(`sync-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders',           filter: `store_id=eq.${storeId}` }, this.handleRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items',       filter: `store_id=eq.${storeId}` }, this.handleRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products',         filter: `store_id=eq.${storeId}` }, this.handleRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_customers',    filter: `store_id=eq.${storeId}` }, this.handleRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_ledger',    filter: `store_id=eq.${storeId}` }, this.handleRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_payments',  filter: `store_id=eq.${storeId}` }, this.handleRemoteChange)
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') this.realtimeStatus = 'subscribed';
        else if (status === 'CLOSED') this.realtimeStatus = 'closed';
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.realtimeStatus = 'error';
      });
  };

  // Public: call after store switching so we re-bind to the new store_id.
  rebindRealtime = () => { this.bindRealtime(); };

  private onOnline = () => {
    this.drainQueue();
    this.sync();
  };

  // Coalesce realtime bursts into a single conflict-aware pull within 200ms.
  private pullCoalesceTimer: any = null;
  handleRemoteChange = (payload?: any) => {
    // Per-table fan-out so module hooks can refresh instantly without waiting
    // for the coalesced pull to finish.
    try {
      const table = payload?.table;
      if (table && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pos:remote-change', { detail: { table } }));
      }
    } catch {}
    if (this.pullCoalesceTimer) return;
    this.pullCoalesceTimer = setTimeout(() => {
      this.pullCoalesceTimer = null;
      this.sync();
    }, 200);
  };

  stop() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('storage', this.onStorage);
      window.removeEventListener('pos:active-store-changed', this.bindRealtime as any);
      window.removeEventListener('pos:queue-enqueued', this.onQueueEnqueued as any);
    }
    if (this.interval) clearInterval(this.interval);
    if (this.queueInterval) clearInterval(this.queueInterval);
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  // ---- Push: drain the persistent IndexedDB sync queue ----
  // R1: menu_items / inventory go through the production sync-store-data edge
  // function (which knows the real schemas, RLS, and required fields).
  // R3: adopt any orphaned items (empty store_id) under the current store.
  // CRIT-1 + CRIT-2 resolved — all core POS tables now exist with metadata + RLS.
  // Empty set kept here as a quick kill-switch if a future table needs to be muted.
  private DISABLED_SYNC_TABLES = new Set<string>();

  drainQueue = async () => {
    if (!navigator.onLine) return;
    const storeId = getStoreId();
    if (!storeId) return;

    // HIGH-1: detect same-tab store switch and rebind realtime before draining.
    if (storeId !== this.activeStoreId) this.bindRealtime();

    await withLeaderLock('pos_sync_queue_drain', async () => {
      const adopted = await adoptOrphanedItems(storeId);
      if (adopted > 0) {
        console.log('[SyncEngine] Adopted', adopted, 'orphaned queue items under store', storeId);
      }

      const items = await pendingForStore(storeId);
      if (!items.length) return;

      const storeCode = (() => {
        try {
          const sd = localStorage.getItem('pos_active_store_data');
          return sd ? JSON.parse(sd)?.storeCode : null;
        } catch { return null; }
      })();

      // Group by (table, op) so menu_items / inventory can batch.
      const groups = new Map<string, typeof items>();
      for (const it of items) {
        const key = `${it.table}::${it.op}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(it);
      }

      let ackedThisDrain = 0;
      const affectedTables = new Set<string>();
      for (const [key, batch] of groups) {
        const [table, op] = key.split('::') as [CoreTable, 'upsert' | 'delete'];

        if (this.DISABLED_SYNC_TABLES.has(table)) {
          for (const it of batch) await ackSuccess(it.id!);
          console.warn('[SyncEngine] sync disabled for table — dropping queued items', {
            table, count: batch.length,
          });
          ackedThisDrain += batch.length;
          continue;
        }


        const useEdgeFn = table === 'menu_items' || table === 'inventory';

        const before = batch.length;
        if (useEdgeFn) {
          await this.drainViaEdgeFunction(table, op, batch, storeId, storeCode);
        } else {
          await this.drainViaBatchUpsert(table, op, batch, storeId);
        }
        // ackSuccess removes rows from the queue; count by remainder.
        const remaining = (await pendingForStore(storeId)).filter(p => p.table === table && p.op === op).length;
        const acked = Math.max(0, before - remaining);
        ackedThisDrain += acked;
        if (acked > 0) affectedTables.add(table);
      }

      // Phase 3 — throughput metrics
      try {
        const { metaSet, metaGet } = await import('./idb');
        const prev = (await metaGet<number>('drain_acked_total')) || 0;
        await metaSet('drain_acked_total', prev + ackedThisDrain);
        await metaSet('last_drain_at', new Date().toISOString());
        await metaSet('last_drain_count', ackedThisDrain);
      } catch {}

      // Sync Latency Optimization — notify module hooks that pushes landed so they
      // can refresh from cloud immediately, instead of waiting for their 60/90s tick.
      if (affectedTables.size && typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('pos:queue-drained', {
            detail: { tables: Array.from(affectedTables) },
          }));
        } catch {}
      }
    });
  };


  private async drainViaEdgeFunction(
    table: CoreTable,
    op: 'upsert' | 'delete',
    batch: any[],
    storeId: string,
    storeCode: string | null,
  ) {
    // Edge function data_type names
    const dataType = table === 'inventory' ? 'inventory' : 'menu_items';

    const body: any = { store_id: storeId, data_type: dataType };
    if (storeCode) body.store_code = storeCode;

    if (op === 'delete') {
      body.action = 'delete';
      body.item_ids = batch.map(b => b.record_id);
    } else {
      body.action = 'save';
      // Phase 2.5: include client metadata envelope so the edge function
      // can forward it into the row's metadata JSONB.
      body.items = batch.map(b => ({
        ...b.payload,
        metadata: {
          organization_id: b.organization_id || '',
          store_id: storeId,
          session_id: b.session_id || '',
          version_number: typeof b.version_number === 'number' ? b.version_number : 1,
          updated_by: b.updated_by || '',
          updated_at: new Date().toISOString(),
        },
      }));
    }

    try {
      const { data, error } = await supabase.functions.invoke('sync-store-data', { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      for (const b of batch) await ackSuccess(b.id!);
    } catch (e: any) {
      for (const b of batch) await ackFailure(b.id!, e);
      console.warn('[SyncEngine] edge-fn batch failed', { table, op, size: batch.length, err: e?.message || e });
    }
  }

  // Phase 3 — batch upserts in chunks of 50 to slash round-trips.
  private async drainViaBatchUpsert(
    table: CoreTable,
    op: 'upsert' | 'delete',
    batch: any[],
    storeId: string,
  ) {
    const supaTable = supabaseTableFor(table);
    const CHUNK = 50;

    if (op === 'delete') {
      for (let i = 0; i < batch.length; i += CHUNK) {
        const slice = batch.slice(i, i + CHUNK);
        const ids = slice.map(it => it.record_id);
        try {
          const { error } = await supabase.from(supaTable as any).delete().in('id', ids);
          if (error && (error as any).code !== 'PGRST116') throw error;
          for (const it of slice) await ackSuccess(it.id!);
        } catch (e: any) {
          // Fall back to per-item so one bad row doesn't poison the batch
          for (const it of slice) {
            try {
              const { error } = await supabase.from(supaTable as any).delete().eq('id', it.record_id);
              if (error && (error as any).code !== 'PGRST116') throw error;
              await ackSuccess(it.id!);
            } catch (er) { await ackFailure(it.id!, er); }
          }
        }
      }
      return;
    }

    for (let i = 0; i < batch.length; i += CHUNK) {
      const slice = batch.slice(i, i + CHUNK);
      const payloads = slice.map(it => buildPayload(table, it.payload, storeId, it));
      try {
        const { error } = await supabase.from(supaTable as any).upsert(payloads, { onConflict: 'id' });
        if (error) throw error;
        for (const it of slice) await ackSuccess(it.id!);
      } catch (e: any) {
        // Fall back per-item so conflict (40001) or RLS error attaches to the right row
        for (const it of slice) {
          try {
            const payload = buildPayload(table, it.payload, storeId, it);
            const { error } = await supabase.from(supaTable as any).upsert(payload, { onConflict: 'id' });
            if (error) throw error;
            await ackSuccess(it.id!);
          } catch (er) {
            console.warn('[SyncEngine] queue item failed:', table, it.record_id, (er as any)?.message || er);
            await ackFailure(it.id!, er);
          }
        }
      }
    }
  }



  // ---- Pull: cloud → local with conflict-aware merging (Phase 2) ----
  sync = async () => {
    if (!navigator.onLine || this.isSyncing) return;
    this.isSyncing = true;
    try {
      const storeId = getStoreId();
      if (!storeId) return;

      // HIGH-1: detect same-tab store switch and rebind realtime.
      if (storeId !== this.activeStoreId) this.bindRealtime();

      await this.pullOrders(storeId);
      // CRIT-1 + CRIT-2 resolved — all four pulls re-enabled.
      await this.pullCreditLedger(storeId);
      await this.pullCreditPayments(storeId);
      await this.pullCustomers(storeId);
      await this.pullMenuItemsToIDB(storeId);
      await this.pullProductsToIDB(storeId);

      // Track last successful pull for the admin panel
      try {
        const { metaSet, metaGet } = await import('./idb');
        await metaSet('last_sync_at', new Date().toISOString());
        const prev = (await metaGet<number>('pull_count')) || 0;
        await metaSet('pull_count', prev + 1);
      } catch {}
    } catch (e) {
      console.error('[SyncEngine] Sync failed', e);
    } finally {
      this.isSyncing = false;
    }
  };

  // Apply Phase 2 conflict rules: filter incoming cloud rows so they cannot
  // overwrite pending local edits, lower versions, or older timestamps.
  // Falls back gracefully if the conflicts module fails to load.
  private async applyConflictRules(
    table: CoreTable,
    storeId: string,
    localItems: any[],
    cloudItems: any[],
  ): Promise<any[]> {
    try {
      const { filterApplicableCloudRows } = await import('./conflicts');
      const localById = new Map(localItems.map((i: any) => [String(i?.id), i]));
      return await filterApplicableCloudRows(table, storeId, localById, cloudItems);
    } catch (e) {
      console.warn('[SyncEngine] conflict filter unavailable, falling back to safeMerge', e);
      return cloudItems;
    }
  }

  private async pullOrders(storeId: string) {
    const { data, error } = await supabase.from('orders').select('*').eq('store_id', storeId).limit(200).order('created_at', { ascending: false });
    if (!data || error) return;
    const cloudItems = data.map((row: any) => ({
      ...row,
      billNumber: row.bill_number,
      orderType: row.order_type,
      tableNumber: row.table_number,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      paymentMethod: row.payment_method,
      createdAt: row.created_at,
      cancelReason: row.cancel_reason,
      cancelledAt: row.cancelled_at,
      paymentBreakdown: row.payment_breakdown,
      storeId: row.store_id,
    }));
    const local = getOrders();
    const applicable = await this.applyConflictRules('orders', storeId, local, cloudItems);
    const merged = safeMerge(local, applicable as any);
    setOrders(merged);
    await bulkPutRecords('orders', merged.map((o: any) => ({
      id: String(o.id), store_id: storeId, data: o, updated_at: o.lastUpdated || o.updated_at || new Date().toISOString(),
    })));
  }

  private async pullCreditLedger(storeId: string) {
    // Phase 2.6 — embed pos_customers + orders for display field enrichment.
    const { data, error } = await supabase
      .from('credit_ledger')
      .select('*, pos_customers(id,name,phone), orders(id,bill_number)')
      .eq('store_id', storeId);
    if (!data || error) return;
    const cloudItems = (data as any[]).map((row: any) => {
      const status = (row.status || 'open') as 'open' | 'partial' | 'paid' | 'void';
      const paid = Number(row.paid_amount || 0);
      const due = Number(row.due_amount || 0);
      const paymentStatus = status === 'open' ? 'unpaid' : status;
      return {
        id: row.id,
        store_id: row.store_id,
        customer_id: row.customer_id,
        order_id: row.order_id,
        due_amount: due,
        paid_amount: paid,
        status,
        notes: row.notes,
        metadata: row.metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
        lastUpdated: row.updated_at || row.created_at,
        // Display mirrors (joined):
        customer_name: row.pos_customers?.name || '',
        customer_phone: row.pos_customers?.phone || null,
        bill_number: row.orders?.bill_number || null,
        total_amount: paid + due,
        payment_status: paymentStatus,
      };
    });
    const local = getCreditLedger();
    const applicable = await this.applyConflictRules('credit_ledger', storeId, local as any, cloudItems as any);
    const merged = safeMerge<any>(local as any, applicable as any);
    setCreditLedger(merged);
    await bulkPutRecords('credit_ledger', merged.map((o: any) => ({
      id: String(o.id), store_id: storeId, data: o, updated_at: o.updated_at || o.lastUpdated || new Date().toISOString(),
    })));
  }

  private async pullCreditPayments(storeId: string) {
    const { data, error } = await supabase.from('credit_payments').select('*').eq('store_id', storeId);
    if (!data || error) return;
    const cloudItems = (data as any[]).map((row: any) => ({
      ...row,
      credit_id: row.credit_ledger_id, // legacy alias for UI code
    }));
    setCreditPayments(safeMerge<any>(getCreditPayments() as any, cloudItems as any));
  }

  private async pullCustomers(storeId: string) {
    // CRIT-2 resolved — pulls from the dedicated, store-scoped pos_customers table.
    const { data, error } = await supabase
      .from('pos_customers' as any)
      .select('*')
      .eq('store_id', storeId)
      .limit(1000);
    if (!data || error) {
      if (error) console.warn('[SyncEngine] pullCustomers error', (error as any)?.message || error);
      return;
    }
    const cloudItems = (data as any[]).map((row: any) => ({
      ...row,
      createdAt: row.created_at,
      creditLimit: row.credit_limit,
      creditBalance: row.credit_balance,
      storeId: row.store_id,
    }));
    const local = getCustomers();
    const applicable = await this.applyConflictRules('customers', storeId, local, cloudItems);
    const merged = safeMerge(local, applicable as any);
    setCustomers(merged);
    await bulkPutRecords('customers', merged.map((c: any) => ({
      id: String(c.id), store_id: storeId, data: c,
      updated_at: c.updated_at || c.lastUpdated || c.createdAt || new Date().toISOString(),
    })));
  }

  private async pullMenuItemsToIDB(storeId: string) {
    const { data, error } = await supabase.from('menu_items').select('*').eq('store_id', storeId).limit(1000);
    if (!data || error) return;
    const localById = new Map<string, any>(); // no local hot-state to compare against
    const applicable = await this.applyConflictRulesMap('menu_items', storeId, localById, data as any[]);
    if (applicable.length) {
      await bulkPutRecords('menu_items', applicable.map((r: any) => ({
        id: String(r.id), store_id: storeId, data: r,
        updated_at: r.metadata?.updated_at || r.updated_at || new Date().toISOString(),
      })));
    }
  }

  private async pullProductsToIDB(storeId: string) {
    const { data, error } = await supabase.from('products').select('*').eq('store_id', storeId).limit(2000);
    if (!data || error) return;
    const localById = new Map<string, any>();
    const applicable = await this.applyConflictRulesMap('inventory', storeId, localById, data as any[]);
    if (applicable.length) {
      await bulkPutRecords('inventory', applicable.map((r: any) => ({
        id: String(r.id), store_id: storeId, data: r,
        updated_at: r.metadata?.updated_at || r.updated_at || new Date().toISOString(),
      })));
    }
  }

  // Variant used when local state is already a Map<id, record>.
  private async applyConflictRulesMap(
    table: CoreTable,
    storeId: string,
    localById: Map<string, any>,
    cloudItems: any[],
  ): Promise<any[]> {
    try {
      const { filterApplicableCloudRows } = await import('./conflicts');
      return await filterApplicableCloudRows(table, storeId, localById, cloudItems);
    } catch {
      return cloudItems;
    }
  }
}



export const syncEngine = new SyncEngine();

// Exposed for debugging & the admin panel
if (typeof window !== 'undefined') {
  (window as any).__pos_idb = idb;
  (window as any).__pos_sync = syncEngine;
  (window as any).__pos_queue = {
    stats: queueStats,
    listPoisoned,
    retryPoisoned,
    discardPoisoned,
    drainNow: () => syncEngine.drainQueue(),
    pullNow: () => syncEngine.sync(),
  };
}
