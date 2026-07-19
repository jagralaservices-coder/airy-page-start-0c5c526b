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

type PartyType = 'customer' | 'supplier';
interface Row { date: string; type: string; ref: string; debit: number; credit: number; balance: number; }

export default function PartnerLedgerPage() {
  const { merchantId, storeId } = useAccountingContext();
  const [partyType, setPartyType] = useState<PartyType>('customer');
  const [parties, setParties] = useState<Array<{ id: string; name: string }>>([]);
  const [partyId, setPartyId] = useState('');
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), 3, 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [opening, setOpening] = useState(0);

  useEffect(() => {
    if (!merchantId) return;
    (async () => {
      if (partyType === 'customer') {
        let q = supabase.from('pos_customers').select('id,name').eq('merchant_id', merchantId).order('name');
        if (storeId) q = q.eq('store_id', storeId);
        const { data } = await q;
        setParties((data ?? []) as any);
        setPartyId(data?.[0]?.id ?? '');
      } else {
        const { data } = await supabase.from('suppliers').select('id,name').eq('merchant_id', merchantId).eq('active', true).order('name');
        setParties((data ?? []) as any);
        setPartyId(data?.[0]?.id ?? '');
      }
    })();
  }, [merchantId, storeId, partyType]);

  useEffect(() => {
    if (!partyId || !merchantId) return;
    (async () => {
      const before: Row[] = [];
      const between: Row[] = [];
      if (partyType === 'customer') {
        const [{ data: cl }, { data: cp }] = await Promise.all([
          supabase.from('credit_ledger').select('id,order_id,due_amount,created_at').eq('customer_id', partyId),
          supabase.from('credit_payments').select('payment_date,amount,reference,credit_ledger_id').in('credit_ledger_id', []),
        ]);
        const ledgerIds = (cl ?? []).map((r: any) => r.id);
        const { data: pays } = ledgerIds.length ? await supabase.from('credit_payments').select('payment_date,amount,reference').in('credit_ledger_id', ledgerIds) : { data: [] as any[] };
        (cl ?? []).forEach((r: any) => {
          const d = r.created_at.slice(0, 10);
          const row: Row = { date: d, type: 'Credit Sale', ref: r.order_id ?? '', debit: Number(r.due_amount), credit: 0, balance: 0 };
          (d < from ? before : (d <= to ? between : null))?.push(row);
        });
        (pays ?? []).forEach((p: any) => {
          const d = String(p.payment_date).slice(0, 10);
          const row: Row = { date: d, type: 'Collection', ref: p.reference ?? '', debit: 0, credit: Number(p.amount), balance: 0 };
          (d < from ? before : (d <= to ? between : null))?.push(row);
        });
      } else {
        const [{ data: inv }, { data: pay }] = await Promise.all([
          supabase.from('supplier_invoices').select('invoice_date,invoice_number,total').eq('merchant_id', merchantId).eq('supplier_id', partyId),
          supabase.from('supplier_payments').select('payment_date,amount,reference').eq('merchant_id', merchantId).eq('supplier_id', partyId),
        ]);
        (inv ?? []).forEach((i: any) => {
          const row: Row = { date: i.invoice_date, type: 'Purchase', ref: i.invoice_number, debit: 0, credit: Number(i.total), balance: 0 };
          (i.invoice_date < from ? before : (i.invoice_date <= to ? between : null))?.push(row);
        });
        (pay ?? []).forEach((p: any) => {
          const d = String(p.payment_date).slice(0, 10);
          const row: Row = { date: d, type: 'Payment', ref: p.reference ?? '', debit: Number(p.amount), credit: 0, balance: 0 };
          (d < from ? before : (d <= to ? between : null))?.push(row);
        });
      }
      const op = before.reduce((s, r) => s + (r.debit - r.credit), 0);
      setOpening(op);
      between.sort((a, b) => a.date.localeCompare(b.date));
      let bal = op;
      between.forEach((r) => { bal += r.debit - r.credit; r.balance = bal; });
      setRows(between);
    })();
  }, [partyId, partyType, merchantId, from, to]);

  const totals = useMemo(() => rows.reduce((a, r) => ({ d: a.d + r.debit, c: a.c + r.credit }), { d: 0, c: 0 }), [rows]);
  const closing = opening + totals.d - totals.c;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Partner Ledger</h1>
          <p className="text-sm text-muted-foreground">Customer, supplier, and vendor account statements</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV('partner-ledger', rows)}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div><Label className="text-xs">Type</Label>
          <Select value={partyType} onValueChange={(v: any) => setPartyType(v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="supplier">Supplier / Vendor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-72"><Label className="text-xs">Party</Label>
          <Select value={partyId} onValueChange={setPartyId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{parties.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
      </div>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Statement</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr>
              <th className="p-2 pl-4">Date</th><th className="p-2">Type</th><th className="p-2">Ref</th>
              <th className="p-2 text-right">Debit</th><th className="p-2 text-right">Credit</th>
              <th className="p-2 text-right pr-4">Balance</th>
            </tr></thead>
            <tbody>
              <tr className="border-t bg-muted/20 font-medium">
                <td colSpan={5} className="p-2 pl-4">Opening Balance</td>
                <td className="p-2 text-right pr-4 font-mono">{inr(opening)}</td>
              </tr>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 pl-4">{r.date}</td>
                  <td className="p-2">{r.type}</td>
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
