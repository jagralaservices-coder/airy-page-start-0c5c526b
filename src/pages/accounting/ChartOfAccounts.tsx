import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { ensureCoaSeeded } from '@/lib/accounting/postingEngine';
import { toast } from 'sonner';
import { Plus, Search } from 'lucide-react';

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
  subtype: string | null;
  is_system: boolean;
  is_active: boolean;
  opening_balance: number;
}

const TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;

export default function ChartOfAccounts() {
  const { merchantId } = useAccountingContext();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ code: string; name: string; account_type: typeof TYPES[number]; subtype: string; opening_balance: string }>({
    code: '', name: '', account_type: 'asset', subtype: '', opening_balance: '0',
  });

  const load = React.useCallback(async () => {
    if (!merchantId) return;
    setBusy(true);
    await ensureCoaSeeded(merchantId);
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, code, name, account_type, subtype, is_system, is_active, opening_balance')
      .eq('merchant_id', merchantId)
      .order('code');
    setAccounts((data ?? []) as any);
    setBusy(false);
  }, [merchantId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      if (typeFilter !== 'all' && a.account_type !== typeFilter) return false;
      if (q) {
        const s = q.toLowerCase();
        return a.code.toLowerCase().includes(s) || a.name.toLowerCase().includes(s);
      }
      return true;
    });
  }, [accounts, q, typeFilter]);

  const create = async () => {
    if (!merchantId) return;
    if (!form.code || !form.name) return toast.error('Code and Name are required');
    const { error } = await supabase.from('chart_of_accounts').insert({
      merchant_id: merchantId,
      code: form.code.trim(),
      name: form.name.trim(),
      account_type: form.account_type,
      subtype: form.subtype.trim() || null,
      opening_balance: Number(form.opening_balance) || 0,
      is_system: false,
    });
    if (error) return toast.error(error.message);
    toast.success('Account created');
    setOpen(false);
    setForm({ code: '', name: '', account_type: 'asset', subtype: '', opening_balance: '0' });
    load();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">{accounts.length} accounts</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />New Account</Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input placeholder="Search code or name" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 w-72" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Accounts</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-2 pl-4">Code</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Subtype</th>
                  <th className="p-2 text-right pr-4">Opening</th>
                  <th className="p-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-t hover:bg-accent/30">
                    <td className="p-2 pl-4 font-mono text-xs">{a.code}</td>
                    <td className="p-2">{a.name}</td>
                    <td className="p-2 capitalize">{a.account_type}</td>
                    <td className="p-2 text-muted-foreground">{a.subtype || '—'}</td>
                    <td className="p-2 text-right pr-4 font-mono">₹{Number(a.opening_balance || 0).toLocaleString('en-IN')}</td>
                    <td className="p-2 space-x-1">
                      {a.is_system && <Badge variant="secondary" className="text-[10px]">System</Badge>}
                      {!a.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                    </td>
                  </tr>
                ))}
                {!busy && filtered.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No accounts</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Account</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div>
              <Label>Type *</Label>
              <Select value={form.account_type} onValueChange={(v) => setForm({ ...form, account_type: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Subtype</Label><Input value={form.subtype} onChange={(e) => setForm({ ...form, subtype: e.target.value })} /></div>
            <div><Label>Opening Balance</Label><Input type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
