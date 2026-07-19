import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { exportCSV, inr } from '@/lib/accounting/exportUtils';
import { Download, Printer } from 'lucide-react';

interface Row { date: string; type: string; ref: string; debit: number; credit: number; balance: number; }

export default function SupplierLedgerPage() {
  const { merchantId } = useAccountingContext();
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [supplierId, setSupplierId] = useState('');
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), 3, 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [opening, setOpening] = useState(0);

  useEffect(() => {
    if (!merchantId) return;
    supabase.from('suppliers').select('id,name').eq('merchant_id', merchantId).eq('active', true).order('name')
      .then(({ data }) => { setSuppliers((data ?? []) as any); if (!supplierId && data?.length) setSupplierId(data[0].id); });
  }, [merchantId]);

  useEffect(() => {
    if (!supplierId || !merchantId) return;
    (async () => {
      const [{ data: inv }, { data: pay }] = await Promise.all([
        supabase.from('supplier_invoices').select('id,invoice_number,invoice_date,total').eq('merchant_id', merchantId).eq('supplier_id', supplierId),
        supabase.from('supplier_payments').select('id,reference,payment_date,amount,method').eq('merchant_id', merchantId).eq('supplier_id', supplierId),
      ]);
      const before: Row[] = [];
      const between: Row[] = [];
      (inv ?? []).forEach((i: any) => {
        const r: Row = { date: i.invoice_date, type: 'Invoice', ref: i.invoice_number, debit: 0, credit: Number(i.total), balance: 0 };
        (i.invoice_date < from ? before : (i.invoice_date <= to ? between : null))?.push(r);
      });
      (pay ?? []).forEach((p: any) => {
        const r: Row = { date: p.payment_date, type: 'Payment', ref: p.reference ?? p.method, debit: Number(p.amount), credit: 0, balance: 0 };
        (p.payment_date < from ? before : (p.payment_date <= to ? between : null))?.push(r);
      });
      const op = before.reduce((s, r) => s + r.credit - r.debit, 0);
      setOpening(op);
      between.sort((a, b) => a.date.localeCompare(b.date));
      let bal = op;
      between.forEach((r) => { bal += r.credit - r.debit; r.balance = bal; });
      setRows(between);
    })();
  }, [supplierId, merchantId, from, to]);

  const totals = useMemo(() => rows.reduce((a, r) => ({ d: a.d + r.debit, c: a.c + r.credit }), { d: 0, c: 0 }), [rows]);
  const closing = opening + totals.c - totals.d;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Supplier Ledger</h1>
          <p className="text-sm text-muted-foreground">Purchases, payments, opening and closing balances</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV('supplier-ledger', rows)}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap items-end">
        <div className="w-72"><Label className="text-xs">Supplier</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
      </div>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Ledger</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr>
              <th className="p-2 pl-4">Date</th><th className="p-2">Type</th><th className="p-2">Ref</th>
              <th className="p-2 text-right">Debit (Paid)</th><th className="p-2 text-right">Credit (Purchase)</th>
              <th className="p-2 text-right pr-4">Balance</th>
            </tr></thead>
            <tbody>
              <tr className="border-t bg-muted/20 font-medium">
                <td colSpan={5} className="p-2 pl-4">Opening Balance</td>
                <td className="p-2 text-right pr-4 font-mono">{inr(opening)}</td>
              </tr>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 pl-4">{r.date}</td><td className="p-2">{r.type}</td>
                  <td className="p-2 font-mono text-xs">{r.ref}</td>
                  <td className="p-2 text-right font-mono">{r.debit ? inr(r.debit) : ''}</td>
                  <td className="p-2 text-right font-mono">{r.credit ? inr(r.credit) : ''}</td>
                  <td className="p-2 text-right pr-4 font-mono">{inr(r.balance)}</td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30 font-semibold">
                <td colSpan={3} className="p-2 pl-4">Closing Balance</td>
                <td className="p-2 text-right font-mono">{inr(totals.d)}</td>
                <td className="p-2 text-right font-mono">{inr(totals.c)}</td>
                <td className="p-2 text-right pr-4 font-mono">{inr(closing)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
