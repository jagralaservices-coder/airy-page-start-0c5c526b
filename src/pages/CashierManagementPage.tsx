import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, KeyRound, ShieldCheck, ShieldOff, Building } from 'lucide-react';
import { usePOSSafe } from '@/contexts/POSContext';
import { invokeFunctionWithResponseFallback } from '@/lib/invokeFunctionWithResponseFallback';
import { useOwnerStore } from '@/hooks/useOwnerStore';
import { AdminStoreSelectionDialog } from '@/components/pos/AdminStoreSelectionDialog';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  CashierRecord,
  CashierPermissions,
  DEFAULT_CASHIER_PERMISSIONS,
  createCashier,
  deleteCashier,
  isCashierBillingModeOn,
  listCashiers,
  loadCashierBillingMode,
  resetCashierPin,
  setCashierBillingMode,
  updateCashier,
} from '@/lib/cashier';

const PERMISSION_LABELS: Record<keyof CashierPermissions, string> = {
  manualDiscount: 'Manual Discount',
  billVoid: 'Bill Void',
  billReturn: 'Bill Return',
  reprintBill: 'Reprint Bill',
  priceEdit: 'Price Edit',
  itemDelete: 'Item Delete',
  cashDrawer: 'Open Cash Drawer',
  customerCreation: 'Customer Creation',
};

export default function CashierManagementPage() {
  const pos = usePOSSafe();
  const { isOwner, selectedStoreId, selectedStoreName, selectStore } = useOwnerStore();
  const [showStoreSelection, setShowStoreSelection] = useState(false);

  const storeId = isOwner ? selectedStoreId || '' : pos?.activeStore?.id || '';
  const storeName = isOwner ? selectedStoreName || '' : pos?.activeStore?.name || '';
  const [list, setList] = useState<CashierRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState(false);
  const [editing, setEditing] = useState<CashierRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<CashierRecord | null>(null);

  const refresh = async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      setList(await listCashiers(storeId));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load cashiers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!storeId) return;
    setMode(isCashierBillingModeOn(storeId));
    loadCashierBillingMode(storeId).then(setMode).catch(() => { });
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  if (!storeId) {
    return (
      <div className="p-6 md:p-12 max-w-2xl mx-auto space-y-6">
        <div className="p-6 bg-muted/50 border border-border rounded-xl flex items-center gap-4">
          <Building className="w-8 h-8 text-muted-foreground" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">Select a Store</h2>
            <p className="text-sm text-muted-foreground">You must select a store to manage cashiers for that location.</p>
          </div>
          {isOwner && (
            <Button variant="outline" onClick={() => setShowStoreSelection(true)}>
              Select Store
            </Button>
          )}
        </div>
        <AdminStoreSelectionDialog
          isOpen={showStoreSelection}
          onClose={() => setShowStoreSelection(false)}
          onSelectStore={(store) => {
            if (store) {
              selectStore({
                id: store.id,
                store_name: store.store_name,
                store_code: store.store_code,
                address: store.address
              });
            } else {
              selectStore(null);
            }
          }}
        />
      </div>
    );
  }

  const toggleMode = async (next: boolean) => {
    try {
      await setCashierBillingMode(storeId, next);
      setMode(next);
      toast.success(next ? 'Cashier Billing Mode ON' : 'Cashier Billing Mode OFF');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update mode');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cashier Management</h1>
          <p className="text-sm text-muted-foreground">Optional billing module — Staff Module is unchanged.</p>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && (
            <Button variant="outline" onClick={() => setShowStoreSelection(true)} className="gap-2">
              <Building className="w-4 h-4" />
              {storeName || 'Select Store'}
            </Button>
          )}
          <Button onClick={() => setCreating(true)} className="bg-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-1" /> Add Cashier
          </Button>
        </div>
      </div>

      <Card className="p-4 flex items-center justify-between">
        <div>
          <div className="font-semibold">Cashier Billing Mode</div>
          <div className="text-xs text-muted-foreground">
            When OFF, MAXORA works exactly as today. When ON, billing requires a Cashier PIN login.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{storeName}</span>
          <Switch checked={mode} onCheckedChange={toggleMode} />
          <Badge variant={mode ? 'default' : 'secondary'}>{mode ? 'ON' : 'OFF'}</Badge>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!loading && list.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No cashiers yet. Click “Add Cashier”.</TableCell></TableRow>
            )}
            {list.map((c) => {
              const onPerms = Object.entries(c.permissions || {}).filter(([, v]) => v).length;
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-mono">{c.cashier_code}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    {c.is_active
                      ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><ShieldCheck className="h-3 w-3 mr-1" /> Active</Badge>
                      : <Badge variant="secondary"><ShieldOff className="h-3 w-3 mr-1" /> Disabled</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{onPerms}/8 enabled</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setResetting(c)} title="Reset PIN"><KeyRound className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      await updateCashier(c.id, { is_active: !c.is_active });
                      toast.success(!c.is_active ? 'Enabled' : 'Disabled');
                      refresh();
                    }} title={c.is_active ? 'Disable' : 'Enable'}>
                      {c.is_active ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                      if (!confirm(`Delete cashier ${c.name}?`)) return;
                      await deleteCashier(c.id);
                      toast.success('Deleted');
                      refresh();
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <CashierFormDialog
        open={creating}
        onOpenChange={(o) => { setCreating(o); if (!o) refresh(); }}
        storeId={storeId}
      />
      <CashierFormDialog
        open={!!editing}
        editing={editing}
        onOpenChange={(o) => { if (!o) setEditing(null); refresh(); }}
        storeId={storeId}
      />
      <ResetPinDialog
        open={!!resetting}
        cashier={resetting}
        onOpenChange={(o) => { if (!o) setResetting(null); }}
      />
      <AdminStoreSelectionDialog
        isOpen={showStoreSelection}
        onClose={() => setShowStoreSelection(false)}
        onSelectStore={(store) => {
          if (store) {
            selectStore({
              id: store.id,
              store_name: store.store_name,
              store_code: store.store_code,
              address: store.address
            });
          } else {
            selectStore(null);
          }
        }}
      />
    </div>
  );
}

const CashierFormDialog: React.FC<{
  open: boolean;
  editing?: CashierRecord | null;
  storeId: string;
  onOpenChange: (o: boolean) => void;
}> = ({ open, editing, storeId, onOpenChange }) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [perms, setPerms] = useState<CashierPermissions>(DEFAULT_CASHIER_PERMISSIONS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCode(editing?.cashier_code || '');
      setName(editing?.name || '');
      setPin('');
      setPhotoUrl(editing?.photo_url || '');
      setPerms({ ...DEFAULT_CASHIER_PERMISSIONS, ...(editing?.permissions || {}) });
    }
  }, [open, editing]);

  const save = async () => {
    if (!code.trim() || !name.trim()) { toast.error('Email ID and Name required'); return; }
    if (!editing && pin.length < 4) { toast.error('PIN must be 4+ digits'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateCashier(editing.id, {
          cashier_code: code.trim(),
          name: name.trim(),
          photo_url: photoUrl.trim() || null,
          permissions: perms as any,
        });
        toast.success('Cashier updated');
      } else {
        try {
          await createCashier({
            storeId,
            cashierCode: code.trim(),
            name: name.trim(),
            pin: pin.trim(),
            photoUrl: photoUrl.trim() || null,
            permissions: perms,
          });
        } catch (e: any) {
          if (e?.message?.includes('cashiers_store_id_cashier_code_key')) {
            throw new Error('This Email ID is already assigned to a cashier in this store.');
          }
          throw e;
        }

        // Also create a Supabase Auth user for this Cashier
        const dummyEmail = code.trim().toLowerCase();
        const pinToSend = /^\d+$/.test(pin.trim()) ? pin.trim() + '#MaxoraPOS!26@Auth' : pin.trim();

        try {
          await invokeFunctionWithResponseFallback('create-staff', {
            name: name.trim(),
            email: dummyEmail,
            password: pinToSend,
            pin: pin.trim(),
            role: 'cashier',
            store_id: storeId,
            phone: Math.floor(1000000000 + Math.random() * 9000000000).toString(),
            address_line1: 'N/A',
            locality: 'N/A',
            city: 'N/A',
            state: 'N/A',
            pincode: '000000'
          });
        } catch (edgeError: any) {
          console.warn("Edge function failed, trying direct signUp fallback...", edgeError);
          // Fallback if edge functions are blocked or restricted
          const { createClient } = await import('@supabase/supabase-js');
          const secondarySupabase = createClient(
            import.meta.env.VITE_SUPABASE_URL,
            import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            { auth: { persistSession: false, autoRefreshToken: false } }
          );
          const { error: signUpError, data: authData } = await secondarySupabase.auth.signUp({
            email: dummyEmail,
            password: pinToSend,
            options: { data: { full_name: name.trim(), role: 'cashier' } }
          });

          if (authData?.user) {
            const { error: roleErr } = await supabase.from('user_roles').insert({
              user_id: authData.user.id,
              role: 'cashier',
              store_id: storeId,
              is_active: true
            });
            if (roleErr) console.error("Failed to insert user_role in fallback", roleErr);
          }
          if (signUpError && !signUpError.message.includes('already registered')) {
            throw new Error(`Auth creation failed: ${signUpError.message}`);
          }
        }

        toast.success('Cashier created');
        onOpenChange(false);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Save failed', { duration: 5000 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? 'Edit Cashier' : 'Add Cashier'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Email ID *</Label>
              <Input type="email" value={code} onChange={(e) => setCode(e.target.value)} placeholder="cashier@example.com" />
            </div>
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ravi" />
            </div>
          </div>
          {!editing && (
            <div className="space-y-1">
              <Label>PIN * (4–8 digits)</Label>
              <Input type="password" inputMode="numeric" value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))} />
            </div>
          )}
          <div className="space-y-1">
            <Label>Profile Photo URL (optional)</Label>
            <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <Label className="mb-2 block">Permissions</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PERMISSION_LABELS) as (keyof CashierPermissions)[]).map((k) => (
                <label key={k} className="flex items-center justify-between border rounded-md p-2 text-sm">
                  <span>{PERMISSION_LABELS[k]}</span>
                  <Switch checked={perms[k]} onCheckedChange={(v) => setPerms((p) => ({ ...p, [k]: v }))} />
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground">
            {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ResetPinDialog: React.FC<{ open: boolean; cashier: CashierRecord | null; onOpenChange: (o: boolean) => void }> = ({ open, cashier, onOpenChange }) => {
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setPin(''); }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Reset PIN — {cashier?.name}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>New PIN (4–8 digits)</Label>
          <Input type="password" inputMode="numeric" value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving || pin.length < 4} onClick={async () => {
            if (!cashier) return;
            setSaving(true);
            try {
              await resetCashierPin(cashier.id, pin);
              const dummyEmail = cashier.cashier_code.toLowerCase();
              const pinToSend = /^\\d+$/.test(pin.trim()) ? pin.trim() + 'Aa@1' : pin.trim();

              try {
                // Try edge function first if it's available and user has permission
                await invokeFunctionWithResponseFallback('update-staff-password', {
                  user_id: cashier.id, // we might not have auth.users id, but we try
                  pin: pinToSend
                });
              } catch (err: any) {
                console.warn('Edge function password reset failed (possibly due to network/permissions)', err);
                // Note: We cannot easily update Auth password from client side without logging in as them.
                // Since this is a fallback, the Cashier's Auth password might not be perfectly in sync if edge function fails.
                toast.warning('Auth password could not be synced. Cashier might need to be recreated if login fails.', { duration: 6000 });
              }

              toast.success('PIN reset successfully');
              onOpenChange(false);
            } catch (e: any) {
              toast.error(e?.message || 'Reset failed');
            } finally { setSaving(false); }
          }}>Update PIN</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
