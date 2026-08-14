// Enterprise Opening & Closing Inventory Audit Store
// Provides durable, offline-first persistence for store opening & closing reconciliation sessions.

import { InventoryItem } from '@/lib/store';

export interface OpeningAuditItem {
  productId: string;
  productName: string;
  category: string;
  subCategory?: string;
  brand?: string;
  sku: string;
  barcode: string;
  unit: string;
  netWeight?: number;
  grossWeight?: number;
  currentStock: number;
  openingQty: number; // Staff entered physical count
  openingWeight?: number;
  openingPieces?: number;
  costPrice: number;
  sellingPrice: number;
  mrp?: number;
  tax?: number;
  supplier?: string;
  batchNumber?: string;
  expiryDate?: string;
  mfgDate?: string;
  notes?: string;
}

export interface OpeningAuditRecord {
  id: string;
  storeId: string;
  storeName?: string;
  auditDate: string; // YYYY-MM-DD
  openingTime: string; // ISO
  staffId: string;
  staffName: string;
  status: 'draft' | 'submitted' | 'approved';
  notes?: string;
  deviceInfo?: string;
  gpsCoordinates?: string;
  items: OpeningAuditItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ClosingAuditItem {
  productId: string;
  productName: string;
  sku: string;
  barcode: string;
  category: string;
  unit: string;
  netWeight: number;
  costPrice: number;
  sellingPrice: number;
  openingStock: number;
  purchasedQty: number;
  returnedQty: number;
  soldQty: number; // Direct menu sales + Recipe ingredient consumption
  wastageQty: number;
  damagedQty: number;
  transferInQty: number;
  transferOutQty: number;
  expectedClosingStock: number; // Opening + Purchase + TransferIn - Sold - Returned - Wastage - TransferOut
  physicalCount: number; // Staff counted actual stock
  difference: number; // physicalCount - expectedClosingStock
  weightDifference: number; // difference * netWeight
  variancePercent: number; // (difference / (expectedClosingStock || 1)) * 100
  status: 'perfect' | 'small_diff' | 'large_diff'; // perfect (0%), small (<5%), large (>=5%)
  inventoryLoss: number; // (|diff| * costPrice if diff < 0)
  inventoryProfit: number; // (diff * costPrice if diff > 0)
  notes?: string;
}

export interface ClosingAuditRecord {
  id: string;
  openingAuditId?: string;
  storeId: string;
  storeName?: string;
  auditDate: string; // YYYY-MM-DD
  closingTime: string; // ISO
  staffId: string;
  staffName: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'recount_requested';
  approvedBy?: string;
  approvalTime?: string;
  ownerComments?: string;
  managerComments?: string;
  deviceInfo?: string;
  gpsCoordinates?: string;
  items: ClosingAuditItem[];
  summary: {
    openingValue: number;
    closingValue: number;
    totalSalesQty: number;
    totalSalesValue: number;
    totalPurchaseQty: number;
    totalWastageQty: number;
    totalWastageValue: number;
    totalStockDifference: number;
    totalInventoryLoss: number;
    totalInventoryProfit: number;
    productsWithVariance: number;
    outOfStockProducts: number;
    lowStockProducts: number;
  };
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEYS = {
  OPENING_AUDITS: 'pos_opening_audits_v1',
  CLOSING_AUDITS: 'pos_closing_audits_v1',
  AUDIT_CONFIG: 'pos_audit_config_v1',
};

export interface AuditConfig {
  varianceThresholdPercent: number; // Default: 5%
  lossThresholdAmount: number; // Default: 500
  requireOwnerApproval: boolean;
}

export const getAuditConfig = (): AuditConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AUDIT_CONFIG);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading audit config', e);
  }
  return {
    varianceThresholdPercent: 5,
    lossThresholdAmount: 500,
    requireOwnerApproval: true,
  };
};

export const setAuditConfig = (config: AuditConfig): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.AUDIT_CONFIG, JSON.stringify(config));
  } catch (e) {
    console.error('Error saving audit config', e);
  }
};

// Opening Audits storage
export const getOpeningAudits = (): OpeningAuditRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OPENING_AUDITS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error fetching opening audits', e);
  }
  return [];
};

export const saveOpeningAudit = (record: OpeningAuditRecord): OpeningAuditRecord => {
  const existing = getOpeningAudits();
  const idx = existing.findIndex(r => r.id === record.id);
  let updated: OpeningAuditRecord[];
  if (idx >= 0) {
    existing[idx] = { ...record, updatedAt: new Date().toISOString() };
    updated = [...existing];
  } else {
    updated = [{ ...record, createdAt: record.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }, ...existing];
  }
  try {
    localStorage.setItem(STORAGE_KEYS.OPENING_AUDITS, JSON.stringify(updated));
  } catch (e) {
    console.error('Error writing opening audit', e);
  }
  return record;
};

// Closing Audits storage
export const getClosingAudits = (): ClosingAuditRecord[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CLOSING_AUDITS);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error fetching closing audits', e);
  }
  return [];
};

export const saveClosingAudit = (record: ClosingAuditRecord): ClosingAuditRecord => {
  const existing = getClosingAudits();
  const idx = existing.findIndex(r => r.id === record.id);
  let updated: ClosingAuditRecord[];
  if (idx >= 0) {
    existing[idx] = { ...record, updatedAt: new Date().toISOString() };
    updated = [...existing];
  } else {
    updated = [{ ...record, createdAt: record.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }, ...existing];
  }
  try {
    localStorage.setItem(STORAGE_KEYS.CLOSING_AUDITS, JSON.stringify(updated));
  } catch (e) {
    console.error('Error writing closing audit', e);
  }
  return record;
};

export const updateClosingAuditStatus = (
  auditId: string,
  status: ClosingAuditRecord['status'],
  approvedBy?: string,
  ownerComments?: string
): ClosingAuditRecord | null => {
  const existing = getClosingAudits();
  const idx = existing.findIndex(r => r.id === auditId);
  if (idx < 0) return null;

  const target = existing[idx];
  target.status = status;
  if (approvedBy) target.approvedBy = approvedBy;
  if (ownerComments) target.ownerComments = ownerComments;
  target.approvalTime = new Date().toISOString();
  target.updatedAt = new Date().toISOString();

  existing[idx] = target;
  localStorage.setItem(STORAGE_KEYS.CLOSING_AUDITS, JSON.stringify(existing));
  return target;
};
