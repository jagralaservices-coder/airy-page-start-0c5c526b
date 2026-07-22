/**
 * SubscriptionContext — Phase 2B extraction.
 *
 * Runs the merchant-subscription resolution exactly once for the app and
 * publishes a memoized value that every consumer (useSubscription,
 * FeatureAccessProvider, plan badges, feature gating) reads from. It
 * consumes MerchantContext for merchant resolution and NEVER performs its
 * own — merchant resolution lives in MerchantContext only.
 *
 * Dependency graph:
 *   AuthContext → MerchantContext → SubscriptionContext
 *
 * Backwards compatibility: the public `useSubscription()` hook keeps the
 * same return shape and continues to be the primary API. It now reads from
 * this context when the provider is mounted; when not mounted it falls
 * back to the legacy in-hook resolution so nothing breaks in tests /
 * isolated trees.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMerchant } from '@/contexts/MerchantContext';
import { _featureAccessSnapshot } from '@/contexts/FeatureAccessContext';
import { resolveFeatureKey } from '@/lib/featureCatalog';
import {
  SubscriptionTier,
  BusinessType,
  FEATURES,
  BASIC_REPORT_PATHS,
  hasFeatureAccess,
  meetsMinTier,
  getTierLimits,
  getTierLabel,
} from '@/lib/subscriptionConfig';

const TIER_MAP: Record<string, SubscriptionTier> = {
  basic: 'basic',
  pro: 'gold',
  gold: 'gold',
  enterprise: 'platinum',
  platinum: 'platinum',
};

export interface SubscriptionState {
  tier: SubscriptionTier;
  businessType: BusinessType;
  enabledAddons: string[];
  staffLimit: number;
  outletLimit: number;
  loading: boolean;
  expiryDate: string | null;
  isTrial: boolean;
  status: string | null;
}

export interface SubscriptionContextValue extends SubscriptionState {
  limits: { maxStaff: number; maxOutlets: number; maxReports: number };
  tierLabel: string;
  isGold: boolean;
  isPlatinum: boolean;
  isPro: boolean;
  isEnterprise: boolean;
  canAccess: (featureKey: string) => boolean;
  canAccessReport: (reportPath: string) => boolean;
  requiresUpgrade: (featureKey: string) => SubscriptionTier | null;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { role } = useAuth();
  const { merchantId, storeIdFromRole } = useMerchant();
  const [state, setState] = useState<SubscriptionState>({
    tier: 'basic',
    businessType: 'restaurant',
    enabledAddons: [],
    staffLimit: 2,
    outletLimit: 1,
    loading: true,
    expiryDate: null,
    isTrial: false,
    status: null,
  });

  const resolve = useCallback(async () => {
    // Super_admin / admin bypass — always platinum.
    if (role === 'super_admin' || role === 'admin') {
      setState((s) => ({
        ...s,
        tier: 'platinum',
        staffLimit: 999,
        outletLimit: 999,
        loading: false,
      }));
      return;
    }

    // Merchant resolution owned by MerchantContext. Fallbacks below are
    // subscription-specific (localStorage store-login + role.store_id lookup)
    // and do NOT re-query user_roles — that would duplicate MerchantContext.
    let mId: string | null = merchantId;
    let bType: BusinessType | null = null;

    if (!mId) {
      try {
        const raw = localStorage.getItem('pos_active_store_data');
        if (raw) {
          const parsed = JSON.parse(raw);
          mId = parsed?.customer_id || parsed?.merchant_id || null;
          if (parsed?.business_type) bType = parsed.business_type as BusinessType;
        }
      } catch { /* ignore malformed cache */ }
    }

    if (!mId && storeIdFromRole) {
      try {
        const { data: storeRow } = await (supabase as any)
          .from('stores')
          .select('merchant_id, business_type')
          .eq('id', storeIdFromRole)
          .maybeSingle();
        if (storeRow?.merchant_id) mId = storeRow.merchant_id;
        if (storeRow?.business_type) bType = storeRow.business_type as BusinessType;
      } catch { /* fall through */ }
    }

    if (mId) {
      try {
        const { data: sub } = await (supabase as any)
          .from('merchant_subscription')
          .select('plan_name, staff_limit, outlet_limit, extra_staff, extra_outlets, expiry_date, status')
          .eq('merchant_id', mId)
          .maybeSingle();

        if (sub) {
          const expired = sub.status !== 'active' || (sub.expiry_date && new Date(sub.expiry_date) < new Date());
          const effective: SubscriptionTier = expired ? 'basic' : (TIER_MAP[sub.plan_name] || 'basic');
          const { data: m } = await supabase.from('merchants').select('business_type').eq('id', mId).maybeSingle();
          try {
            localStorage.setItem('maxora.plan.v1', JSON.stringify({
              tier: effective,
              staffLimit: sub.staff_limit,
              outletLimit: sub.outlet_limit,
            }));
          } catch { /* localStorage may be unavailable */ }
          setState({
            tier: effective,
            businessType: (m?.business_type as BusinessType) || bType || 'restaurant',
            enabledAddons: [],
            staffLimit: (sub.staff_limit || 0) + (sub.extra_staff || 0),
            outletLimit: (sub.outlet_limit || 1) + (sub.extra_outlets || 0),
            loading: false,
            expiryDate: sub.expiry_date || null,
            isTrial: sub.status === 'trial',
            status: sub.status || null,
          });
          return;
        }
      } catch (e) {
        console.warn('[SubscriptionContext] merchant_subscription fetch failed', e);
      }

      // Fall back to the merchants table.
      const { data: m } = await supabase
        .from('merchants')
        .select('subscription_tier, subscription_plan, business_type')
        .eq('id', mId)
        .maybeSingle();
      if (m) {
        const planKey = (m as any).subscription_tier || (m as any).subscription_plan || 'basic';
        setState((s) => ({
          ...s,
          tier: TIER_MAP[planKey] || 'basic',
          businessType: ((m as any).business_type as BusinessType) || bType || 'restaurant',
          loading: false,
        }));
        return;
      }
    }

    // Last-resort fallback: cached tier from store-login payload.
    try {
      const raw = localStorage.getItem('pos_active_store_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.subscription_tier) {
          setState((s) => ({
            ...s,
            tier: TIER_MAP[parsed.subscription_tier] || 'basic',
            businessType: (parsed.business_type as BusinessType) || bType || s.businessType,
            loading: false,
          }));
          return;
        }
      }
    } catch { /* ignore */ }

    setState((s) => ({ ...s, loading: false, businessType: bType || s.businessType }));
  }, [role, merchantId, storeIdFromRole]);

  useEffect(() => { void resolve(); }, [resolve]);

  // Refresh when the active store changes (owner switching stores can flip
  // the effective merchant on a store-login session).
  useEffect(() => {
    const onStoreChange = () => { void resolve(); };
    window.addEventListener('pos:store-changed', onStoreChange);
    window.addEventListener('pos:active-store-changed', onStoreChange);
    return () => {
      window.removeEventListener('pos:store-changed', onStoreChange);
      window.removeEventListener('pos:active-store-changed', onStoreChange);
    };
  }, [resolve]);

  const canAccess = useCallback((featureKey: string): boolean => {
    if (role === 'admin' || role === 'super_admin') return true;
    const snap = _featureAccessSnapshot();
    if (snap.isAdmin) return true;
    if (snap.allowed && snap.allowed.size > 0) {
      const resolved = resolveFeatureKey(featureKey);
      if (snap.allowed.has(resolved) || snap.allowed.has(featureKey)) return true;
    }
    return hasFeatureAccess(state.tier, state.businessType, featureKey, state.enabledAddons);
  }, [role, state.tier, state.businessType, state.enabledAddons]);

  const canAccessReport = useCallback((reportPath: string): boolean => {
    if (role === 'admin' || role === 'super_admin') return true;
    if (meetsMinTier(state.tier, 'gold')) return true;
    const map: Record<string, string> = {
      '/reports/order-summary': 'orderSummaryReport',
      '/reports/executive-sales': 'executiveSaleReport',
      '/reports/employee-summary': 'employeeSummaryReport',
      '/reports/group-summary': 'groupSummaryReport',
      '/reports/variation-summary': 'variationSummaryReport',
      '/reports/cover-size-summary': 'coverSizeSummaryReport',
      '/reports/tip-summary': 'tipSummaryReport',
      '/reports/counter-summary': 'counterSummaryReport',
    };
    const featureKey = map[reportPath];
    if (featureKey) return hasFeatureAccess(state.tier, state.businessType, featureKey, state.enabledAddons);
    return BASIC_REPORT_PATHS.includes(reportPath);
  }, [role, state.tier, state.businessType, state.enabledAddons]);

  const requiresUpgrade = useCallback((featureKey: string): SubscriptionTier | null => {
    if (canAccess(featureKey)) return null;
    const feature = FEATURES[featureKey];
    if (!feature) return null;
    return state.businessType === 'restaurant' ? feature.restaurant : feature.retail;
  }, [canAccess, state.businessType]);

  const limits = useMemo(() => {
    const base = getTierLimits(state.tier, state.businessType);
    return {
      maxStaff: Math.max(base.maxStaff, state.staffLimit),
      maxOutlets: Math.max(base.maxOutlets, state.outletLimit),
      maxReports: base.maxReports,
    };
  }, [state.tier, state.businessType, state.staffLimit, state.outletLimit]);

  const value = useMemo<SubscriptionContextValue>(() => ({
    ...state,
    limits,
    tierLabel: getTierLabel(state.tier),
    isGold: meetsMinTier(state.tier, 'gold'),
    isPlatinum: meetsMinTier(state.tier, 'platinum'),
    isPro: meetsMinTier(state.tier, 'gold'),
    isEnterprise: meetsMinTier(state.tier, 'platinum'),
    canAccess,
    canAccessReport,
    requiresUpgrade,
    refresh: resolve,
  }), [state, limits, canAccess, canAccessReport, requiresUpgrade, resolve]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
};

export function useSubscriptionContext(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscriptionContext must be used within a SubscriptionProvider');
  return ctx;
}

export function useSubscriptionContextSafe(): SubscriptionContextValue | null {
  return useContext(SubscriptionContext) ?? null;
}
