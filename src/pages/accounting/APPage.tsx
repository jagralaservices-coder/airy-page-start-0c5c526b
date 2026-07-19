import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { exportCSV, inr, daysBetween } from '@/lib/accounting/exportUtils';
import { Download, Printer, Plus, IndianRupee } from 'lucide-react';
import { toast } from 'sonner';

interface Invoice {
  id: string;
  supplier_id: string;
  supplier_name: string;
  invoice_number: string;
  purchase_order_id: string | null;
  po_number: string | null;
  invoice_date: string;
  due_date: string | null;
  total: number;
  paid_amount: number;
  status: string;
}

export default function APPage() {
  const { merchantId, storeId } = useAccountingContext();
  const [rows, setRows] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [pos, setPos] = useState<Array<{ id: string; po_number: string; total: number; supplier_id: string }>>([]);
  const [openNew, setOpenNew] = useState(false);
  const [openPay, setOpenPay] = useState<Invoice | null>(null);
  const [form, setForm] = useState({ supplier_id: '', invoice_number: '', purchase_order_id: '', invoice_date: new Date().toISOString().slice(0, 10), due_date: '', total: '' });
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', reference: '' });

  const load = async () => {
    if (!merchantId) return;
    const [{ data: si }, { data: sup }, { data: p }] = await Promise.all([
      supabase.from('supplier_invoices').select('*').eq('merchant_id', merchantId).order('invoice_date', { ascending: false }),
      supabase.from('suppliers').select('id,name').eq('merchant_id', merchantId).eq('active', true),
      supabase.from('purchase_orders').select('id,po_number,total,supplier_id').eq('merchant_id', merchantId).order('created_at', { ascending: false }).limit(200),
    ]);
    const sMap = new Map((sup ?? []).map((s: any) => [s.id, s.name]));
    const pMap = new Map((p ?? []).map((po: any) => [po.id, po.po_number]));
    setSuppliers((sup ?? []) as any);
    setPos((p ?? []) as any);
    setRows((si ?? []).map((r: any) => ({
      ...r,
      supplier_name: sMap.get(r.supplier_id) ?? '—',
      po_number: pMap.get(r.purchase_order_id) ?? null,
    })));
  };

  useEffect(() => { load(); }, [merchantId]);

  const save = async () => {
    if (!merchantId || !form.supplier_id || !form.invoice_number || !form.total) { toast.error('Fill required fields'); return; }
    const { error } = await supabase.from('supplier_invoices').insert({
      merchant_id: merchantId,
      store_id: storeId,
      supplier_id: form.supplier_id,
      invoice_number: form.invoice_number,
      purchase_order_id: form.purchase_order_id || null,
      invoice_date: form.invoice_date,
      due_date: form.due_date || null,
      total: Number(form.total),
      status: 'unpaid',
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Invoice added');
    setOpenNew(false);
    setForm({ supplier_id: '', invoice_number: '', purchase_order_id: '', invoice_date: new Date().toISOString().slice(0, 10), due_date: '', total: '' });
    load();
  };

  const pay = async () => {
    if (!openPay || !merchantId) return;
    const amt = Number(payForm.amount);
    if (!amt || amt <= 0) { toast.error('Enter amount'); return; }
    const { error } = await supabase.from('supplier_payments').insert({
      merchant_id: merchantId, store_id: storeId, supplier_id: openPay.supplier_id, invoice_id: openPay.id,
      amount: amt, method: payForm.method, reference: payForm.reference || null,
    });
    if (error) { toast.error(error.message); return; }
    const newPaid = Number(openPay.paid_amount) + amt;
    const status = newPaid >= Number(openPay.total) ? 'paid' : 'partial';
    await supabase.from('supplier_invoices').update({ paid_amount: newPaid, status }).eq('id', openPay.id);
    toast.success('Payment recorded');
    setOpenPay(null);
    setPayForm({ amount: '', method: 'cash', reference: '' });
    load();
  };

  const enriched = useMemo(() => rows.map((r) => {
    const pending = Number(r.total) - Number(r.paid_amount);
    const overdue = r.due_date && pending > 0.01 ? Math.max(0, daysBetween(r.due_date)) : 0;
    return { ...r, pending, overdue };
  }), [rows]);
  const totals = enriched.reduce((a, r) => ({ total: a.total + Number(r.total), paid: a.paid + Number(r.paid_amount), pending: a.pending + r.pending }), { total: 0, paid: 0, pending: 0 });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Accounts Payable</h1>
          <p className="text-sm text-muted-foreground">Supplier invoices, dues, and payment status</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV('accounts-payable', enriched)}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New Invoice</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Supplier Invoice</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Supplier</Label>
                  <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Invoice #</Label><Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} /></div>
                <div><Label>Link Purchase Order (optional)</Label>
                  <Select value={form.purchase_order_id} onValueChange={(v) => setForm({ ...form, purchase_order_id: v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>{pos.filter((p) => !form.supplier_id || p.supplier_id === form.supplier_id).map((p) => <SelectItem key={p.id} value={p.id}>{p.po_number} — {inr(p.total)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Invoice Date</Label><Input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} /></div>
                  <div><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
                </div>
                <div><Label>Total Amount</Label><Input type="number" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Billed</div><div className="text-lg font-semibold font-mono">{inr(totals.total)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Paid</div><div className="text-lg font-semibold font-mono text-green-600">{inr(totals.paid)}</div></CardContent></Card>
        <Card className="border-primary"><CardContent className="p-4"><div className="text-xs text-muted-foreground">Pending</div><div className="text-lg font-semibold font-mono text-primary">{inr(totals.pending)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Invoices ({enriched.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2 pl-4">Supplier</th>
                  <th className="p-2">Invoice #</th>
                  <th className="p-2">PO</th>
                  <th className="p-2">Inv Date</th>
                  <th className="p-2">Due Date</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 text-right">Paid</th>
                  <th className="p-2 text-right">Pending</th>
                  <th className="p-2 text-right">Overdue</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {enriched.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">No supplier invoices yet</td></tr>}
                {enriched.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 pl-4">{r.supplier_name}</td>
                    <td className="p-2 font-mono text-xs">{r.invoice_number}</td>
                    <td className="p-2 font-mono text-xs">{r.po_number ?? '—'}</td>
                    <td className="p-2">{r.invoice_date}</td>
                    <td className="p-2">{r.due_date ?? '—'}</td>
                    <td className="p-2 text-right font-mono">{inr(r.total)}</td>
                    <td className="p-2 text-right font-mono">{inr(r.paid_amount)}</td>
                    <td className="p-2 text-right font-mono font-semibold">{inr(r.pending)}</td>
                    <td className="p-2 text-right">{r.overdue > 0 ? <Badge variant="destructive">{r.overdue}d</Badge> : '—'}</td>
                    <td className="p-2"><Badge variant={r.status === 'paid' ? 'default' : r.status === 'partial' ? 'secondary' : 'outline'}>{r.status}</Badge></td>
                    <td className="p-2 pr-4">{r.pending > 0.01 && <Button size="sm" variant="ghost" onClick={() => setOpenPay(r)}><IndianRupee className="h-3 w-3 mr-1" />Pay</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!openPay} onOpenChange={(o) => !o && setOpenPay(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment — {openPay?.invoice_number}</DialogTitle></DialogHeader>
          {openPay && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">Pending: <span className="font-mono font-semibold">{inr(Number(openPay.total) - Number(openPay.paid_amount))}</span></div>
              <div><Label>Amount</Label><Input type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></div>
              <div><Label>Method</Label>
                <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Reference</Label><Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter><Button onClick={pay}>Record Payment</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
