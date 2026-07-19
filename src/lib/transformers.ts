import { InventoryItem, Expense, HeldBill, MenuItem, Category, Customer, CreditEntry, CreditPayment, Order } from './store';
import { parseOrderPaymentBreakdown } from './paymentBreakdown';

export const dbToLocalInventory = (db: any): InventoryItem => ({
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

export const dbToLocalExpense = (db: any): Expense => ({
  id: db.id,
  category: db.category,
  amount: Number(db.amount),
  description: db.description || '',
  date: new Date(db.date),
  paidBy: db.paid_by || '',
  storeId: db.store_id,
});

export const dbToLocalHeldBill = (db: any): HeldBill => ({
  id: db.id,
  items: db.items || [],
  tableNumber: db.table_number || undefined,
  customerName: db.customer_name || undefined,
  heldAt: new Date(db.held_at),
});

export const dbToLocalMenuItem = (db: any, ingredients: any[] = [], variations: any[] = []): MenuItem => ({
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

export const dbToLocalCategory = (db: any): Category => ({
  id: db.category_id || db.id,
  name: db.name,
  nameHindi: db.name_hindi || undefined,
  icon: db.icon || '📦',
  color: db.color || 'cat-food',
  lastUpdated: db.updated_at,
});

export const dbToLocalCustomer = (db: any): Customer => ({
  id: db.id,
  name: db.name,
  phone: db.phone || '',
  email: db.email || '',
  address: db.address || '',
  createdAt: db.created_at,
  lastUpdated: db.updated_at || db.created_at,
});

// Phase 2.6 — credit_ledger normalized columns.
// Legacy display fields (customer_name/phone/bill_number/total_amount/payment_status)
// are derived at the caller (after joining pos_customers + orders) so the UI keeps
// working without changes.
export const dbToLocalCreditEntry = (db: any): CreditEntry => {
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
    // Display-only derivations (caller may overwrite with joined values):
    customer_name: db.customer_name || db.pos_customers?.name || '',
    customer_phone: db.customer_phone || db.pos_customers?.phone || null,
    bill_number: db.bill_number || db.orders?.bill_number || null,
    total_amount: paid + due,
    payment_status: paymentStatus,
  };
};

export const dbToLocalCreditPayment = (db: any): CreditPayment => ({
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

export const dbToLocalOrder = (dbOrder: any): Order => ({
  id: dbOrder.id,
  billNumber: dbOrder.bill_number,
  items: dbOrder.items || [],
  subtotal: Number(dbOrder.subtotal),
  tax: Number(dbOrder.tax),
  discount: Number(dbOrder.discount),
  total: Number(dbOrder.total),
  status: dbOrder.status,
  orderType: dbOrder.order_type,
  tableNumber: dbOrder.table_number ? Number(dbOrder.table_number) : undefined,
  customerName: dbOrder.customer_name || undefined,
  customerPhone: dbOrder.customer_phone || undefined,
  paymentMethod: dbOrder.payment_method,
  paymentBreakdown: parseOrderPaymentBreakdown(dbOrder),
  createdAt: new Date(dbOrder.created_at),
  kotPrinted: false,
  billPrinted: dbOrder.status === 'completed',
  isDirectBill: true,
  cancelReason: dbOrder.cancel_reason || undefined,
  cancelledAt: dbOrder.cancelled_at || undefined,
  storeId: dbOrder.store_id,
});
