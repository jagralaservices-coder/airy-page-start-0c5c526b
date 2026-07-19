import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

interface BankAcct { id: string; bank_name: string; account_name: string; account_number: string | null; account_type: string; opening_balance: number; is_active: boolean; }

export default function BankingPage() {
  const { merchantId } = useAccountingContext();
  const [accts, setAccts] = useState<BankAcct[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ bank_name: '', account_name: '', account_number: '', ifsc_code: '', account_type: 'current', opening_balance: '0' });

  const load = React.useCallback(async () => {
    if (!merchantId) return;
    const { data } = await supabase.from('bank_accounts')
      .select('id, bank_name, account_name, account_number, account_type, opening_balance, is_active')
      .eq('merchant_id', merchantId).order('created_at', { ascending: false });
    setAccts((data ?? []) as any);
  }, [merchantId]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!merchantId) return;
    if (!form.bank_name || !form.account_name) return toast.error('Bank and account name required');
    const { error } = await supabase.from('bank_accounts').insert({
      merchant_id: merchantId,
      bank_name: form.bank_name.trim(),
      account_name: form.account_name.trim(),
      account_number: form.account_number.trim() || null,
      ifsc_code: form.ifsc_code.trim() || null,
      account_type: form.account_type,
      opening_balance: Number(form.opening_balance) || 0,
    });
    if (error) return toast.error(error.message);
    toast.success('Bank account added');
    setOpen(false);
    setForm({ bank_name: '', account_name: '', account_number: '', ifsc_code: '', account_type: 'current', opening_balance: '0' });
    load();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Banking</h1>
          <p className="text-sm text-muted-foreground">Bank accounts, deposits, withdrawals, reconciliation</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Bank Account</Button>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Bank Accounts</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-2 pl-4">Bank</th>
                <th className="p-2">Account</th>
                <th className="p-2">Number</th>
                <th className="p-2">Type</th>
                <th className="p-2 text-right pr-4">Opening</th>
              </tr>
            </thead>
            <tbody>
              {accts.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-2 pl-4">{a.bank_name}</td>
                  <td className="p-2">{a.account_name}</td>
                  <td className="p-2 font-mono text-xs">{a.account_number || '—'}</td>
                  <td className="p-2 capitalize">{a.account_type}</td>
                  <td className="p-2 text-right pr-4 font-mono">₹{Number(a.opening_balance).toLocaleString('en-IN')}</td>
                </tr>
              ))}
              {accts.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No bank accounts</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Reconciliation, statement import, and auto-matching arrive in Phase 4.</p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Bank Account</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Bank Name *</Label><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></div>
            <div><Label>Account Name *</Label><Input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} /></div>
            <div><Label>Account Number</Label><Input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></div>
            <div><Label>IFSC</Label><Input value={form.ifsc_code} onChange={(e) => setForm({ ...form, ifsc_code: e.target.value })} /></div>
            <div><Label>Opening Balance</Label><Input type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
