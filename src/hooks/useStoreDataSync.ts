// Hook for syncing inventory, expenses, held bills, and settings to cloud (Cloud-only)
import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  InventoryItem, Expense, HeldBill, Table,
  setInventory,
  setExpenses,
  setHeldBills,
  setTables,
  MenuItem, Category, Customer, CreditEntry, CreditPayment,
  setMenuItems,
  setCategories,
  setCustomers,
  setCreditLedger,
  setCreditPayments,
} from '@/lib/store';

const getStoreId = (): string | null => {
  const ownerSelected = localStorage.getItem('owner_selected_store_id');
  if (ownerSelected) return ownerSelected;

  try {
    const storeData = localStorage.getItem('pos_active_store_data');
    if (storeData) {
      const parsed = JSON.parse(storeData);
      if (parsed?.id) return parsed.id;
      if (parsed?.storeId) return parsed.storeId;
    }
  } catch {}
  const activeStore = localStorage.getItem('pos_active_store');
  if (activeStore) {
    try { return JSON.parse(activeStore); } catch {}
  }
  return null;
};

const getStoreCode = (): string | null => {
  const direct = localStorage.getItem('pos_store_code');
  if (direct) return direct;
  
  try {
    const storeData = localStorage.getItem('pos_active_store_data');
    if (storeData) {
      const parsed = JSON.parse(storeData);
      if (parsed?.storeCode) return parsed.storeCode;
      if (parsed?.store_code) return parsed.store_code;
    }
  } catch {}
  
  try {
    const storeLogin = localStorage.getItem('pos_store_login_data');
    if (storeLogin) {
      const parsed = JSON.parse(storeLogin);
      if (parsed?.store_code) return parsed.store_code;
    }
  } catch {}
  
  try {
    const session = localStorage.getItem('pos_store_session');
    if (session) {
      const parsed = JSON.parse(session);
      if (parsed?.store_code) return parsed.store_code;
      if (parsed?.storeCode) return parsed.storeCode;
    }
  } catch {}
  
  return null;
};

const callSyncFunction = async (body: any) => {
  if (localStorage.getItem('pos_login_as_demo') === 'true') return null;
  const store_code = getStoreCode();
  const authBody = store_code ? { ...body, store_code } : body;
  const { data, error } = await supabase.functions.invoke('sync-store-data', { body: authBody });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
};

// Database schema conversions
const dbToLocalInventory = (db: any): InventoryItem => ({
  id: db.id,
  name: db.name,
  quantity: Number(db.quantity),
  unit: db.unit,
  minStock: Number(db.min_stock),
  costPerUnit: Number(db.cost_per_unit),
  costUnit: db.cost_unit || 'pcs',
  lastUpdated: new Date(db.updated_at),
  productionYield: db.production_yield ? Number(db.production_yield) : undefined,
  productionYieldUnit: db.production_yield_unit || undefined,
});

const dbToLocalExpense = (db: any): Expense => ({
  id: db.id,
  category: db.category,
  amount: Number(db.amount),
  description: db.description || '',
  date: new Date(db.date),
  paidBy: db.paid_by || '',
  storeId: db.store_id,
});

const dbToLocalHeldBill = (db: any): HeldBill => ({
  id: db.id,
  items: db.items || [],
  tableNumber: db.table_number || undefined,
  customerName: db.customer_name || undefined,
  heldAt: new Date(db.held_at),
});

const dbToLocalMenuItem = (db: any, ingredients: any[] = [], variations: any[] = []): MenuItem => ({
  id: db.id,
  name: db.name,
  nameHindi: db.name_hindi || undefined,
  price: Number(db.price),
  category: db.category,
  image: db.image_url || undefined,
  isAvailable: db.is_available,
  preparationTime: db.preparation_time || undefined,
  stock: db.stock || undefined,
  linkedInventoryId: db.linked_inventory_id || undefined,
  gramagePerUnit: db.gramage_per_unit ? Number(db.gramage_per_unit) : undefined,
  sku: db.sku || undefined,
  barcode: db.barcode || undefined,
  ingredients: ingredients.filter((ing: any) => ing.menu_item_id === db.id).map((ing: any) => ({
    id: ing.id,
    inventoryItemId: ing.inventory_item_id,
    quantityRequired: Number(ing.quantity_required),
    unit: ing.unit,
  })),
  variations: variations.filter((v: any) => v.menu_item_id === db.id).map((v: any) => ({
    id: v.id,
    menuItemId: v.menu_item_id,
    name: v.name,
    sku: v.sku || undefined,
    price: Number(v.price),
    isAvailable: v.is_available,
    stock: v.stock || undefined,
    sortOrder: v.sort_order,
    unit: v.unit || undefined,
  })),
  lastUpdated: db.updated_at,
});

const dbToLocalCategory = (db: any): Category => ({
  id: db.category_id || db.id,
  name: db.name,
  nameHindi: db.name_hindi || undefined,
  icon: db.icon || '📦',
  color: db.color || 'cat-food',
  lastUpdated: db.updated_at,
});

const dbToLocalCustomer = (db: any): Customer => ({
  id: db.id,
  name: db.name,
  phone: db.phone || '',
  email: db.email || '',
  address: db.address || '',
  createdAt: db.created_at,
  lastUpdated: db.updated_at || db.created_at,
});

const dbToLocalCreditEntry = (db: any): CreditEntry => {
  const status = (db.status || 'open') as 'open' | 'partial' | 'paid' | 'void';
  const paid = Number(db.paid_amount || 0);
  const due = Number(db.due_amount || 0);
  const paymentStatus: 'unpaid' | 'partial' | 'paid' | 'void' =
    status === 'open' ? 'unpaid' : status;
  return {
    id: db.id,
    store_id: db.store_id,
    customer_id: db.customer_id,
    order_id: db.order_id || null,
    due_amount: due,
    paid_amount: paid,
    status,
    notes: db.notes,
    metadata: db.metadata || {},
    created_at: db.created_at,
    updated_at: db.updated_at,
    lastUpdated: db.updated_at || db.created_at,
    customer_name: db.customer_name || db.pos_customers?.name || '',
    customer_phone: db.customer_phone || db.pos_customers?.phone || null,
    bill_number: db.bill_number || db.orders?.bill_number || null,
    total_amount: paid + due,
    payment_status: paymentStatus,
  };
};

const dbToLocalCreditPayment = (db: any): CreditPayment => ({
  id: db.id,
  store_id: db.store_id,
  credit_ledger_id: db.credit_ledger_id || db.credit_id,
  credit_id: db.credit_ledger_id || db.credit_id,
  amount: Number(db.amount),
  payment_method: db.payment_method,
  reference: db.reference || null,
  received_by: db.reference || db.received_by || null,
  notes: db.notes || null,
  metadata: db.metadata || {},
  created_at: db.created_at,
  updated_at: db.updated_at,
  lastUpdated: db.updated_at || db.created_at,
});

export const useStoreDataSync = () => {
  // Cloud-only simplified sync methods (direct Supabase operations, no local-first queueing)
  
  const syncInventory = useCallback(async (): Promise<InventoryItem[]> => {
    const storeId = getStoreId();
    if (!storeId) return [];
    const data = await callSyncFunction({ action: 'fetch', store_id: storeId, data_type: 'inventory' });
    if (data?.items) {
      const items = data.items.map(dbToLocalInventory);
      setInventory(items);
      return items;
    }
    return [];
  }, []);

  const syncExpenses = useCallback(async (): Promise<Expense[]> => {
    const storeId = getStoreId();
    if (!storeId) return [];
    const data = await callSyncFunction({ action: 'fetch', store_id: storeId, data_type: 'expenses' });
    if (data?.items) {
      const items = data.items.map(dbToLocalExpense);
      setExpenses(items);
      return items;
    }
    return [];
  }, []);

  const syncHeldBills = useCallback(async (): Promise<HeldBill[]> => {
    const storeId = getStoreId();
    if (!storeId) return [];
    const data = await callSyncFunction({ action: 'fetch', store_id: storeId, data_type: 'held_bills' });
    if (data?.items) {
      const items = data.items.map(dbToLocalHeldBill);
      setHeldBills(items);
      return items;
    }
    return [];
  }, []);

  const syncTables = useCallback(async (): Promise<Table[]> => {
    const storeId = getStoreId();
    if (!storeId) return [];
    const data = await callSyncFunction({ action: 'fetch', store_id: storeId, data_type: 'tables' });
    if (data?.items) {
      setTables(data.items);
      return data.items;
    }
    return [];
  }, []);

  const syncSettings = useCallback(async () => {
    const storeId = getStoreId();
    if (!storeId) return null;
    const data = await callSyncFunction({ action: 'fetch', store_id: storeId, data_type: 'settings' });
    return data?.settings || null;
  }, []);

  const syncMenuItems = useCallback(async (): Promise<MenuItem[]> => {
    const storeId = getStoreId();
    if (!storeId) return [];
    const data = await callSyncFunction({ action: 'fetch', store_id: storeId, data_type: 'menu_items' });
    if (data?.items) {
      const items = data.items.map((i: any) => dbToLocalMenuItem(i, data.ingredients, data.variations));
      setMenuItems(items);
      return items;
    }
    return [];
  }, []);

  const syncCategories = useCallback(async (): Promise<Category[]> => {
    const storeId = getStoreId();
    if (!storeId) return [];
    const data = await callSyncFunction({ action: 'fetch', store_id: storeId, data_type: 'categories' });
    if (data?.items) {
      const items = data.items.map(dbToLocalCategory);
      setCategories(items);
      return items;
    }
    return [];
  }, []);

  const syncCustomers = useCallback(async (): Promise<Customer[]> => {
    const storeId = getStoreId();
    if (!storeId) return [];
    const data = await callSyncFunction({ action: 'fetch', store_id: storeId, data_type: 'customers' });
    if (data?.items) {
      const items = data.items.map(dbToLocalCustomer);
      setCustomers(items);
      return items;
    }
    return [];
  }, []);

  const syncCreditLedger = useCallback(async (): Promise<CreditEntry[]> => {
    const storeId = getStoreId();
    if (!storeId) return [];
    const data = await callSyncFunction({ action: 'fetch', store_id: storeId, data_type: 'credit_ledger' });
    if (data?.items) {
      const items = data.items.map(dbToLocalCreditEntry);
      setCreditLedger(items);
      return items;
    }
    return [];
  }, []);

  const syncCreditPayments = useCallback(async (): Promise<CreditPayment[]> => {
    const storeId = getStoreId();
    if (!storeId) return [];
    const data = await callSyncFunction({ action: 'fetch', store_id: storeId, data_type: 'credit_payments' });
    if (data?.items) {
      const items = data.items.map(dbToLocalCreditPayment);
      setCreditPayments(items);
      return items;
    }
    return [];
  }, []);

  const syncWhatsappConfig = useCallback(async () => {
    const storeId = getStoreId();
    if (!storeId) return null;
    const data = await callSyncFunction({ action: 'fetch', store_id: storeId, data_type: 'whatsapp_config' });
    return data?.config || null;
  }, []);

  // Direct mutations to Supabase Cloud - throws error immediately on failure (No offline caching/retry queue)
  const saveInventoryToCloud = useCallback(async (items: InventoryItem[]) => {
    const storeId = getStoreId();
    if (!storeId || items.length === 0) return;
    await callSyncFunction({ action: 'save', store_id: storeId, data_type: 'inventory', items });
  }, []);

  const saveExpensesToCloud = useCallback(async (items: Expense[]) => {
    const storeId = getStoreId();
    if (!storeId || items.length === 0) return;
    await callSyncFunction({ action: 'save', store_id: storeId, data_type: 'expenses', items });
  }, []);

  const saveHeldBillsToCloud = useCallback(async (items: HeldBill[]) => {
    const storeId = getStoreId();
    if (!storeId || items.length === 0) return;
    await callSyncFunction({ action: 'save', store_id: storeId, data_type: 'held_bills', items });
  }, []);

  const deleteHeldBillFromCloud = useCallback(async (billId: string) => {
    const storeId = getStoreId();
    if (!storeId) return;
    await callSyncFunction({ action: 'delete', store_id: storeId, data_type: 'held_bills', item_ids: [billId] });
  }, []);

  const saveCustomerToCloud = useCallback(async (items: Customer[]) => {
    const storeId = getStoreId();
    if (!storeId || items.length === 0) return;
    await callSyncFunction({ action: 'save', store_id: storeId, data_type: 'customers', items });
  }, []);

  const saveCreditEntryToCloud = useCallback(async (items: CreditEntry[]) => {
    const storeId = getStoreId();
    if (!storeId || items.length === 0) return;
    await callSyncFunction({ action: 'save', store_id: storeId, data_type: 'credit_ledger', items });
  }, []);

  const saveCreditPaymentToCloud = useCallback(async (items: CreditPayment[]) => {
    const storeId = getStoreId();
    if (!storeId || items.length === 0) return;
    await callSyncFunction({
      action: 'save',
      store_id: storeId,
      data_type: 'credit_payments',
      items: items.map(pay => ({
        id: pay.id,
        credit_ledger_id: pay.credit_ledger_id || pay.credit_id,
        amount: Number(pay.amount || 0),
        payment_method: pay.payment_method,
        reference: pay.reference || pay.received_by || null,
        notes: pay.notes || null,
        created_at: new Date(pay.created_at).toISOString(),
      }))
    });
  }, []);

  const saveWhatsappConfigToCloud = useCallback(async (config: any) => {
    const storeId = getStoreId();
    if (!storeId) return;
    await callSyncFunction({ action: 'save', store_id: storeId, data_type: 'whatsapp_config', config });
  }, []);

  const startPeriodicSync = useCallback(() => {
    // Cloud-only: periodic sync intervals and offline retry queue loops are removed
    return () => {};
  }, []);

  return {
    syncInventory,
    syncExpenses,
    syncHeldBills,
    syncTables,
    syncSettings,
    syncMenuItems,
    syncCategories,
    syncCustomers,
    syncCreditLedger,
    syncCreditPayments,
    syncWhatsappConfig,
    saveInventoryToCloud,
    saveExpensesToCloud,
    saveHeldBillsToCloud,
    deleteHeldBillFromCloud,
    saveCustomerToCloud,
    saveCreditEntryToCloud,
    saveCreditPaymentToCloud,
    saveWhatsappConfigToCloud,
    startPeriodicSync,
  };
};
