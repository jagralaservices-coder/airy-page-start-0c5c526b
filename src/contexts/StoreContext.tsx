/**
 * StoreContext — Phase 2B extraction.
 *
 * Single source of truth for the currently active POS store:
 *  - active store id + row
 *  - the owner's list of assignable stores (for the store-selection dialog)
 *  - localStorage persistence keys: owner_selected_store_id / _name,
 *    pos_active_store, pos_active_store_data, pos_is_store_login,
 *    pos_store_code, owner_store_selection_done
 *  - cross-tab / cross-hook change notification via
 *    `pos:active-store-changed` (existing) and the new `pos:store-changed`
 *    event mandated by the Phase 2B spec (dispatched together for
 *    backwards compatibility with any consumer already listening).
 *
 * This provider deliberately re-uses `useOwnerStore()` under the hood so no
 * behavior changes: the existing hook remains the implementation and this
 * context becomes the shared surface. That keeps store resolution running
 * exactly once at the provider level and lets downstream contexts
 * (Subscription, POSData) read a stable, memoized value instead of each
 * mounting `useOwnerStore` again.
 *
 * Additive by design — existing `useOwnerStore()` callers keep working.
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
import { useOwnerStore, type SelectedStore } from '@/hooks/useOwnerStore';

export interface StoreRow {
  id: string;
  name: string | null;
  address: string | null;
  business_type?: string | null;
  merchant_id?: string | null;
}

export interface StoreContextValue {
  /** Active store as tracked by owner-store selection / store-login. */
  activeStore: SelectedStore | null;
  activeStoreId: string | null;
  activeStoreName: string;
  /** Owner-only: list of stores under the current merchant. */
  stores: StoreRow[];
  isLoadingStores: boolean;
  storesError: string | null;
  /** True while owner has not chosen a store on first login. */
  shouldShowStoreSelection: boolean;
  isOwner: boolean;
  selectStore: (store: SelectedStore | null) => void;
  clearStore: () => void;
  dismissStoreSelection: () => void;
  refreshStores: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

function readActiveStoreDataMerchantId(): string | null {
  try {
    const raw = localStorage.getItem('pos_active_store_data');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.merchant_id || parsed?.customer_id || null;
  } catch {
    return null;
  }
}

export const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { merchantId } = useMerchant();
  const owner = useOwnerStore();

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [isLoadingStores, setIsLoadingStores] = useState(false);
  const [storesError, setStoresError] = useState<string | null>(null);

  // Prefer role-derived merchantId; fall back to whatever is persisted for
  // store-login sessions so we still surface the correct list post-refresh.
  const effectiveMerchantId = merchantId || readActiveStoreDataMerchantId();

  const refreshStores = useCallback(async () => {
    if (!isAuthenticated || !owner.isOwner || !effectiveMerchantId) {
      setStores([]);
      return;
    }
    setIsLoadingStores(true);
    setStoresError(null);
    try {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name, address, business_type, merchant_id')
        .eq('merchant_id', effectiveMerchantId)
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      setStores((data as StoreRow[]) || []);
    } catch (e: any) {
      setStoresError(e?.message || 'Failed to load stores');
      setStores([]);
    } finally {
      setIsLoadingStores(false);
    }
  }, [isAuthenticated, owner.isOwner, effectiveMerchantId]);

  useEffect(() => { void refreshStores(); }, [refreshStores]);

  // Re-broadcast the legacy event under the Phase 2B name so both channels
  // stay in sync without changing any existing listener.
  useEffect(() => {
    const bridge = () => window.dispatchEvent(new CustomEvent('pos:store-changed'));
    window.addEventListener('pos:active-store-changed', bridge);
    return () => window.removeEventListener('pos:active-store-changed', bridge);
  }, []);

  const selectStore = useCallback((store: SelectedStore | null) => {
    owner.selectStore(store);
    // useOwnerStore already dispatches `pos:active-store-changed`; the bridge
    // effect above forwards it as `pos:store-changed`.
  }, [owner]);

  const clearStore = useCallback(() => {
    owner.clearStoreSelection();
    window.dispatchEvent(new CustomEvent('pos:active-store-changed'));
  }, [owner]);

  const value = useMemo<StoreContextValue>(() => ({
    activeStore: owner.selectedStore,
    activeStoreId: owner.selectedStoreId,
    activeStoreName: owner.selectedStoreName,
    stores,
    isLoadingStores,
    storesError,
    shouldShowStoreSelection: owner.shouldShowStoreSelection,
    isOwner: owner.isOwner,
    selectStore,
    clearStore,
    dismissStoreSelection: owner.dismissStoreSelection,
    refreshStores,
  }), [
    owner.selectedStore,
    owner.selectedStoreId,
    owner.selectedStoreName,
    owner.shouldShowStoreSelection,
    owner.isOwner,
    owner.dismissStoreSelection,
    stores,
    isLoadingStores,
    storesError,
    selectStore,
    clearStore,
    refreshStores,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within a StoreProvider');
  return ctx;
}

export function useStoreSafe(): StoreContextValue | null {
  return useContext(StoreContext) ?? null;
}
