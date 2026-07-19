import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { exportCSV, inr } from '@/lib/accounting/exportUtils';
import { Plus, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Budget {
  id: string; fiscal_year: number; period_month: number | null;
  account_id: string | null; cost_center_id: string | null; store_id: string | null;
  budget_amount: number; alert_threshold_pct: number | null; notes: string | null;
  account_name?: string; center_name?: string;
}

export default function BudgetsPage() {
  const { merchantId, storeId } = useAccountingContext();
  const [rows, setRows] = useState<Budget[]>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; code: string; name: string; account_type: string }>>([]);
  const [centers, setCenters] = useState<Array<{ id: string; name: string }>>([]);
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [form, setForm] = useState({
    fiscal_year: now.getFullYear(), period_month: String(now.getMonth() + 1),
    account_id: '', cost_center_id: '', budget_amount: '', alert_threshold_pct: '80', notes: '',
  });

  const load = async () => {
    if (!merchantId) return;
    const [{ data }, { data: acc }, { data: cc }] = await Promise.all([
      supabase.from('budgets').select('*').eq('merchant_id', merchantId).order('fiscal_year', { ascending: false }),
      supabase.from('chart_of_accounts').select('id,code,name,account_type').eq('merchant_id', merchantId).in('account_type', ['income', 'expense']).eq('is_active', true).order('code'),
      supabase.from('cost_centers').select('id,name').eq('merchant_id', merchantId).eq('is_active', true).order('name'),
    ]);
    const aMap = new Map((acc ?? []).map((a: any) => [a.id, `${a.code} ${a.name}`]));
    const cMap = new Map((cc ?? []).map((c: any) => [c.id, c.name]));
    setRows((data ?? []).map((r: any) => ({ ...r, account_name: aMap.get(r.account_id) ?? '—', center_name: cMap.get(r.cost_center_id) ?? '—' })));
    setAccounts((acc ?? []) as any);
    setCenters((cc ?? []) as any);
  };

  useEffect(() => { load(); }, [merchantId]);

  const save = async () => {
    if (!merchantId || !form.budget_amount) { toast.error('Enter amount'); return; }
    const { error } = await supabase.from('budgets').insert({
      merchant_id: merchantId, store_id: storeId,
      fiscal_year: form.fiscal_year, period_month: form.period_month ? Number(form.period_month) : null,
      account_id: form.account_id || null, cost_center_id: form.cost_center_id || null,
      budget_amount: Number(form.budget_amount),
      alert_threshold_pct: Number(form.alert_threshold_pct) || 80,
      notes: form.notes || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Budget saved');
    setOpen(false);
    setForm({ ...form, budget_amount: '', notes: '' });
    load();
  };

  const remove = async (id: string) => {
    await supabase.from('budgets').delete().eq('id', id);
    load();
  };

  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.budget_amount), 0), [rows]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Budget Management</h1>
          <p className="text-sm text-muted-foreground">Monthly, quarterly and yearly budgets by account, cost center or store</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV('budgets', rows)}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New Budget</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Budget</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Fiscal Year</Label><Input type="number" value={form.fiscal_year} onChange={(e) => setForm({ ...form, fiscal_year: Number(e.target.value) })} /></div>
                  <div><Label>Period Month (1-12, blank=year)</Label><Input type="number" min={1} max={12} value={form.period_month} onChange={(e) => setForm({ ...form, period_month: e.target.value })} /></div>
                </div>
                <div><Label>Account</Label>
                  <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Cost Center</Label>
                  <Select value={form.cost_center_id} onValueChange={(v) => setForm({ ...form, cost_center_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>{centers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Budget Amount</Label><Input type="number" value={form.budget_amount} onChange={(e) => setForm({ ...form, budget_amount: e.target.value })} /></div>
                  <div><Label>Alert Threshold %</Label><Input type="number" value={form.alert_threshold_pct} onChange={(e) => setForm({ ...form, alert_threshold_pct: e.target.value })} /></div>
                </div>
                <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card><CardContent className="p-4">
        <div className="text-xs text-muted-foreground">Total Budgeted</div>
        <div className="text-2xl font-semibold font-mono text-primary">{inr(total)}</div>
      </CardContent></Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Budgets ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr>
              <th className="p-2 pl-4">FY</th><th className="p-2">Month</th>
              <th className="p-2">Account</th><th className="p-2">Cost Center</th>
              <th className="p-2 text-right">Amount</th><th className="p-2 text-right">Alert %</th>
              <th className="p-2">Notes</th><th className="p-2 pr-4"></th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No budgets set yet</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 pl-4">{r.fiscal_year}</td>
                  <td className="p-2">{r.period_month ?? 'Full year'}</td>
                  <td className="p-2 text-xs">{r.account_name}</td>
                  <td className="p-2 text-xs">{r.center_name}</td>
                  <td className="p-2 text-right font-mono">{inr(r.budget_amount)}</td>
                  <td className="p-2 text-right">{r.alert_threshold_pct}%</td>
                  <td className="p-2 text-xs">{r.notes}</td>
                  <td className="p-2 pr-4"><Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
