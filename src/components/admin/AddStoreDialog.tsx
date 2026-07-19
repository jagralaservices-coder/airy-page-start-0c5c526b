import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getTierLimits, type SubscriptionTier, type BusinessType } from '@/lib/subscriptionConfig';

interface Props {
  children: React.ReactNode;
  onCreated?: () => void;
}

type MerchantOption = {
  id: string;
  business_name: string;
  owner_email: string;
  plan: SubscriptionTier;
  business_type: BusinessType;
  outlet_limit: number;
  extra_outlets: number;
  active_stores: number;
};

export default function AddStoreDialog({ children, onCreated }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [isCreating, setIsCreating] = useState(false);
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    merchant_id: '',
    store_name: '',
    email: '',
    password: '',
    phone: '',
    address: '',
    business_type: 'restaurant',
    country: 'India',
    currency_code: 'INR',
    tax_type: 'GST',
    tax_percentage: 0,
  });

  const reset = () => {
    setFormData({
      merchant_id: '', store_name: '', email: '', password: '', phone: '', address: '',
      business_type: 'restaurant', country: 'India', currency_code: 'INR', tax_type: 'GST', tax_percentage: 0,
    });
    setStep('form');
  };

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      // Primary source: `merchants` table (managed from Merchant Management).
      // Fallback to legacy `customers` rows only for IDs that still exist in `merchants`.
      const { data: mRows } = await supabase
        .from('merchants')
        .select('id, business_name, owner_email, subscription_plan, business_type, is_active, approval_status')
        .eq('is_active', true)
        .eq('approval_status', 'approved')
        .order('business_name');
      const merchantRows = (mRows || []) as any[];
      if (merchantRows.length === 0) { setMerchants([]); return; }

      // Enrich with legacy customers fields (max_stores, enabled_addons) where IDs match.
      const mIds = merchantRows.map(m => m.id);
      const { data: cRows } = await supabase
        .from('customers')
        .select('id, business_name, owner_email, subscription_plan, business_type, max_stores, enabled_addons')
        .in('id', mIds);
      const cMap = new Map<string, any>((cRows || []).map((c: any) => [c.id, c]));
      const list = merchantRows.map(m => {
        const c = cMap.get(m.id) || {};
        return {
          id: m.id,
          business_name: m.business_name || c.business_name || m.owner_email,
          owner_email: m.owner_email || c.owner_email,
          subscription_plan: m.subscription_plan || c.subscription_plan || 'basic',
          business_type: m.business_type || c.business_type || 'restaurant',
          max_stores: c.max_stores || 0,
          enabled_addons: c.enabled_addons || [],
        };
      });

      // Fetch extra outlets (addon-based) from merchant_subscription
      const { data: subRows } = await supabase
        .from('merchant_subscription')
        .select('merchant_id, extra_outlets')
        .in('merchant_id', mIds);
      const extraMap = new Map<string, number>((subRows || []).map((s: any) => [s.merchant_id, s.extra_outlets || 0]));

      const { data: storeRows } = await supabase
        .from('stores')
        .select('id, customer_id, merchant_id')
        .or(`customer_id.in.(${mIds.join(',')}),merchant_id.in.(${mIds.join(',')})`)
        .eq('is_active', true);

      const countMap = new Map<string, number>();
      (storeRows || []).forEach((r: any) => {
        const key = r.customer_id || r.merchant_id;
        if (key) countMap.set(key, (countMap.get(key) || 0) + 1);
      });

      setMerchants(list.map((m): MerchantOption => {
        const plan = (m.subscription_plan || 'basic') as SubscriptionTier;
        const bizType = (m.business_type === 'retail' ? 'retail' : 'restaurant') as BusinessType;
        const tierLimits = getTierLimits(plan, bizType);
        // Plan is the source of truth — ignore legacy customers.max_stores.
        const baseOutlets = tierLimits?.maxOutlets || 1;
        return {
          id: m.id,
          business_name: m.business_name || m.owner_email || 'Unnamed',
          owner_email: m.owner_email || '',
          plan,
          business_type: bizType,
          outlet_limit: baseOutlets,
          extra_outlets: extraMap.get(m.id) || 0,
          active_stores: countMap.get(m.id) || 0,
        };
      }));
    })();
  }, [isOpen]);

  const selectedMerchant = merchants.find(m => m.id === formData.merchant_id);
  const allowedOutlets = selectedMerchant ? ((selectedMerchant.outlet_limit || 1) + (selectedMerchant.extra_outlets || 0)) : 0;
  const atLimit = selectedMerchant ? (selectedMerchant.active_stores || 0) >= allowedOutlets : false;

  // Auto-sync business_type from the selected merchant so the store inherits its plan/biz type.
  useEffect(() => {
    if (selectedMerchant && formData.business_type !== selectedMerchant.business_type) {
      setFormData((f) => ({ ...f, business_type: selectedMerchant.business_type }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMerchant?.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.merchant_id || !formData.store_name || !formData.email || !formData.password) {
      toast({ title: 'Validation Error', description: 'Merchant, store name, email and password are required.', variant: 'destructive' });
      return;
    }
    if (formData.password.length < 6) {
      toast({ title: 'Validation Error', description: 'Password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    if (atLimit) {
      toast({
        title: 'Outlet limit reached',
        description: `${selectedMerchant?.business_name} is on the ${selectedMerchant?.plan} plan (${allowedOutlets} outlet${allowedOutlets === 1 ? '' : 's'}). Upgrade the plan or add an outlet add-on.`,
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-store', {
        body: {
          merchant_id: formData.merchant_id,
          store_name: formData.store_name,
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
          phone: formData.phone || null,
          address: formData.address || null,
          business_type: formData.business_type,
          country: formData.country,
          currency_code: formData.currency_code,
          tax_type: formData.tax_type,
          tax_percentage: Number(formData.tax_percentage) || 0,
        },
      });
      
      if (error) {
        let actualErrorMessage = error.message;
        try {
          // If it's a FunctionsHttpError, the body might be in error.context
          if ((error as any).context) {
            const errBody = await (error as any).context.json();
            if (errBody && errBody.error) actualErrorMessage = errBody.error;
          }
        } catch (e) {
          // fallback
        }
        throw new Error(actualErrorMessage);
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      setStep('success');
      toast({ title: 'Success', description: 'Store created. Owner can log in with the email & password.' });
      onCreated?.();
      setTimeout(() => { setIsOpen(false); reset(); }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: 'Creation Failed', description: msg, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) reset(); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[520px] max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Store</DialogTitle>
          <DialogDescription>Create a store/outlet with its own login. Outlet count is enforced by the merchant's plan.</DialogDescription>
        </DialogHeader>

        {step === 'form' && (
          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Merchant *</Label>
              <select
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.merchant_id}
                onChange={e => setFormData({ ...formData, merchant_id: e.target.value })}
              >
                <option value="">Select merchant...</option>
                {merchants.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.business_name} — {m.plan} ({m.active_stores}/{(m.outlet_limit || 1) + (m.extra_outlets || 0)})
                  </option>
                ))}
              </select>
              {selectedMerchant && (
                <p className={`text-xs ${atLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
                  Plan: <b>{selectedMerchant.plan}</b> · Outlets used: {selectedMerchant.active_stores}/{allowedOutlets}
                  {atLimit && ' · Limit reached. Upgrade plan or buy an outlet add-on.'}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Store Name *</Label>
                <Input required value={formData.store_name} onChange={e => setFormData({ ...formData, store_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Business Type *</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.business_type}
                  onChange={e => setFormData({ ...formData, business_type: e.target.value })}
                >
                  <option value="restaurant">Restaurant</option>
                  <option value="retail">Retail</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Login Email *</Label>
                <Input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="store@example.com" autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label>Password *</Label>
                <Input type="password" required minLength={6} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="min 6 chars" autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="9876543210" />
              </div>
              <div className="space-y-2">
                <Label>Tax %</Label>
                <Input type="number" min={0} step="0.01" value={formData.tax_percentage} onChange={e => setFormData({ ...formData, tax_percentage: Number(e.target.value) })} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Address</Label>
                <Input value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isCreating || atLimit}>
                {isCreating ? 'Creating…' : 'Create Store'}
              </Button>
            </div>
          </form>
        )}

        {step === 'success' && (
          <div className="py-8 text-center text-green-600">
            <h3 className="text-xl font-bold mb-2">Store Created!</h3>
            <p className="text-sm text-muted-foreground">Owner can sign in immediately with the email & password.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
