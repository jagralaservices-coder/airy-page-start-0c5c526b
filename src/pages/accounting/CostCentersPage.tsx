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
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface CC { id: string; name: string; code: string; center_type: string; is_active: boolean; }

const TYPES = ['store', 'kitchen', 'bar', 'warehouse', 'marketing', 'administration', 'hr', 'projects', 'other'];

export default function CostCentersPage() {
  const { merchantId, storeId } = useAccountingContext();
  const [rows, setRows] = useState<CC[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', center_type: 'store' });

  const load = async () => {
    if (!merchantId) return;
    const { data } = await supabase.from('cost_centers').select('*').eq('merchant_id', merchantId).order('name');
    setRows((data ?? []) as any);
  };
  useEffect(() => { load(); }, [merchantId]);

  const save = async () => {
    if (!merchantId || !form.name) { toast.error('Name required'); return; }
    const { error } = await supabase.from('cost_centers').insert({
      merchant_id: merchantId, store_id: storeId,
      name: form.name, code: form.code || form.name.slice(0, 6).toUpperCase(),
      center_type: form.center_type, is_active: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Cost center added');
    setOpen(false); setForm({ name: '', code: '', center_type: 'store' }); load();
  };
  const toggle = async (r: CC) => { await supabase.from('cost_centers').update({ is_active: !r.is_active }).eq('id', r.id); load(); };
  const remove = async (id: string) => { await supabase.from('cost_centers').delete().eq('id', id); load(); };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cost Centers</h1>
          <p className="text-sm text-muted-foreground">Departmental buckets for revenue, expense and payroll allocation</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New Cost Center</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Cost Center</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Auto" /></div>
              <div><Label>Type</Label>
                <Select value={form.center_type} onValueChange={(v) => setForm({ ...form, center_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Centers ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr>
              <th className="p-2 pl-4">Code</th><th className="p-2">Name</th><th className="p-2">Type</th><th className="p-2">Status</th><th className="p-2 pr-4"></th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No cost centers created</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 pl-4 font-mono text-xs">{r.code}</td>
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 text-xs">{r.center_type}</td>
                  <td className="p-2"><Badge variant={r.is_active ? 'default' : 'secondary'} onClick={() => toggle(r)} className="cursor-pointer">{r.is_active ? 'Active' : 'Inactive'}</Badge></td>
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
