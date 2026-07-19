import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Store, Building, Check, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MerchantItem {
  id: string;
  business_name: string;
}

interface StoreItem {
  id: string;
  store_name: string;
  store_code: string | null;
  address: string | null;
}

interface AdminStoreSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStore: (store: StoreItem | null) => void;
}

export const AdminStoreSelectionDialog: React.FC<AdminStoreSelectionDialogProps> = ({
  isOpen,
  onClose,
  onSelectStore,
}) => {
  const { userRole } = useSupabaseAuth();
  const isAdmin = userRole?.role === 'admin' || userRole?.role === 'super_admin';
  
  const [step, setStep] = useState<'merchant' | 'store'>(isAdmin ? 'merchant' : 'store');
  const [merchants, setMerchants] = useState<MerchantItem[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  const fetchMerchants = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('merchants')
        .select('id, business_name')
        .eq('is_active', true)
        .order('business_name', { ascending: true });

      if (error) {
        toast.error(`Failed to load merchants: ${error.message}`);
        return;
      }
      setMerchants(data || []);
    } catch (error) {
      console.error('Error fetching merchants:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStores = useCallback(async (merchantId?: string) => {
    setLoading(true);
    try {
      let query = supabase
        .from('stores')
        .select('id, name, address, merchant_id, customer_id, owner_id, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (merchantId) {
        query = query.or(`merchant_id.eq.${merchantId},customer_id.eq.${merchantId}`);
      }

      const { data, error } = await query;

      if (error) {
        toast.error(`Failed to load stores: ${error.message}`);
        return;
      }

      const mapped: StoreItem[] = (data || []).map((s: any) => ({
        id: s.id,
        store_name: s.name || 'Unnamed store',
        store_code: String(s.id).slice(0, 8).toUpperCase(),
        address: s.address,
      }));
      setStores(mapped);
    } catch (error) {
      console.error('Error fetching stores:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (isAdmin) {
        setStep('merchant');
        setSelectedMerchantId(null);
        setSelectedStoreId(null);
        fetchMerchants();
      } else {
        setStep('store');
        setSelectedStoreId(null);
        fetchStores();
      }
    }
  }, [isOpen, isAdmin, fetchMerchants, fetchStores]);

  const handleSelectMerchant = (merchant: MerchantItem) => {
    setSelectedMerchantId(merchant.id);
  };

  const handleContinueMerchant = () => {
    if (!selectedMerchantId) {
      toast.error('Please select an owner first');
      return;
    }
    setStep('store');
    fetchStores(selectedMerchantId);
  };

  const handleSelectStore = (store: StoreItem) => {
    setSelectedStoreId(store.id);
  };

  const handleConfirmStore = () => {
    const selectedStore = stores.find(s => s.id === selectedStoreId);
    if (selectedStore) {
      // In CashierManagementPage we might want to also save it to the global store scope
      // so it updates the whole page correctly. We can do that in the parent component.
      onSelectStore(selectedStore);
      toast.success(`Selected ${selectedStore.store_name}`);
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              {step === 'merchant' ? (
                <User className="w-5 h-5 text-primary" />
              ) : (
                <Building className="w-5 h-5 text-primary" />
              )}
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">
                {step === 'merchant' ? 'Select Owner' : 'Select Store'}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {step === 'merchant' 
                  ? 'Choose the owner/merchant first' 
                  : 'Choose which store to manage cashiers for'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4 space-y-2 max-h-[300px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : step === 'merchant' ? (
            merchants.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No owners found
              </div>
            ) : (
              merchants.map((merchant) => (
                <button
                  key={merchant.id}
                  onClick={() => handleSelectMerchant(merchant)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg border transition-all",
                    selectedMerchantId === merchant.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-foreground">{merchant.business_name}</p>
                  </div>
                  {selectedMerchantId === merchant.id && (
                    <Check className="w-5 h-5 text-primary" />
                  )}
                </button>
              ))
            )
          ) : (
            stores.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No stores found
              </div>
            ) : (
              stores.map((store) => (
                <button
                  key={store.id}
                  onClick={() => handleSelectStore(store)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg border transition-all",
                    selectedStoreId === store.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                    <Store className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-foreground">{store.store_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {store.store_code ? `Code: ${store.store_code}` : 'No code'}
                      {store.address && ` • ${store.address}`}
                    </p>
                  </div>
                  {selectedStoreId === store.id && (
                    <Check className="w-5 h-5 text-primary" />
                  )}
                </button>
              ))
            )
          )}
        </div>

        <div className="flex gap-2 pt-2">
          {step === 'store' && isAdmin && (
            <Button
              variant="outline"
              onClick={() => setStep('merchant')}
              className="flex-1"
            >
              Back
            </Button>
          )}
          {!isAdmin || step === 'merchant' ? (
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
          ) : null}
          
          {step === 'merchant' ? (
            <Button
              onClick={handleContinueMerchant}
              className="flex-1"
              disabled={!selectedMerchantId}
            >
              Continue
            </Button>
          ) : (
            <Button
              onClick={handleConfirmStore}
              className="flex-1"
              disabled={!selectedStoreId}
            >
              Confirm Store
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
