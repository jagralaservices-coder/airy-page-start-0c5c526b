import { useState, useEffect, useCallback } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';

export interface SelectedStore {
  id: string;
  store_name: string;
  store_code: string | null;
  address: string | null;
}

interface StoreLookupRow {
  id: string;
  name: string | null;
  address: string | null;
}

export const useOwnerStore = () => {
  const { userRole, isAuthenticated } = useSupabaseAuth();
  const isOwner = userRole?.role === 'owner' || userRole?.role === 'admin' || userRole?.role === 'super_admin';
  
  const [selectedStore, setSelectedStore] = useState<SelectedStore | null>(() => {
    const storeId = localStorage.getItem('owner_selected_store_id');
    const storeName = localStorage.getItem('owner_selected_store_name');
    if (storeId && storeName) {
      return {
        id: storeId,
        store_name: storeName,
        store_code: null,
        address: null
      };
    }
    return null;
  });

  const [shouldShowStoreSelection, setShouldShowStoreSelection] = useState(false);

  const clearStoredSelection = useCallback(() => {
    localStorage.removeItem('owner_selected_store_id');
    localStorage.removeItem('owner_selected_store_name');
    localStorage.removeItem('owner_store_selection_done');
    localStorage.removeItem('pos_active_store');
    localStorage.removeItem('pos_active_store_data');
    localStorage.removeItem('pos_is_store_login');
    localStorage.removeItem('pos_store_code');
    setSelectedStore(null);
  }, []);

  const readActiveStoreId = useCallback((): string | null => {
    const ownerSelected = localStorage.getItem('owner_selected_store_id');
    if (ownerSelected) return ownerSelected;

    const activeStore = localStorage.getItem('pos_active_store');
    if (activeStore) {
      try {
        const parsed = JSON.parse(activeStore);
        if (typeof parsed === 'string') return parsed;
      } catch {
        return activeStore;
      }
    }

    try {
      const storeLoginData = localStorage.getItem('pos_active_store_data');
      if (storeLoginData) {
        const parsed = JSON.parse(storeLoginData);
        return parsed?.id || parsed?.storeId || null;
      }
    } catch {
      // Ignore malformed cached store data and fall back to prompting.
    }

    return null;
  }, []);

  // Check if owner needs to select store on first login
  useEffect(() => {
    let cancelled = false;

    const validateStoreSelection = async () => {
      if (!isOwner || !isAuthenticated) return;

      const hasSelectedStore = localStorage.getItem('owner_store_selection_done');
      const existingStoreId = readActiveStoreId();
      const storeLoginData = localStorage.getItem('pos_active_store_data');

      if (existingStoreId) {
        const { data, error } = await supabase
          .from('stores')
          .select('id, name, address')
          .eq('id', existingStoreId)
          .eq('is_active', true)
          .maybeSingle();

        if (cancelled) return;

        if (error || !data) {
          clearStoredSelection();
          setShouldShowStoreSelection(true);
          return;
        }

        const storeRow = data as StoreLookupRow;
        const storeName = storeRow.name || 'Selected store';

        localStorage.setItem('owner_store_selection_done', 'true');
        if (!localStorage.getItem('owner_selected_store_id') && !storeLoginData) {
          localStorage.setItem('owner_selected_store_id', storeRow.id);
          localStorage.setItem('owner_selected_store_name', storeName);
        }
        setSelectedStore({
          id: storeRow.id,
          store_name: storeName,
          store_code: storeRow.id.slice(0, 8).toUpperCase(),
          address: storeRow.address || null,
        });
        return;
      }

      if (!hasSelectedStore && !storeLoginData) {
        setShouldShowStoreSelection(true);
      }
    };

    validateStoreSelection();

    return () => {
      cancelled = true;
    };
  }, [isOwner, isAuthenticated, readActiveStoreId, clearStoredSelection]);

  useEffect(() => {
    const refreshSelectedStore = () => {
      const storeId = localStorage.getItem('owner_selected_store_id');
      const storeName = localStorage.getItem('owner_selected_store_name');
      if (storeId && storeName) {
        setSelectedStore({ id: storeId, store_name: storeName, store_code: null, address: null });
      } else {
        setSelectedStore(null);
      }
    };

    window.addEventListener('pos:active-store-changed', refreshSelectedStore);
    return () => window.removeEventListener('pos:active-store-changed', refreshSelectedStore);
  }, []);

  // Backwards compatibility for first-login prompt when no store has ever been selected.
  useEffect(() => {
    if (isOwner && isAuthenticated) {
      const hasSelectedStore = localStorage.getItem('owner_store_selection_done');
      const existingStoreId = readActiveStoreId();
      const storeLoginData = localStorage.getItem('pos_active_store_data');
      // Skip dialog if a store is already selected/active (e.g. store-code login)
      if (!hasSelectedStore && !existingStoreId && !storeLoginData) {
        setShouldShowStoreSelection(true);
      }
    }
  }, [isOwner, isAuthenticated, readActiveStoreId]);

  const selectStore = useCallback((store: SelectedStore | null) => {
    if (store) {
      localStorage.setItem('owner_selected_store_id', store.id);
      localStorage.setItem('owner_selected_store_name', store.store_name);
      localStorage.setItem('pos_active_store', JSON.stringify(store.id));
      localStorage.removeItem('pos_active_store_data');
      localStorage.removeItem('pos_is_store_login');
      localStorage.removeItem('pos_store_code');
      setSelectedStore(store);
    } else {
      clearStoredSelection();
      setSelectedStore(null);
    }
    localStorage.setItem('owner_store_selection_done', 'true');
    setShouldShowStoreSelection(false);
    window.dispatchEvent(new CustomEvent('pos:active-store-changed'));
  }, [clearStoredSelection]);

  const getSelectedStoreId = useCallback((): string | null => {
    return selectedStore?.id || null;
  }, [selectedStore]);

  const getSelectedStoreName = useCallback((): string => {
    return selectedStore?.store_name || 'All Stores';
  }, [selectedStore]);

  const clearStoreSelection = useCallback(() => {
    clearStoredSelection();
  }, [clearStoredSelection]);

  const dismissStoreSelection = useCallback(() => {
    localStorage.setItem('owner_store_selection_done', 'true');
    setShouldShowStoreSelection(false);
  }, []);

  return {
    selectedStore,
    selectedStoreId: selectedStore?.id || null,
    selectedStoreName: selectedStore?.store_name || 'All Stores',
    shouldShowStoreSelection,
    isOwner,
    selectStore,
    getSelectedStoreId,
    getSelectedStoreName,
    clearStoreSelection,
    dismissStoreSelection
  };
};
