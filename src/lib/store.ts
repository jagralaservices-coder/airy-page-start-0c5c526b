// Offline-first data store using localStorage

export interface MenuItemVariation {
  id: string;
  menuItemId: string;
  name: string; // e.g., "500ml", "1L", "Small", "Large"
  sku?: string;
  price: number;
  isAvailable: boolean;
  stock?: number;
  sortOrder: number;
  unit?: string; // g, ml, ltr, kg, pcs
}

export interface MenuItem {
  id: string;
  name: string;
  nameHindi?: string;
  price: number;
  category: string;
  color?: string;
  image?: string;
  isAvailable: boolean;
  preparationTime?: number;
  stock?: number; // undefined means unlimited stock
  storeStock?: { [storeId: string]: number }; // Store-wise stock
  lastUpdated?: string | Date;
  pendingSync?: boolean;
  stockAlertThreshold?: number; // Optional: Alert when stock falls below this value
  linkedInventoryId?: string; // ID of linked inventory item (legacy single link)
  gramagePerUnit?: number; // Grams of inventory item used per unit sold (legacy)
  ingredients?: MenuItemIngredient[]; // Multiple ingredients for recipe-based linking
  sku?: string; // Stock Keeping Unit code
  barcode?: string; // Barcode value for scanning
  variations?: MenuItemVariation[]; // Sub-variations like sizes (500ml, 1L etc.)
  brandId?: string | null; // Optional brand link (public.brands.id)
  brandName?: string; // Cached brand name for offline / report fallback
  brandType?: 'internal' | 'external'; // Defaults to 'internal' (House Brand) when no brand
}

export interface Category {
  id: string;
  name: string;
  nameHindi?: string;
  icon: string;
  color: string;
  lastUpdated?: string | Date;
  pendingSync?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  email?: string;
  createdAt: string | Date;
  totalOrders?: number;
  totalSpent?: number;
  lastUpdated?: string | Date;
  pendingSync?: boolean;
}

export const normalizeCustomerPhone = (phone?: string | null): string =>
  (phone || '').replace(/\D/g, '').trim();

export const normalizeCustomerName = (name?: string | null): string =>
  (name || '').trim().replace(/\s+/g, ' ').toLowerCase();

const GENERIC_CUSTOMER_NAMES = new Set(['walk-in customer', 'walk in customer', 'valued guest', 'guest', 'customer']);

const isUsableCustomerNameKey = (nameKey: string): boolean =>
  nameKey.length >= 3 && !GENERIC_CUSTOMER_NAMES.has(nameKey);

const customerTime = (customer: Customer): number => {
  const raw = customer.createdAt || customer.lastUpdated;
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const mergeCustomerRecord = (base: Customer, incoming: Customer): Customer => {
  const baseUpdated = base.lastUpdated ? new Date(base.lastUpdated).getTime() : 0;
  const incomingUpdated = incoming.lastUpdated ? new Date(incoming.lastUpdated).getTime() : 0;
  return {
    ...base,
    name: base.name?.trim() ? base.name : incoming.name,
    phone: base.phone?.trim() ? base.phone : incoming.phone,
    email: base.email?.trim() ? base.email : incoming.email,
    address: base.address?.trim() ? base.address : incoming.address,
    totalOrders: Math.max(base.totalOrders || 0, incoming.totalOrders || 0) || undefined,
    totalSpent: Math.max(base.totalSpent || 0, incoming.totalSpent || 0) || undefined,
    lastUpdated: incomingUpdated > baseUpdated ? incoming.lastUpdated : base.lastUpdated,
    pendingSync: base.pendingSync || incoming.pendingSync,
  };
};

export const dedupeCustomers = (items: Customer[]): Customer[] => {
  return dedupeCustomersWithAliases(items).customers;
};

const dedupeCustomersWithAliases = (items: Customer[]): { customers: Customer[]; aliases: Map<string, string> } => {
  const byId = new Map<string, Customer>();
  const phoneIndex = new Map<string, string>();
  const nameIndex = new Map<string, string>();
  const aliases = new Map<string, string>();

  const pickWinner = (a: Customer, b: Customer): Customer => {
    const aTime = customerTime(a);
    const bTime = customerTime(b);
    if (aTime && bTime && aTime !== bTime) return aTime <= bTime ? a : b;
    if (a.pendingSync !== b.pendingSync) return a.pendingSync ? b : a;
    return String(a.id) <= String(b.id) ? a : b;
  };

  const reindex = (customer: Customer) => {
    const id = String(customer.id);
    const phoneKey = normalizeCustomerPhone(customer.phone);
    const nameKey = normalizeCustomerName(customer.name);
    if (phoneKey) phoneIndex.set(phoneKey, id);
    if (isUsableCustomerNameKey(nameKey)) nameIndex.set(nameKey, id);
  };

  for (const item of items) {
    if (!item?.id) continue;
    const incoming: Customer = {
      ...item,
      name: item.name || 'Walk-in Customer',
      phone: item.phone || '',
    };
    const id = String(incoming.id);
    const phoneKey = normalizeCustomerPhone(incoming.phone);
    const nameKey = normalizeCustomerName(incoming.name);
    const existingId = (phoneKey && phoneIndex.get(phoneKey))
      || (isUsableCustomerNameKey(nameKey) && nameIndex.get(nameKey))
      || (byId.has(id) ? id : '');

    if (!existingId) {
      byId.set(id, incoming);
      reindex(incoming);
      continue;
    }

    const existing = byId.get(existingId);
    if (!existing) {
      byId.set(id, incoming);
      reindex(incoming);
      continue;
    }

    const winner = pickWinner(existing, incoming);
    const loser = winner.id === existing.id ? incoming : existing;
    const merged = mergeCustomerRecord(winner, loser);

    const oldExistingPhone = normalizeCustomerPhone(existing.phone);
    const oldIncomingPhone = normalizeCustomerPhone(incoming.phone);
    const oldExistingName = normalizeCustomerName(existing.name);
    const oldIncomingName = normalizeCustomerName(incoming.name);
    if (oldExistingPhone) phoneIndex.delete(oldExistingPhone);
    if (oldIncomingPhone) phoneIndex.delete(oldIncomingPhone);
    if (isUsableCustomerNameKey(oldExistingName)) nameIndex.delete(oldExistingName);
    if (isUsableCustomerNameKey(oldIncomingName)) nameIndex.delete(oldIncomingName);

    byId.delete(String(existing.id));
    byId.set(String(merged.id), merged);
    aliases.set(String(loser.id), String(merged.id));
    reindex(merged);
  }

  return { customers: Array.from(byId.values()), aliases };
};

// Phase 2.6 schema-aligned shape. Normalized fields are the source of truth;
// legacy denormalized fields are kept optional for offline cache backward
// compatibility and UI display (populated via local pos_customers / orders join).
export interface CreditEntry {
  id: string;
  store_id: string;
  // Normalized (server-authoritative) fields:
  customer_id?: string;          // FK → pos_customers.id (required for new entries)
  order_id?: string | null;      // FK → orders.id
  due_amount: number;
  paid_amount: number;
  status?: 'open' | 'partial' | 'paid' | 'void';
  notes: string | null;
  metadata?: Record<string, any>;
  created_at: string | Date;
  updated_at?: string | Date;
  lastUpdated?: string | Date;
  pendingSync?: boolean;
  // Legacy display fields (derived at read time from pos_customers + orders):
  customer_name?: string;
  customer_phone?: string | null;
  bill_number?: string | null;
  total_amount?: number;        // = paid_amount + due_amount
  payment_status?: 'unpaid' | 'partial' | 'paid' | 'void';
}

export interface CreditPayment {
  id: string;
  store_id: string;
  credit_ledger_id?: string;    // Phase 2.6 — FK column name in DB (required for new entries)
  // Legacy alias kept readable in code:
  credit_id?: string;
  amount: number;
  payment_method: string;
  reference?: string | null;    // DB column (replaces received_by)
  notes?: string | null;
  metadata?: Record<string, any>;
  // Legacy fields kept for backward compatibility:
  received_by?: string | null;
  created_at: string | Date;
  updated_at?: string | Date;
  lastUpdated?: string | Date;
  pendingSync?: boolean;
}

export interface CartItem extends MenuItem {
  quantity: number;
  notes?: string;
  cartItemId?: string;
}

export interface Order {
  id: string;
  billNumber?: string; // Bill number for completed sales
  kotNumber?: string; // KOT number for kitchen orders
  items: CartItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  orderType: 'dine-in' | 'takeaway' | 'delivery' | 'online' | 'qr';
  tableNumber?: number;
  customerName?: string;
  customerPhone?: string;
  customerId?: string; // FK → pos_customers.id (set for credit/due bills)
  customerEmail?: string;
  customerAddress?: string;
  paymentMethod?: 'cash' | 'card' | 'upi' | 'split' | 'due' | 'part' | 'wallet' | 'credit' | 'access';
  paymentBreakdown?: Record<string, number>; // For 'part' payments: { cash: amount, card: amount, upi: amount, credit: amount }
  createdAt: Date;
  kotPrinted: boolean;
  isDirectBill?: boolean; // True if bill printed without KOT (won't show in orders)
  billPrinted?: boolean; // True if bill has been printed (adds to sales)
  deliveryBoy?: string;
  onlineSource?: 'swiggy' | 'zomato' | 'direct';
  storeId?: string;
  cancelReason?: string; // Reason for cancellation
  cancelledAt?: string; // ISO timestamp when cancelled
  pendingSync?: boolean;
  lastUpdated?: string;
}

export interface HeldBill {
  id: string;
  items: CartItem[];
  tableNumber?: number;
  customerName?: string;
  heldAt: Date;
}

export interface Staff {
  id: string;
  name: string;
  role: 'admin' | 'cashier' | 'waiter' | 'kitchen' | 'delivery';
  phone: string;
  pin: string;
  isActive: boolean;
  attendance: AttendanceRecord[];
  facePhotoUrl?: string; // URL to face photo in storage
}

export interface AttendanceRecord {
  date: string;
  checkIn?: Date;
  checkOut?: Date;
  status: 'present' | 'absent' | 'half-day';
}

export interface TableReservation {
  name: string;
  phone?: string;
  time?: string; // ISO datetime
  partySize?: number;
  notes?: string;
  createdAt?: string;
}

export interface Table {
  id: string;
  number: number;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved' | 'billed';
  currentOrderId?: string;
  name?: string; // Custom table name/alias (e.g., "Window Seat", "VIP 1")
  section?: string; // Section this table belongs to
  reservation?: TableReservation;
}


export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minStock: number;
  costPerUnit: number;
  costUnit?: string; // Unit for cost calculation (kg, g, ltr, ml, pcs)
  lastUpdated: Date;
  components?: InventoryComponent[]; // Sub-components for this inventory item
  productionYield?: number; // How much is produced from components (in base unit g/ml/pcs)
  productionYieldUnit?: string; // Unit for production yield
  isManufactured?: boolean; // Flag to indicate this is produced internally, not purchased
}

export interface InventoryComponent {
  id: string;
  childInventoryId: string;
  quantityRequired: number;
  unit: string;
}

export interface MenuItemIngredient {
  id: string;
  inventoryItemId: string;
  quantityRequired: number;
  unit: string;
}

export interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string;
  date: Date;
  paidBy: string;
  storeId?: string;
}

export interface Store {
  id: string;
  name: string;
  storeCode: string;
  password: string;
  address?: string;
  phone?: string;
  isActive: boolean;
  createdAt: Date;
  customer_id?: string;
  businessType?: 'restaurant' | 'retail';
  country?: string;
  currencyCode?: string;
  taxType?: string;
  taxPercentage?: number;
  loginEmail?: string;
}

// Generate 8 digit store code
export const generateStoreCode = (): string => {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
};

// Default data - Generic categories for any business type
export const defaultCategories: Category[] = [];

export const defaultMenuItems: MenuItem[] = [];

export const defaultTables: Table[] = [
  { id: 't1', number: 1, capacity: 4, status: 'available' },
  { id: 't2', number: 2, capacity: 2, status: 'available' },
  { id: 't3', number: 3, capacity: 6, status: 'available' }
];

// Storage helper functions
const STORAGE_KEYS = {
  MENU_ITEMS: 'pos_menu_items',
  CATEGORIES: 'pos_categories',
  ORDERS: 'pos_orders',
  HELD_BILLS: 'pos_held_bills',
  STAFF: 'pos_staff',
  TABLES: 'pos_tables',
  INVENTORY: 'pos_inventory',
  EXPENSES: 'pos_expenses',
  SETTINGS: 'pos_settings',
  STORES: 'pos_stores',
  ACTIVE_STORE: 'pos_active_store',
  CUSTOMERS: 'pos_customers',
  CREDIT_LEDGER: 'pos_credit_ledger',
  CREDIT_PAYMENTS: 'pos_credit_payments',
};

const readActiveStoreId = (): string | null => {
  const raw = sessionStorage.getItem(STORAGE_KEYS.ACTIVE_STORE) || localStorage.getItem(STORAGE_KEYS.ACTIVE_STORE);
  if (!raw || raw === 'null') return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : parsed?.id || null;
  } catch {
    return raw;
  }
};

// Get the current store-scoped storage key
// This ensures data is isolated per store and doesn't mix across devices/logins
const getScopedKey = (baseKey: string): string => {
  const ownerSelectedStoreId = sessionStorage.getItem('owner_selected_store_id') || localStorage.getItem('owner_selected_store_id');
  if (ownerSelectedStoreId) return `${baseKey}_${ownerSelectedStoreId}`;

  const activeStoreId = readActiveStoreId();
  // Also check store login data
  if (!activeStoreId) {
    try {
      const storeData = sessionStorage.getItem('pos_active_store_data') || localStorage.getItem('pos_active_store_data');
      if (storeData) {
        const parsed = JSON.parse(storeData);
        if (parsed?.id) return `${baseKey}_${parsed.id}`;
      }
    } catch {}
  }
  if (activeStoreId) return `${baseKey}_${activeStoreId}`;
  return baseKey; // fallback to unscoped
};

let backupCallback: (() => void) | null = null;

export const registerBackupCallback = (cb: () => void) => {
  backupCallback = cb;
};

export const storage = {
  get: <T>(key: string, defaultValue: T): T => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set: <T>(key: string, value: T): void => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      if (backupCallback && key !== 'pos_local_backups' && !key.startsWith('pos_local_backups_')) {
        backupCallback();
      }
    } catch (error) {
      console.error('Storage error:', error);
    }
  },

  remove: (key: string): void => {
    try {
      localStorage.removeItem(key);
      if (backupCallback && key !== 'pos_local_backups' && !key.startsWith('pos_local_backups_')) {
        backupCallback();
      }
    } catch (error) {
      console.error('Storage error:', error);
    }
  },
};

// Safe Merge Utility to prevent data resets/overwrites and handle multi-device sync
export const safeMerge = <T extends { id?: string | number; category_id?: string | number; updated_at?: string; lastUpdated?: Date | string; pendingSync?: boolean }>(
  localItems: T[],
  cloudItems: T[],
  keyField: keyof T = 'id'
): T[] => {
  if (!cloudItems || !Array.isArray(cloudItems)) {
    return localItems;
  }
  // Ignore empty cloud payloads to protect local data from resets
  if (cloudItems.length === 0) {
    return localItems;
  }

  const mergedMap = new Map<string, T>();

  const getKey = (item: T): string => String(item[keyField] || item.id || item.category_id || '');

  // 1. Add all existing local items first
  localItems.forEach((item) => {
    const key = getKey(item);
    if (key) {
      mergedMap.set(key, item);
    }
  });

  // 2. Merge cloud items based on timestamp
  cloudItems.forEach((cloudItem) => {
    const key = getKey(cloudItem);
    if (!key) return;

    if (mergedMap.has(key)) {
      const localItem = mergedMap.get(key)!;

      // CRITICAL: never overwrite an item that has unsynced local edits.
      // The caller is responsible for pushing pendingSync items to cloud BEFORE
      // calling safeMerge; until that push succeeds and clears the flag we must
      // not allow a stale cloud row to wipe the local change (data-loss guard
      // for items #4 / #5: cloud sync overwrite + pendingSync protection).
      if (localItem && (localItem as any).pendingSync === true) {
        return;
      }

      const getTimestamp = (item: T) => {
        const val = item.updated_at || item.lastUpdated;
        if (!val) return 0;
        return new Date(val).getTime();
      };

      const localTime = getTimestamp(localItem);
      const cloudTime = getTimestamp(cloudItem);

      // Cloud wins only when strictly newer; tie -> keep local to avoid
      // overwriting an in-flight local mutation that hasn't bumped updated_at yet.
      if (cloudTime > localTime) {
        mergedMap.set(key, cloudItem);
      }
    } else {
      // Missing in local, add it
      mergedMap.set(key, cloudItem);
    }
  });

  return Array.from(mergedMap.values());
};

// Initialize default data - only if not already present
// IMPORTANT: Does NOT overwrite existing data
export const initializeData = () => {
  // Scoped default data - initialize only if absent for current store
  const scopedMenuItems = getScopedKey(STORAGE_KEYS.MENU_ITEMS);
  if (!localStorage.getItem(scopedMenuItems)) {
    storage.set(scopedMenuItems, defaultMenuItems);
  }
  const scopedCategories = getScopedKey(STORAGE_KEYS.CATEGORIES);
  if (!localStorage.getItem(scopedCategories)) {
    storage.set(scopedCategories, defaultCategories);
  }
  const scopedTables = getScopedKey(STORAGE_KEYS.TABLES);
  if (!localStorage.getItem(scopedTables)) {
    storage.set(scopedTables, defaultTables);
  }
  const scopedOrders = getScopedKey(STORAGE_KEYS.ORDERS);
  if (!localStorage.getItem(scopedOrders)) {
    storage.set(scopedOrders, []);
  }
  const scopedHeldBills = getScopedKey(STORAGE_KEYS.HELD_BILLS);
  if (!localStorage.getItem(scopedHeldBills)) {
    storage.set(scopedHeldBills, []);
  }
  const scopedStaff = getScopedKey(STORAGE_KEYS.STAFF);
  if (!localStorage.getItem(scopedStaff)) {
    storage.set(scopedStaff, []);
  }
  const scopedInventory = getScopedKey(STORAGE_KEYS.INVENTORY);
  if (!localStorage.getItem(scopedInventory)) {
    storage.set(scopedInventory, []);
  }
  const scopedExpenses = getScopedKey(STORAGE_KEYS.EXPENSES);
  if (!localStorage.getItem(scopedExpenses)) {
    storage.set(scopedExpenses, []);
  }
  const scopedCustomers = getScopedKey(STORAGE_KEYS.CUSTOMERS);
  if (!localStorage.getItem(scopedCustomers)) {
    storage.set(scopedCustomers, []);
  }
  const scopedCreditLedger = getScopedKey(STORAGE_KEYS.CREDIT_LEDGER);
  if (!localStorage.getItem(scopedCreditLedger)) {
    storage.set(scopedCreditLedger, []);
  }
  const scopedCreditPayments = getScopedKey(STORAGE_KEYS.CREDIT_PAYMENTS);
  if (!localStorage.getItem(scopedCreditPayments)) {
    storage.set(scopedCreditPayments, []);
  }
};

// Helper to apply pendingSync to modified items automatically
const applyPendingSync = <T extends { id?: string | number, lastUpdated?: string | Date, pendingSync?: boolean, updated_at?: string | Date, created_at?: string | Date }>(newItems: T[], oldItems: T[]): T[] => {
  const oldMap = new Map(oldItems.map(i => [String(i.id), i]));
  return newItems.map(newItem => {
    const oldItem = oldMap.get(String(newItem.id));
    if (!oldItem) {
      return { ...newItem, pendingSync: true, lastUpdated: new Date().toISOString() };
    }
    const oldStr = JSON.stringify({ ...oldItem, pendingSync: undefined, lastUpdated: undefined, updated_at: undefined });
    const newStr = JSON.stringify({ ...newItem, pendingSync: undefined, lastUpdated: undefined, updated_at: undefined });
    if (oldStr !== newStr) {
      return { ...newItem, pendingSync: true, lastUpdated: new Date().toISOString() };
    }
    // Allow SyncEngine to clear the flag
    if (newItem.pendingSync === false) {
      return { ...newItem, pendingSync: false, lastUpdated: oldItem.lastUpdated };
    }
    return { ...newItem, pendingSync: oldItem.pendingSync, lastUpdated: oldItem.lastUpdated };
  });
};

// Data access functions - now fully scoped per store to enforce multi-device isolation
// --- Offline-first mirror to IndexedDB (Phase 1) ---
// Synchronous getters keep reading localStorage (the hot cache).
// Setters fire-and-forget mirror writes to IndexedDB and enqueue per-record
// sync jobs in the persistent queue. Failures never block the UI.
const mirrorToIDB = (
  table: 'orders' | 'credit_ledger' | 'customers' | 'menu_items' | 'inventory',
  storeId: string,
  oldItems: any[],
  newItems: any[],
): void => {
  // R4: refuse to mirror when there is no resolvable active store. This
  // previously silently dropped sync queue entries, leaving data trapped in
  // the local browser and producing empty Reports on other devices.
  if (!storeId) {
    emitStoreScopeError(`mirrorToIDB:${table}`, {
      old_count: oldItems.length,
      new_count: newItems.length,
    });
    return;
  }
  Promise.resolve().then(async () => {
    try {
      const idbMod = await import('./idb');
      const queueMod = await import('./syncQueue');
      const envMod = await import('./envelope');

      // Diagnostic trace — every cloud-bound write logs the full identity
      // tuple so a failed sync can be root-caused without instrumentation.
      console.info('[StoreScope] mirrorToIDB', {
        table,
        store_id: storeId,
        organization_id: envMod.getOrganizationId(),
        updated_by: envMod.getUpdatedBySync(),
        new_count: newItems.length,
      });


      const oldMap = new Map(oldItems.map((i: any) => [String(i?.id), i]));
      const newMap = new Map(newItems.map((i: any) => [String(i?.id), i]));

      // Phase 2 — pull existing envelopes so we can bump version_number
      // only on actual changes and preserve it on no-op writes.
      const tbl = (idbMod.idb as any)[table];
      const ids = newItems.filter((i: any) => i && i.id != null).map((i: any) => String(i.id));
      const prior = (await tbl.bulkGet(ids)) as (any | undefined)[];
      const priorById = new Map<string, any>();
      ids.forEach((id, i) => priorById.set(id, prior[i]));

      const organization_id = envMod.getOrganizationId();
      const session_id = envMod.getSessionId();
      const updated_by = envMod.getUpdatedBySync();

      const rows: any[] = [];
      const upserts: any[] = [];
      newMap.forEach((nv, id) => {
        const ov = oldMap.get(id);
        const priorEnv = priorById.get(id);
        const snapOld = envMod.stableSnapshot(ov);
        const snapNew = envMod.stableSnapshot(nv);
        const changed = !ov || snapOld !== snapNew;

        const prevVersion = priorEnv?.version_number || 0;
        const version_number = changed ? prevVersion + 1 : (prevVersion || 1);

        const storeIdFinal = storeId || String(nv.store_id || nv.storeId || '');
        rows.push({
          id: String(id),
          store_id: storeIdFinal,
          data: nv,
          updated_at: nv.lastUpdated || nv.updated_at || new Date().toISOString(),
          organization_id,
          session_id,
          version_number,
          updated_by,
        });

        if (changed) {
          upserts.push({
            table, op: 'upsert' as const,
            record_id: String(id),
            store_id: storeIdFinal,
            payload: nv,
            organization_id,
            session_id,
            version_number,
            updated_by,
          });
        }
      });

      if (rows.length) {
        // Write envelopes directly (preserves new envelope fields)
        await tbl.bulkPut(rows.map((r: any) => ({ ...r, table })));
      }

      const deletes: any[] = [];
      oldMap.forEach((ov, id) => {
        if (!newMap.has(id)) {
          deletes.push({
            table, op: 'delete' as const,
            record_id: String(id),
            store_id: storeId || String(ov.store_id || ov.storeId || ''),
            payload: ov,
            organization_id,
            session_id,
            updated_by,
          });
        }
      });

      if (upserts.length || deletes.length) {
        await queueMod.enqueueMany([...upserts, ...deletes]);
      }
    } catch (e) {
      console.warn('[IDB mirror] failed:', e);
    }
  });
};


// In-memory cache primed by POSContext when the active store changes. This is
// the most reliable source — localStorage keys can lag behind React state on
// fast multi-tab/login flows, which is what produced empty store_id at write
// time and silently dropped sync queue entries.
let __activeStoreCache: string = '';
export const setActiveStoreScopeCache = (storeId: string | null | undefined) => {
  __activeStoreCache = storeId ? String(storeId) : '';
};
export const getActiveStoreScopeCache = (): string => __activeStoreCache;

export const currentStoreScope = (): string => {
  if (__activeStoreCache) return __activeStoreCache;
  const owner = sessionStorage.getItem('owner_selected_store_id') || localStorage.getItem('owner_selected_store_id');
  if (owner) return owner;
  const active = readActiveStoreId();
  if (active) return active;
  try {
    const sd = sessionStorage.getItem('pos_active_store_data') || localStorage.getItem('pos_active_store_data');
    if (sd) {
      const id = JSON.parse(sd)?.id;
      if (id) return String(id);
    }
  } catch {}
  return '';
};

const emitStoreScopeError = (operation: string, extra?: Record<string, unknown>) => {
  const diag = {
    operation,
    active_store_id: __activeStoreCache || null,
    owner_selected_store_id: localStorage.getItem('owner_selected_store_id'),
    pos_active_store: localStorage.getItem('pos_active_store'),
    pos_active_store_data_id: (() => {
      try { return JSON.parse(localStorage.getItem('pos_active_store_data') || 'null')?.id || null; } catch { return null; }
    })(),
    ...extra,
  };
  console.error('[StoreScope] BLOCKED write — no active store_id', diag);
  try {
    // Fire toast lazily to avoid pulling sonner into pre-init paths.
    import('sonner').then(({ toast }) => {
      toast.error('No active store selected. Please pick a store before saving.', {
        description: `Operation: ${operation}`,
      });
    }).catch(() => {});
  } catch {}
};

export const getMenuItems = (): MenuItem[] => {
  const items = storage.get(getScopedKey(STORAGE_KEYS.MENU_ITEMS), defaultMenuItems);
  return items.filter(item => !['d1', 'd2', 'dr1', 'dr2', 'pz1', 'bg1', '1', '2', '3'].includes(item.id));
};
export const setMenuItems = (items: MenuItem[]) => {
  const old = getMenuItems();
  const newItems = applyPendingSync(items, old);
  storage.set(getScopedKey(STORAGE_KEYS.MENU_ITEMS), newItems);
  mirrorToIDB('menu_items', currentStoreScope(), old, newItems);
};

export const getCategories = (): Category[] => {
  const cats = storage.get(getScopedKey(STORAGE_KEYS.CATEGORIES), defaultCategories);
  return cats.filter(cat => !['desserts', 'drinks', 'pizza', 'burgers'].includes(cat.id));
};
export const setCategories = (categories: Category[]) => {
  const newCats = applyPendingSync(categories, getCategories());
  storage.set(getScopedKey(STORAGE_KEYS.CATEGORIES), newCats);
};

// Orders, held bills, inventory, expenses are store-scoped
export const getOrders = (): Order[] => storage.get(getScopedKey(STORAGE_KEYS.ORDERS), []);
export const setOrders = (orders: Order[]) => {
  const old = getOrders();
  const newOrders = applyPendingSync(orders, old);
  storage.set(getScopedKey(STORAGE_KEYS.ORDERS), newOrders);
  mirrorToIDB('orders', currentStoreScope(), old, newOrders);
};
export const addOrder = (order: Order) => {
  const orders = getOrders();
  orders.push(order);
  setOrders(orders);
};

export const getHeldBills = (): HeldBill[] => storage.get(getScopedKey(STORAGE_KEYS.HELD_BILLS), []);
export const setHeldBills = (bills: HeldBill[]) => storage.set(getScopedKey(STORAGE_KEYS.HELD_BILLS), bills);

export const getTables = (): Table[] => storage.get(getScopedKey(STORAGE_KEYS.TABLES), defaultTables);
export const setTables = (tables: Table[]) => storage.set(getScopedKey(STORAGE_KEYS.TABLES), tables);

export const getStaff = (): Staff[] => storage.get(getScopedKey(STORAGE_KEYS.STAFF), []);
export const setStaff = (staff: Staff[]) => storage.set(getScopedKey(STORAGE_KEYS.STAFF), staff);

export const getInventory = (): InventoryItem[] => storage.get(getScopedKey(STORAGE_KEYS.INVENTORY), []);
export const setInventory = (items: InventoryItem[]) => {
  const old = getInventory();
  const newItems = applyPendingSync(items, old);
  storage.set(getScopedKey(STORAGE_KEYS.INVENTORY), newItems);
  mirrorToIDB('inventory', currentStoreScope(), old, newItems);
};

export const getExpenses = (): Expense[] => storage.get(getScopedKey(STORAGE_KEYS.EXPENSES), []);
export const setExpenses = (expenses: Expense[]) => {
  const newItems = applyPendingSync(expenses, getExpenses());
  storage.set(getScopedKey(STORAGE_KEYS.EXPENSES), newItems);
};

export const getCustomers = (): Customer[] => storage.get(getScopedKey(STORAGE_KEYS.CUSTOMERS), []);
export const setCustomers = (items: Customer[]) => {
  const old = getCustomers();
  const { customers: deduped, aliases } = dedupeCustomersWithAliases(items);
  if (aliases.size > 0) {
    const now = new Date().toISOString();
    const orders = getOrders();
    const rewrittenOrders = orders.map((order) => {
      const mappedId = order.customerId ? aliases.get(String(order.customerId)) : undefined;
      return mappedId ? { ...order, customerId: mappedId, pendingSync: true, lastUpdated: now } : order;
    });
    if (rewrittenOrders.some((order, index) => order !== orders[index])) {
      storage.set(getScopedKey(STORAGE_KEYS.ORDERS), rewrittenOrders);
      mirrorToIDB('orders', currentStoreScope(), orders, rewrittenOrders);
    }

    const ledger = getCreditLedger();
    const rewrittenLedger = ledger.map((entry) => {
      const mappedId = entry.customer_id ? aliases.get(String(entry.customer_id)) : undefined;
      return mappedId ? { ...entry, customer_id: mappedId, pendingSync: true, lastUpdated: now, updated_at: now } : entry;
    });
    if (rewrittenLedger.some((entry, index) => entry !== ledger[index])) {
      storage.set(getScopedKey(STORAGE_KEYS.CREDIT_LEDGER), rewrittenLedger);
      mirrorToIDB('credit_ledger', currentStoreScope(), ledger, rewrittenLedger);
    }
  }
  const newItems = applyPendingSync(deduped, old);
  storage.set(getScopedKey(STORAGE_KEYS.CUSTOMERS), newItems);
  mirrorToIDB('customers', currentStoreScope(), old, newItems);
};

export const getCreditLedger = (): CreditEntry[] => storage.get(getScopedKey(STORAGE_KEYS.CREDIT_LEDGER), []);
export const setCreditLedger = (items: CreditEntry[]) => {
  const old = getCreditLedger();
  const newItems = applyPendingSync(items, old);
  storage.set(getScopedKey(STORAGE_KEYS.CREDIT_LEDGER), newItems);
  mirrorToIDB('credit_ledger', currentStoreScope(), old, newItems);
};

export const getCreditPayments = (): CreditPayment[] => storage.get(getScopedKey(STORAGE_KEYS.CREDIT_PAYMENTS), []);
export const setCreditPayments = (items: CreditPayment[]) => {
  const newItems = applyPendingSync(items, getCreditPayments());
  storage.set(getScopedKey(STORAGE_KEYS.CREDIT_PAYMENTS), newItems);
};


export const getStores = (): Store[] => storage.get(STORAGE_KEYS.STORES, []);
export const setStores = (stores: Store[]) => storage.set(STORAGE_KEYS.STORES, stores);

export const getActiveStore = (): string | null => readActiveStoreId();
export const setActiveStore = (storeId: string | null) => {
  sessionStorage.setItem(STORAGE_KEYS.ACTIVE_STORE, JSON.stringify(storeId));
  storage.set(STORAGE_KEYS.ACTIVE_STORE, storeId);
};

// Generate unique ID
export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Generate bill number (sequential 6-digit number)
export const generateBillNumber = (): string => {
  const key = 'pos_bill_number_counter';
  let counter = parseInt(localStorage.getItem(key) || '99999') + 1; // Start from 100000
  if (counter > 999999) {
    counter = 100000; // Reset if exceeds 6 digits
  }
  localStorage.setItem(key, counter.toString());
  return counter.toString();
};

// Generate KOT number (sequential for the day)
export const generateKOTNumber = (): string => {
  const today = new Date().toDateString();
  const key = 'pos_kot_counter_' + today;
  const counter = parseInt(localStorage.getItem(key) || '0') + 1;
  localStorage.setItem(key, counter.toString());
  return `K${counter.toString().padStart(4, '0')}`;
};

// Format currency - now uses locale settings
export const formatCurrency = (amount: number): string => {
  // Get country from localStorage for non-React contexts
  const storedCountry = localStorage.getItem('pos_country') || 'IN';
  
  const currencyConfig: Record<string, { locale: string; currency: string; minFrac: number; maxFrac: number }> = {
    'IN': { locale: 'en-IN', currency: 'INR', minFrac: 0, maxFrac: 0 },
    'OM': { locale: 'ar-OM', currency: 'OMR', minFrac: 2, maxFrac: 3 },
    'SA': { locale: 'ar-SA', currency: 'SAR', minFrac: 2, maxFrac: 2 },
    'DE': { locale: 'de-DE', currency: 'EUR', minFrac: 2, maxFrac: 2 },
    'GB': { locale: 'en-GB', currency: 'GBP', minFrac: 2, maxFrac: 2 },
  };
  
  const config = currencyConfig[storedCountry] || currencyConfig['IN'];
  
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
    minimumFractionDigits: config.minFrac,
    maximumFractionDigits: config.maxFrac,
  }).format(amount);
};
