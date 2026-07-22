/**
 * useSubscription — Phase 2B migration.
 *
 * Reads from SubscriptionContext when the provider is mounted (the
 * production path). Falls back to the pre-Phase-2B in-hook resolution when
 * the provider is missing, so isolated tests / storybook keep working.
 *
 * The return shape is unchanged for backwards compatibility.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useSubscriptionContextSafe } from '@/contexts/SubscriptionContext';
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

export function useSubscription() {
  const ctx = useSubscriptionContextSafe();
  const legacy = useLegacySubscription(!!ctx);

  if (ctx) {
    return {
      tier: ctx.tier,
      businessType: ctx.businessType,
      enabledAddons: ctx.enabledAddons,
      loading: ctx.loading,
      limits: ctx.limits,
      canAccess: ctx.canAccess,
      canAccessReport: ctx.canAccessReport,
      requiresUpgrade: ctx.requiresUpgrade,
      tierLabel: ctx.tierLabel,
      isGold: ctx.isGold,
      isPlatinum: ctx.isPlatinum,
      isPro: ctx.isPro,
      isEnterprise: ctx.isEnterprise,
    };
  }
  return legacy;
}

// ---------------------------------------------------------------------------
// Legacy fallback (unchanged behavior from pre-Phase-2B). Only runs when the
// SubscriptionProvider is absent. Guarded by `skip` so the provider path
// doesn't waste queries.
// ---------------------------------------------------------------------------
function useLegacySubscription(skip: boolean) {
  const { customer, userRole } = useSupabaseAuth();
  const [tier, setTier] = useState<SubscriptionTier>('basic');
  const [businessType, setBusinessType] = useState<BusinessType>('restaurant');
  const [enabledAddons] = useState<string[]>([]);
  const [staffLimit, setStaffLimit] = useState(2);
  const [outletLimit, setOutletLimit] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (skip) return;
    const tierMap: Record<string, SubscriptionTier> = {
      basic: 'basic', pro: 'gold', gold: 'gold', enterprise: 'platinum', platinum: 'platinum',
    };
    const run = async () => {
      if (userRole?.role === 'super_admin' || userRole?.role === 'admin') {
        setTier('platinum'); setStaffLimit(999); setOutletLimit(999); setLoading(false); return;
      }
      let merchantId: string | null = customer?.id || (userRole as any)?.customer_id || (userRole as any)?.merchant_id || null;
      if (!merchantId) {
        try {
          const raw = localStorage.getItem('pos_active_store_data');
          if (raw) {
            const parsed = JSON.parse(raw);
            merchantId = parsed?.customer_id || parsed?.merchant_id || null;
            if (parsed?.business_type) setBusinessType(parsed.business_type as BusinessType);
          }
        } catch { /* ignore */ }
      }
      if (!merchantId && (userRole as any)?.store_id) {
        try {
          const { data: storeRow } = await (supabase as any)
            .from('stores').select('merchant_id, business_type')
            .eq('id', (userRole as any).store_id).maybeSingle();
          if (storeRow?.merchant_id) merchantId = storeRow.merchant_id;
          if (storeRow?.business_type) setBusinessType(storeRow.business_type as BusinessType);
        } catch { /* ignore */ }
      }
      if (merchantId) {
        try {
          const { data: sub } = await (supabase as any)
            .from('merchant_subscription')
            .select('plan_name, staff_limit, outlet_limit, extra_staff, extra_outlets, expiry_date, status')
            .eq('merchant_id', merchantId).maybeSingle();
          if (sub) {
            const expired = sub.status !== 'active' || (sub.expiry_date && new Date(sub.expiry_date) < new Date());
            const effective: SubscriptionTier = expired ? 'basic' : (tierMap[sub.plan_name] || 'basic');
            setTier(effective);
            setStaffLimit((sub.staff_limit || 0) + (sub.extra_staff || 0));
            setOutletLimit((sub.outlet_limit || 1) + (sub.extra_outlets || 0));
            const { data: m } = await supabase.from('merchants').select('business_type').eq('id', merchantId).maybeSingle();
            if (m?.business_type) setBusinessType(m.business_type as BusinessType);
            setLoading(false); return;
          }
        } catch (e) { console.warn('[useSubscription legacy] fetch failed', e); }
        const { data: m } = await supabase.from('merchants')
          .select('subscription_tier, subscription_plan, business_type').eq('id', merchantId).maybeSingle();
        if (m) {
          const planKey = (m as any).subscription_tier || (m as any).subscription_plan || 'basic';
          setTier(tierMap[planKey] || 'basic');
          setBusinessType(((m as any).business_type as BusinessType) || 'restaurant');
        }
      }
      try {
        const raw = localStorage.getItem('pos_active_store_data');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.subscription_tier) setTier(tierMap[parsed.subscription_tier] || 'basic');
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    run();
  }, [customer, userRole, skip]);

  const limits = useMemo(() => {
    const base = getTierLimits(tier, businessType);
    return {
      maxStaff: Math.max(base.maxStaff, staffLimit),
      maxOutlets: Math.max(base.maxOutlets, outletLimit),
      maxReports: base.maxReports,
    };
  }, [tier, businessType, staffLimit, outletLimit]);

  const canAccess = useCallback((featureKey: string): boolean => {
    if (userRole?.role === 'admin' || userRole?.role === 'super_admin') return true;
    const snap = _featureAccessSnapshot();
    if (snap.isAdmin) return true;
    if (snap.allowed && snap.allowed.size > 0) {
      const resolved = resolveFeatureKey(featureKey);
      if (snap.allowed.has(resolved) || snap.allowed.has(featureKey)) return true;
    }
    return hasFeatureAccess(tier, businessType, featureKey, enabledAddons);
  }, [tier, businessType, enabledAddons, userRole]);

  const canAccessReport = useCallback((reportPath: string): boolean => {
    if (userRole?.role === 'admin' || userRole?.role === 'super_admin') return true;
    if (meetsMinTier(tier, 'gold')) return true;
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
    if (featureKey) return hasFeatureAccess(tier, businessType, featureKey, enabledAddons);
    return BASIC_REPORT_PATHS.includes(reportPath);
  }, [tier, userRole, businessType, enabledAddons]);

  const requiresUpgrade = useCallback((featureKey: string): SubscriptionTier | null => {
    if (canAccess(featureKey)) return null;
    const feature = FEATURES[featureKey];
    if (!feature) return null;
    return businessType === 'restaurant' ? feature.restaurant : feature.retail;
  }, [canAccess, businessType]);

  return {
    tier, businessType, enabledAddons, loading, limits,
    canAccess, canAccessReport, requiresUpgrade,
    tierLabel: getTierLabel(tier),
    isGold: meetsMinTier(tier, 'gold'),
    isPlatinum: meetsMinTier(tier, 'platinum'),
    isPro: meetsMinTier(tier, 'gold'),
    isEnterprise: meetsMinTier(tier, 'platinum'),
  };
}
