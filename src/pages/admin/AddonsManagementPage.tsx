import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package, Search, History, Settings, DollarSign, SwitchCamera, ToggleLeft, ToggleRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ADDONS_PRICING, PLAN_PRICING, OUTLET_PRICING, getTierLimits } from '@/lib/subscriptionConfig';
import { Switch } from '@/components/ui/switch';
import { FEATURE_CATALOG, CATEGORY_LABEL, ADDONS_DISPLAY_TO_FEATURE_KEY } from '@/lib/featureCatalog';

interface Merchant {
  id: string;
  business_name: string;
  owner_name: string;
  subscription_plan: string;
  enabled_addons: string[];
  max_stores: number;
  staff_limit: number;
  business_type: string;
}

export default function AddonsManagementPage() {
  const { user } = useSupabaseAuth();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);

  useEffect(() => {
    fetchMerchants();
  }, []);

  const fetchMerchants = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('customers')
      .select('id, business_name, owner_name, subscription_plan, enabled_addons, max_stores, staff_limit, business_type');
    if (!error && data) {
      setMerchants(data.map((m: any) => ({
        ...m,
        max_stores: m.max_stores || 1,
        staff_limit: m.staff_limit || 2,
        business_type: m.business_type || 'restaurant'
      })));
    }
    setLoading(false);
  };

  const handleUpdateLimits = async (merchantId: string, max_stores: number, staff_limit: number) => {
    const { error } = await supabase
      .from('customers')
      .update({ max_stores, staff_limit })
      .eq('id', merchantId);
    
    if (!error) {
      setMerchants(merchants.map(m => m.id === merchantId ? { ...m, max_stores, staff_limit } : m));
    }
  };

  const handleToggleAddon = async (merchantId: string, addonKey: string, currentAddons: string[]) => {
    const isEnabled = currentAddons.includes(addonKey);
    const updatedAddons = isEnabled 
      ? currentAddons.filter(a => a !== addonKey)
      : [...currentAddons, addonKey];

    const { error } = await supabase
      .from('customers')
      .update({ enabled_addons: updatedAddons })
      .eq('id', merchantId);

    if (!error) {
      setMerchants(merchants.map(m => m.id === merchantId ? { ...m, enabled_addons: updatedAddons } : m));
      // Log revenue if purchased
      if (!isEnabled) {
        await supabase.from('revenue_audit').insert({
          merchant_id: merchantId,
          merchant_name: merchants.find(m => m.id === merchantId)?.business_name,
          plan_purchased: null,
          addons_purchased: [addonKey],
          amount_added: ADDONS_PRICING[addonKey] || 0,
          created_by: user?.id
        });
      }
    }
  };

  const calculateTotalValue = (merchant: Merchant) => {
    const planTier = (merchant.subscription_plan || 'basic') as keyof typeof PLAN_PRICING;
    const planPrice = PLAN_PRICING[planTier] || 0;
    const addonsPrice = (merchant.enabled_addons || []).reduce((sum, a) => sum + (ADDONS_PRICING[a] || 0), 0);
    
    const limits = getTierLimits(planTier as any, merchant.business_type as any) || { maxOutlets: 1, maxStaff: 2 };
    
    const extraOutlets = Math.max(0, merchant.max_stores - limits.maxOutlets);
    const outletPrice = OUTLET_PRICING[planTier] || 0;
    const extraOutletsPrice = extraOutlets * outletPrice;

    const extraStaff = Math.max(0, merchant.staff_limit - limits.maxStaff);
    const extraStaffPrice = extraStaff * 1000;

    return planPrice + addonsPrice + extraOutletsPrice + extraStaffPrice;
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            Add-ons Management
          </h1>
          <p className="text-gray-500">Manage merchant add-ons and calculate revenue.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            <Input 
              placeholder="Search merchants..." 
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Enabled Add-ons</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-500">Loading...</TableCell></TableRow>
                ) : merchants.filter(m => m.business_name?.toLowerCase().includes(searchTerm.toLowerCase())).map(merchant => (
                  <TableRow key={merchant.id}>
                    <TableCell>
                      <div className="font-medium text-gray-900 dark:text-white">{merchant.business_name}</div>
                      <div className="text-sm text-gray-500">{merchant.owner_name}</div>
                    </TableCell>
                    <TableCell>
                      <span className="capitalize px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-md text-sm">
                        {merchant.subscription_plan || 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(merchant.enabled_addons || []).map((addon, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                            {addon}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ₹{calculateTotalValue(merchant).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => setSelectedMerchant(merchant)}>
                            <Settings className="w-4 h-4 mr-2" />
                            Manage Add-ons
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Manage Add-ons & Limits - {merchant.business_name}</DialogTitle>
                          </DialogHeader>

                          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg space-y-4 mb-4 border">
                            <h3 className="font-semibold text-lg">Resource Limits</h3>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Max Outlets</label>
                                <div className="flex items-center gap-2">
                                  <Input 
                                    type="number" 
                                    min="1"
                                    value={merchant.max_stores} 
                                    onChange={(e) => handleUpdateLimits(merchant.id, parseInt(e.target.value) || 1, merchant.staff_limit)}
                                  />
                                  <span className="text-xs text-gray-500 whitespace-nowrap">
                                    Base: {getTierLimits(merchant.subscription_plan as any, merchant.business_type as any)?.maxOutlets || 1}
                                  </span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Staff Limit</label>
                                <div className="flex items-center gap-2">
                                  <Input 
                                    type="number" 
                                    min="1"
                                    value={merchant.staff_limit} 
                                    onChange={(e) => handleUpdateLimits(merchant.id, merchant.max_stores, parseInt(e.target.value) || 1)}
                                  />
                                  <span className="text-xs text-gray-500 whitespace-nowrap">
                                    Base: {getTierLimits(merchant.subscription_plan as any, merchant.business_type as any)?.maxStaff || 2}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-6">
                            <h3 className="font-semibold text-lg">Manage Add-ons & Services</h3>
                            {(() => {
                              const categorizedAddons: Record<string, {name: string, price: number, label: string}[]> = {};
                              Object.keys(ADDONS_PRICING).forEach(addonName => {
                                const featureKey = ADDONS_DISPLAY_TO_FEATURE_KEY[addonName];
                                const feature = FEATURE_CATALOG.find(f => f.key === featureKey);
                                const category = feature?.category || 'other';
                                if (!categorizedAddons[category]) categorizedAddons[category] = [];
                                categorizedAddons[category].push({
                                  name: addonName,
                                  price: ADDONS_PRICING[addonName],
                                  label: addonName
                                });
                              });

                              return Object.entries(categorizedAddons).map(([category, addons]) => (
                                <div key={category} className="bg-card border rounded-xl overflow-hidden shadow-sm">
                                  <div className="bg-muted/50 px-4 py-2 border-b font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                                    {CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL] || 'Other Add-ons'}
                                  </div>
                                  <div className="divide-y">
                                    {addons.map(addon => {
                                      const isEnabled = (merchant.enabled_addons || []).includes(addon.name);
                                      return (
                                        <div key={addon.name} className="p-4 flex items-center justify-between hover:bg-muted/20 transition-colors">
                                          <div>
                                            <h4 className="font-medium text-sm text-foreground">{addon.label}</h4>
                                            <p className="text-xs text-muted-foreground mt-0.5">₹{addon.price.toLocaleString()} / year</p>
                                            <p className="text-[10px] text-muted-foreground mt-1">
                                              {isEnabled ? 'Active in sidebar' : 'Hidden from sidebar'}
                                            </p>
                                          </div>
                                          <Switch 
                                            checked={isEnabled} 
                                            onCheckedChange={() => handleToggleAddon(merchant.id, addon.name, merchant.enabled_addons || [])}
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ));
                            })()}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
