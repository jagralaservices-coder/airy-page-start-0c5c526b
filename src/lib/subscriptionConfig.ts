// Subscription tier feature gating configuration
// Business-type aware: Restaurant vs Retail

export type SubscriptionTier = 'basic' | 'gold' | 'platinum' | 'custom';
export type BusinessType = 'restaurant' | 'retail';

export interface FeatureConfig {
  key: string;
  label: string;
  restaurant: SubscriptionTier;
  retail: SubscriptionTier;
  isAddon?: boolean;
}

// Tier hierarchy for comparison
const TIER_LEVEL: Record<SubscriptionTier, number> = {
  basic: 1,
  gold: 2,
  platinum: 3,
  custom: 4,
};

// ─── ADD-ON KEYS ────────────────────────────────────────────
export const ADDON_KEYS = [
  'delivery_tracking',
  'multi_outlet',
  'api_integrations',
  'staff_limit_increase',
  'expense_tracking',
  'alerts_notifications',
  'auto_stock_system',
  'advanced_inventory_recipes',
  'qr_menu_ordering',
  'table_management',
  'swiggy_zomato',
  'advanced_reports',
  'central_dashboard',
] as const;

export type AddonKey = typeof ADDON_KEYS[number];

// ─── FEATURE DEFINITIONS ───────────────────────────────────
// minTier per business type; 'basic' = available to all
export const FEATURES: Record<string, FeatureConfig> = {
  // ── BASIC (both) ──
  billing: { key: 'billing', label: 'Billing & KOT', restaurant: 'basic', retail: 'basic' },
  gstInvoice: { key: 'gstInvoice', label: 'GST Invoice', restaurant: 'basic', retail: 'basic' },
  multiplePayments: { key: 'multiplePayments', label: 'Multiple Payment Options', restaurant: 'basic', retail: 'basic' },
  basicReports: { key: 'basicReports', label: 'Basic Reports (3-4)', restaurant: 'basic', retail: 'basic' },
  menuManagement: { key: 'menuManagement', label: 'Menu / Product Management', restaurant: 'basic', retail: 'basic' },
  basicInventory: { key: 'basicInventory', label: 'Basic Inventory (Manual)', restaurant: 'basic', retail: 'basic' },
  manualInventory: { key: 'manualInventory', label: 'Manual Stock Update (+/-)', restaurant: 'basic', retail: 'basic' },
  customerManagement: { key: 'customerManagement', label: 'Customer Management', restaurant: 'basic', retail: 'basic' },
  support247: { key: 'support247', label: '24/7 Support', restaurant: 'basic', retail: 'basic' },
  barcodeScanner: { key: 'barcodeScanner', label: 'Product Scanner (Barcode)', restaurant: 'none' as any, retail: 'basic' },

  // ── RESTRICTED FROM BASIC (both restaurant & retail) ──
  cashFlow: { key: 'cashFlow', label: 'Cash Flow', restaurant: 'platinum', retail: 'gold' },
  withdrawal: { key: 'withdrawal', label: 'Withdrawal', restaurant: 'platinum', retail: 'gold' },
  cashTopUp: { key: 'cashTopUp', label: 'Cash Top-Up', restaurant: 'platinum', retail: 'gold' },

  deliveryBoys: { key: 'deliveryBoys', label: 'Delivery Boys', restaurant: 'platinum', retail: 'gold' },
  employeeSummaryReport: { key: 'employeeSummaryReport', label: 'Employee Summary', restaurant: 'platinum', retail: 'gold' },
  groupSummaryReport: { key: 'groupSummaryReport', label: 'Group Summary', restaurant: 'platinum', retail: 'gold' },
  variationSummaryReport: { key: 'variationSummaryReport', label: 'Variation Summary', restaurant: 'platinum', retail: 'gold' },
  coverSizeSummaryReport: { key: 'coverSizeSummaryReport', label: 'Cover Size Summary', restaurant: 'platinum', retail: 'gold' },
  tipSummaryReport: { key: 'tipSummaryReport', label: 'Tip Summary', restaurant: 'platinum', retail: 'gold' },
  counterSummaryReport: { key: 'counterSummaryReport', label: 'Counter Summary', restaurant: 'platinum', retail: 'gold' },

  // ── ORDER TYPES & VIEWS (Gold+ for both) ──
  dineIn: { key: 'dineIn', label: 'Dine In', restaurant: 'gold', retail: 'gold' },
  takeaway: { key: 'takeaway', label: 'Take Away', restaurant: 'gold', retail: 'gold' },
  delivery: { key: 'delivery', label: 'Delivery', restaurant: 'gold', retail: 'gold' },
  kot: { key: 'kot', label: 'KOT System', restaurant: 'basic', retail: 'basic' },
  kotPrint: { key: 'kotPrint', label: 'KOT Print', restaurant: 'basic', retail: 'basic' },
  searchKot: { key: 'searchKot', label: 'Search KOT', restaurant: 'basic', retail: 'basic' },
  qrOrders: { key: 'qrOrders', label: 'QR Orders', restaurant: 'gold', retail: 'gold' },
  orderSummaryReport: { key: 'orderSummaryReport', label: 'Order Summary Report', restaurant: 'basic', retail: 'basic' },
  executiveSaleReport: { key: 'executiveSaleReport', label: 'Executive Sale Summary', restaurant: 'gold', retail: 'gold' },
  

  // ── GOLD ──
  fullInventory: { key: 'fullInventory', label: 'Full Inventory Management', restaurant: 'gold', retail: 'gold', isAddon: false },
  recipeManagement: { key: 'recipeManagement', label: 'Recipe Management', restaurant: 'gold', retail: 'platinum', isAddon: true },
  recipeInventory: { key: 'recipeInventory', label: 'Recipe-based Auto Deduction', restaurant: 'gold', retail: 'gold', isAddon: true },
  advancedReports: { key: 'advancedReports', label: 'Reports (5-6 categories)', restaurant: 'gold', retail: 'gold', isAddon: true },
  expenseTracking: { key: 'expenseTracking', label: 'Expense Tracking', restaurant: 'gold', retail: 'gold', isAddon: true },
  tableManagement: { key: 'tableManagement', label: 'Table Management', restaurant: 'gold', retail: 'platinum', isAddon: true },
  qrMenuOrdering: { key: 'qrMenuOrdering', label: 'QR Menu Ordering', restaurant: 'gold', retail: 'platinum', isAddon: true },
  staffManagement: { key: 'staffManagement', label: 'Staff Management', restaurant: 'gold', retail: 'gold' },
  faceVerification: { key: 'faceVerification', label: 'Face Verification Attendance', restaurant: 'gold', retail: 'gold' },
  geoFencing: { key: 'geoFencing', label: 'Geo-fencing (200m)', restaurant: 'gold', retail: 'gold' },
  swiggyZomato: { key: 'swiggyZomato', label: 'Swiggy/Zomato Integration', restaurant: 'gold', retail: 'platinum', isAddon: true },
  teamChat: { key: 'teamChat', label: 'Team Chat', restaurant: 'gold', retail: 'gold' },
  thirdPartyIntegration: { key: 'thirdPartyIntegration', label: '3rd Party Integration', restaurant: 'gold', retail: 'gold' },

  // ── PLATINUM ──
  multiOutlet: { key: 'multiOutlet', label: 'Multi-Outlet Management', restaurant: 'platinum', retail: 'platinum', isAddon: true },
  centralDashboard: { key: 'centralDashboard', label: 'Central Dashboard', restaurant: 'platinum', retail: 'platinum', isAddon: true },
  apiIntegrations: { key: 'apiIntegrations', label: 'API Integrations', restaurant: 'platinum', retail: 'platinum', isAddon: true },
  alertsNotifications: { key: 'alertsNotifications', label: 'Alerts & Notifications', restaurant: 'platinum', retail: 'platinum', isAddon: true },
  autoStockSystem: { key: 'autoStockSystem', label: 'Auto Stock Requirement (AI)', restaurant: 'platinum', retail: 'platinum', isAddon: true },
  smartInventory: { key: 'smartInventory', label: 'Smart Inventory (AI Predictions)', restaurant: 'platinum', retail: 'platinum', isAddon: true },
  deliveryTracking: { key: 'deliveryTracking', label: 'Delivery Tracking', restaurant: 'platinum', retail: 'platinum', isAddon: true },
  advancedAnalytics: { key: 'advancedAnalytics', label: 'Advanced Analytics Reports', restaurant: 'platinum', retail: 'platinum' },
  aiInsights: { key: 'aiInsights', label: 'AI Smart Insights', restaurant: 'platinum', retail: 'platinum' },


  // ── ADVANCED MODULES (Gold/Platinum gated) ──
  executiveDashboard: { key: 'executiveDashboard', label: 'Executive Dashboard', restaurant: 'gold', retail: 'gold' },
  aiControlCenter: { key: 'aiControlCenter', label: 'AI Control Center', restaurant: 'platinum', retail: 'platinum' },
  dynamicPricing: { key: 'dynamicPricing', label: 'Dynamic Pricing', restaurant: 'platinum', retail: 'platinum' },
  taxEngine: { key: 'taxEngine', label: 'Tax Engine', restaurant: 'gold', retail: 'gold' },
  revenueForecast: { key: 'revenueForecast', label: 'Revenue Forecast', restaurant: 'platinum', retail: 'platinum' },
  compliance: { key: 'compliance', label: 'Compliance Dashboard', restaurant: 'gold', retail: 'gold' },
  purchaseOrders: { key: 'purchaseOrders', label: 'Purchase Orders', restaurant: 'gold', retail: 'gold' },
  workforceAnalytics: { key: 'workforceAnalytics', label: 'Workforce Analytics', restaurant: 'gold', retail: 'gold' },
  creditLedger: { key: 'creditLedger', label: 'Credit Ledger', restaurant: 'gold', retail: 'basic' },
  kotListing: { key: 'kotListing', label: 'KOT Listing', restaurant: 'basic', retail: 'basic' },
};

// ─── ADDON → FEATURE KEY MAPPING ───────────────────────────
export const ADDON_TO_FEATURE: Record<AddonKey, string> = {
  delivery_tracking: 'deliveryTracking',
  multi_outlet: 'multiOutlet',
  api_integrations: 'apiIntegrations',
  staff_limit_increase: 'staffManagement',
  expense_tracking: 'expenseTracking',
  alerts_notifications: 'alertsNotifications',
  auto_stock_system: 'autoStockSystem',
  advanced_inventory_recipes: 'recipeManagement',
  qr_menu_ordering: 'qrMenuOrdering',
  table_management: 'tableManagement',
  swiggy_zomato: 'swiggyZomato',
  advanced_reports: 'advancedReports',
  central_dashboard: 'centralDashboard',
};

// ─── TIER LIMITS ────────────────────────────────────────────
export interface TierLimits {
  maxStaff: number;
  maxOutlets: number;
  maxReports: number;
}

export const RESTAURANT_TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  basic: { maxStaff: 2, maxOutlets: 1, maxReports: 6 },
  gold: { maxStaff: 10, maxOutlets: 1, maxReports: 10 },
  platinum: { maxStaff: 25, maxOutlets: 2, maxReports: 999 },
  custom: { maxStaff: 999, maxOutlets: 1, maxReports: 999 },
};

export const RETAIL_TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  basic: { maxStaff: 2, maxOutlets: 1, maxReports: 6 },
  gold: { maxStaff: 10, maxOutlets: 1, maxReports: 10 },
  platinum: { maxStaff: 25, maxOutlets: 2, maxReports: 999 },
  custom: { maxStaff: 999, maxOutlets: 1, maxReports: 999 },
};

export const PLAN_PRICING: Record<SubscriptionTier, number> = {
  basic: 7999,
  gold: 14999,
  platinum: 24999,
  custom: 9999,
};

export const OUTLET_PRICING: Record<SubscriptionTier, number> = {
  basic: 2999,
  gold: 4999,
  platinum: 7999,
  custom: 3999,
};

export const ADDONS_PRICING: Record<string, number> = {
  'QR Ordering Menu': 1999,
  'Staff Management': 1999,
  'Delivery System': 2999,
  'Barcode Scanner': 999,
  'Recipe Management': 3999,
  'Team Chat': 999,
  'Executive Sales Dashboard': 2999,
  'Employee Summary': 1499,
  'Group Summary': 1499,
  'Variation Summary': 1499,
  'Cover Size Summary': 1499,
  'TIP Summary': 1499,
  'Counter Summary': 1499,
  'Expense Tracker': 1999,
  'Cash Flow': 1999,
  'Withdrawal Report': 999,
  'Profit & Loss (P&L) Report': 2999,
  'Sales Trend Report': 1999,
  'Hourly Sales Report': 999,
  'Customer Report': 1499,
  'Loss Control': 2999,
  'tax/gst System': 2999,
  'Item Report': 1499,
  'Retention Report': 1999,
  'Target Report': 1999,
  'Kitchen Display System (KDS)': 3999,
  'Invoices': 999,
  'AI Insights': 4999,
  'Smart Inventory AI': 4999,
  'Billing POS App (Additional Device)': 2499,
  'Basic Inventory': 1999,
  'Customer Management': 1999,
  'Sales Comments': 999,
  'Order Summary': 999,
  'Category Summary': 999,
  'Item Summary': 999,
  'Payment Reports': 1499,
};

// ─── BASIC REPORT PATHS (allowed for all plans) ────────────
export const BASIC_REPORT_PATHS = [
  '/reports',
  '/reports/sales-summary',
  '/reports/item-summary',
  '/reports/category-summary',
];

// ─── HELPER FUNCTIONS ───────────────────────────────────────

export function meetsMinTier(currentTier: SubscriptionTier, minTier: SubscriptionTier): boolean {
  return TIER_LEVEL[currentTier] >= TIER_LEVEL[minTier];
}

export function hasFeatureAccess(
  currentTier: SubscriptionTier,
  businessType: BusinessType,
  featureKey: string,
  enabledAddons: string[] = []
): boolean {
  const feature = FEATURES[featureKey];
  if (!feature) return false;

  const requiredTier = businessType === 'restaurant' ? feature.restaurant : feature.retail;

  // Check plan access
  if (meetsMinTier(currentTier, requiredTier)) return true;

  // Check add-on override
  if (feature.isAddon) {
    const addonKey = Object.entries(ADDON_TO_FEATURE).find(([, fk]) => fk === featureKey)?.[0];
    if (addonKey && enabledAddons.includes(addonKey)) return true;
  }

  return false;
}

export function getRequiredTier(
  businessType: BusinessType,
  featureKey: string
): SubscriptionTier | null {
  const feature = FEATURES[featureKey];
  if (!feature) return null;
  return businessType === 'restaurant' ? feature.restaurant : feature.retail;
}

export function getTierLimits(
  tier: SubscriptionTier,
  businessType: BusinessType
): TierLimits {
  return businessType === 'restaurant'
    ? RESTAURANT_TIER_LIMITS[tier]
    : RETAIL_TIER_LIMITS[tier];
}

export function getTierLabel(tier: SubscriptionTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

// For backward compatibility
export const TIER_LIMITS = {
  basic: { maxStores: 1, maxUsers: 2, maxReports: 4 },
  gold: { maxStores: 1, maxUsers: 10, maxReports: 6 },
  platinum: { maxStores: 2, maxUsers: 20, maxReports: 999 },
  custom: { maxStores: 1, maxUsers: 999, maxReports: 999 },
};
