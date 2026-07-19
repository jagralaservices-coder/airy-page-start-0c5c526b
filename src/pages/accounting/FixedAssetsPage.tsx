import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { exportCSV, inr } from '@/lib/accounting/exportUtils';
import { Plus, Download, Printer, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = ['pos_machine', 'computer', 'printer', 'furniture', 'kitchen_equipment', 'vehicle', 'building', 'other'];

interface Asset {
  id: string; asset_code: string; name: string; category: string;
  purchase_date: string; purchase_cost: number; salvage_value: number;
  useful_life_months: number; depreciation_method: string; wdv_rate: number | null;
  accumulated_depreciation: number; status: string;
}

export default function FixedAssetsPage() {
  const { merchantId, storeId } = useAccountingContext();
  const [rows, setRows] = useState<Asset[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    asset_code: '', name: '', category: 'computer',
    purchase_date: new Date().toISOString().slice(0, 10),
    purchase_cost: '', salvage_value: '0',
    useful_life_months: '60', depreciation_method: 'straight_line', wdv_rate: '',
  });

  const load = async () => {
    if (!merchantId) return;
    const { data } = await supabase.from('fixed_assets').select('*').eq('merchant_id', merchantId).order('purchase_date', { ascending: false });
    setRows((data ?? []) as any);
  };
  useEffect(() => { load(); }, [merchantId]);

  const save = async () => {
    if (!merchantId || !form.name || !form.purchase_cost) { toast.error('Fill required fields'); return; }
    const { error } = await supabase.from('fixed_assets').insert({
      merchant_id: merchantId, store_id: storeId,
      asset_code: form.asset_code || `FA-${Date.now().toString(36).toUpperCase()}`,
      name: form.name, category: form.category,
      purchase_date: form.purchase_date,
      purchase_cost: Number(form.purchase_cost),
      salvage_value: Number(form.salvage_value) || 0,
      useful_life_months: Number(form.useful_life_months) || 60,
      depreciation_method: form.depreciation_method,
      wdv_rate: form.wdv_rate ? Number(form.wdv_rate) : null,
      status: 'active',
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Asset added');
    setOpen(false);
    setForm({ ...form, asset_code: '', name: '', purchase_cost: '', salvage_value: '0' });
    load();
  };
  const remove = async (id: string) => { await supabase.from('fixed_assets').delete().eq('id', id); load(); };

  const enriched = useMemo(() => rows.map((a) => {
    const bookValue = Number(a.purchase_cost) - Number(a.accumulated_depreciation);
    return { ...a, book_value: bookValue };
  }), [rows]);

  const totals = enriched.reduce((a, r) => ({ cost: a.cost + Number(r.purchase_cost), dep: a.dep + Number(r.accumulated_depreciation), book: a.book + r.book_value }), { cost: 0, dep: 0, book: 0 });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fixed Assets Register</h1>
          <p className="text-sm text-muted-foreground">Physical asset inventory with purchase, depreciation, and current book value</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV('fixed-assets', enriched)}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New Asset</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Fixed Asset</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Asset Code</Label><Input value={form.asset_code} onChange={(e) => setForm({ ...form, asset_code: e.target.value })} placeholder="Auto" /></div>
                  <div><Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Purchase Date</Label><Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div>
                  <div><Label>Purchase Cost</Label><Input type="number" value={form.purchase_cost} onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Salvage Value</Label><Input type="number" value={form.salvage_value} onChange={(e) => setForm({ ...form, salvage_value: e.target.value })} /></div>
                  <div><Label>Useful Life (months)</Label><Input type="number" value={form.useful_life_months} onChange={(e) => setForm({ ...form, useful_life_months: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Method</Label>
                    <Select value={form.depreciation_method} onValueChange={(v) => setForm({ ...form, depreciation_method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="straight_line">Straight Line</SelectItem>
                        <SelectItem value="wdv">Written Down Value</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.depreciation_method === 'wdv' && <div><Label>WDV Rate %</Label><Input type="number" value={form.wdv_rate} onChange={(e) => setForm({ ...form, wdv_rate: e.target.value })} /></div>}
                </div>
              </div>
              <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Gross Cost</div><div className="text-lg font-semibold font-mono">{inr(totals.cost)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Accumulated Depreciation</div><div className="text-lg font-semibold font-mono">{inr(totals.dep)}</div></CardContent></Card>
        <Card className="border-primary"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Net Book Value</div><div className="text-lg font-semibold font-mono text-primary">{inr(totals.book)}</div></CardContent></Card>
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Asset Register ({enriched.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr>
              <th className="p-2 pl-4">Code</th><th className="p-2">Name</th><th className="p-2">Category</th>
              <th className="p-2">Purchase Date</th><th className="p-2 text-right">Cost</th>
              <th className="p-2">Method</th><th className="p-2 text-right">Life</th>
              <th className="p-2 text-right">Depreciation</th><th className="p-2 text-right">Book Value</th>
              <th className="p-2">Status</th><th className="p-2 pr-4"></th>
            </tr></thead>
            <tbody>
              {enriched.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">No assets registered</td></tr>}
              {enriched.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 pl-4 font-mono text-xs">{r.asset_code}</td>
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 text-xs">{r.category}</td>
                  <td className="p-2">{r.purchase_date}</td>
                  <td className="p-2 text-right font-mono">{inr(r.purchase_cost)}</td>
                  <td className="p-2 text-xs">{r.depreciation_method}{r.wdv_rate ? ` @${r.wdv_rate}%` : ''}</td>
                  <td className="p-2 text-right">{r.useful_life_months}m</td>
                  <td className="p-2 text-right font-mono">{inr(r.accumulated_depreciation)}</td>
                  <td className="p-2 text-right font-mono">{inr(r.book_value)}</td>
                  <td className="p-2"><Badge variant={r.status === 'active' ? 'default' : 'secondary'}>{r.status}</Badge></td>
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
