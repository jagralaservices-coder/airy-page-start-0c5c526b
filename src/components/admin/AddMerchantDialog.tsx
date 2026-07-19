import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { ADDONS_PRICING } from '@/lib/subscriptionConfig';

interface Props {
  children: React.ReactNode;
  onCreated?: () => void;
}

export default function AddMerchantDialog({ children, onCreated }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'form' | 'addons' | 'success'>('form');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const { toast } = useToast();
  const { isSuperAdmin } = useSupabaseAuth();

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    businessName: '',
    businessType: 'retail',
    phone: '',
    password: '',
    plan: 'basic',
  });

  const reset = () => {
    setFormData({ fullName: '', email: '', businessName: '', businessType: 'retail', phone: '', password: '', plan: 'basic' });
    setSelectedAddons([]);
    setStep('form');
  };

  const handleFinalize = async () => {
    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-merchant', {
        body: {
          fullName: formData.fullName,
          email: formData.email,
          businessName: formData.businessName,
          businessType: formData.businessType,
          phone: formData.phone,
          password: formData.password,
          plan: formData.plan,
          addons: selectedAddons,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setStep('success');
      toast({ title: 'Success', description: 'Merchant account created!' });
      onCreated?.();

      setTimeout(() => {
        setIsOpen(false);
        reset();
      }, 1500);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({ title: 'Creation Failed', description: msg, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email || !formData.businessName || !formData.phone || !formData.password) {
      toast({ title: 'Validation Error', description: 'Please fill all required fields.', variant: 'destructive' });
      return;
    }

    if (formData.plan === 'custom') {
      setStep('addons');
      return;
    }

    await handleFinalize();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) reset(); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Merchant</DialogTitle>
          <DialogDescription>Create a new merchant/owner account.</DialogDescription>
        </DialogHeader>

        {step === 'form' && (
          <form onSubmit={handleCreate} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input required value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Business Name *</Label>
                <Input required value={formData.businessName} onChange={e => setFormData({ ...formData, businessName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Business Type *</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.businessType} onChange={e => setFormData({ ...formData, businessType: e.target.value })}>
                  <option value="retail">Retail</option>
                  <option value="restaurant">Restaurant</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Mobile Number *</Label>
                <Input type="tel" pattern="[6-9][0-9]{9}" required value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="9876543210" />
              </div>
              <div className="space-y-2">
                <Label>Temporary Password *</Label>
                <Input type="password" required minLength={6} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Subscription Plan *</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.plan} onChange={e => setFormData({ ...formData, plan: e.target.value })}>
                  <option value="basic">Basic</option>
                  <option value="gold">Gold</option>
                  <option value="platinum">Platinum</option>
                  <option value="custom">Customize Plan</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isCreating}>
                {formData.plan === 'custom' ? 'Select Add-ons' : (isCreating ? 'Creating...' : 'Create Merchant')}
              </Button>
            </div>
          </form>
        )}

        {step === 'addons' && (
          <div className="space-y-4 py-4">
            <div className="text-center mb-4">
              <h3 className="text-lg font-bold">Customize Your Plan</h3>
              <p className="text-sm text-muted-foreground">Select Add-ons (Minimum ₹10,000 required)</p>
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {Object.entries(ADDONS_PRICING).map(([addon, price]) => {
                const isSelected = selectedAddons.includes(addon);
                return (
                  <button key={addon} type="button" onClick={() => {
                    setSelectedAddons(prev => isSelected ? prev.filter(a => a !== addon) : [...prev, addon])
                  }} className={`w-full p-3 rounded-lg border-2 text-left transition-all flex items-center justify-between ${isSelected ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <span className="font-medium text-sm">{addon}</span>
                    <span className="text-primary font-bold">₹{price.toLocaleString('en-IN')}</span>
                  </button>
                )
              })}
            </div>
            <div className="pt-4 border-t border-border">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm">Selected Value:</span>
                <span className="font-bold">₹{selectedAddons.reduce((sum, a) => sum + ADDONS_PRICING[a], 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm">Remaining Required:</span>
                <span className="font-bold text-destructive">
                  {Math.max(0, 10000 - selectedAddons.reduce((sum, a) => sum + ADDONS_PRICING[a], 0)) > 0 ? `₹${Math.max(0, 10000 - selectedAddons.reduce((sum, a) => sum + ADDONS_PRICING[a], 0)).toLocaleString('en-IN')}` : '₹0'}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('form')} className="w-1/3">Back</Button>
                <Button 
                  onClick={handleFinalize} 
                  disabled={isCreating || selectedAddons.reduce((sum, a) => sum + ADDONS_PRICING[a], 0) < 10000} 
                  className="w-2/3"
                >
                  {isCreating ? 'Creating...' : 'Finalize Creation'}
                </Button>
              </div>
              {selectedAddons.reduce((sum, a) => sum + ADDONS_PRICING[a], 0) < 10000 && (
                <p className="text-xs text-destructive text-center mt-2">Please select add-ons worth at least ₹10,000 to continue.</p>
              )}
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="py-8 text-center text-green-600">
            <h3 className="text-xl font-bold mb-2">Merchant Created!</h3>
            <p className="text-sm text-gray-500">Account set up with the {formData.plan} plan.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
