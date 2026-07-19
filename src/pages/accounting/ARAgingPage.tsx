import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { exportCSV, inr, daysBetween, agingBucket } from '@/lib/accounting/exportUtils';
import { Download, Printer } from 'lucide-react';

interface Row {
  id: string;
  customer_id: string;
  customer_name: string;
  order_id: string | null;
  order_no: string | null;
  invoice_date: string;
  due_date: string | null;
  due_amount: number;
  paid_amount: number;
  outstanding: number;
  overdue_days: number;
  bucket: string;
  status: string;
  last_payment_date: string | null;
}

export default function ARAgingPage() {
  const { merchantId, storeId } = useAccountingContext();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!merchantId) return;
    (async () => {
      setLoading(true);
      let query = supabase.from('credit_ledger').select('*').gt('due_amount', 0);
      if (storeId) query = query.eq('store_id', storeId);
      const { data: cl } = await query.order('created_at', { ascending: false }).limit(2000);
      const customerIds = Array.from(new Set((cl ?? []).map((r: any) => r.customer_id).filter(Boolean)));
      const orderIds = Array.from(new Set((cl ?? []).map((r: any) => r.order_id).filter(Boolean)));
      const [{ data: cust }, { data: ords }, { data: pays }] = await Promise.all([
        customerIds.length ? supabase.from('pos_customers').select('id,name,phone').in('id', customerIds) : Promise.resolve({ data: [] as any[] }),
        orderIds.length ? supabase.from('orders').select('id,order_number,created_at').in('id', orderIds) : Promise.resolve({ data: [] as any[] }),
        supabase.from('credit_payments').select('credit_ledger_id,payment_date,amount').in('credit_ledger_id', (cl ?? []).map((r: any) => r.id)),
      ]);
      const cMap = new Map((cust ?? []).map((c: any) => [c.id, c]));
      const oMap = new Map((ords ?? []).map((o: any) => [o.id, o]));
      const pMap = new Map<string, string>();
      (pays ?? []).forEach((p: any) => {
        const prev = pMap.get(p.credit_ledger_id);
        if (!prev || p.payment_date > prev) pMap.set(p.credit_ledger_id, p.payment_date);
      });
      const list: Row[] = (cl ?? []).map((r: any) => {
        const outstanding = Number(r.due_amount) - Number(r.paid_amount);
        const overdue = r.due_date ? Math.max(0, daysBetween(r.due_date)) : daysBetween(r.created_at);
        return {
          id: r.id,
          customer_id: r.customer_id,
          customer_name: cMap.get(r.customer_id)?.name ?? '—',
          order_id: r.order_id,
          order_no: oMap.get(r.order_id)?.order_number ?? null,
          invoice_date: (oMap.get(r.order_id)?.created_at ?? r.created_at)?.slice(0, 10),
          due_date: r.due_date,
          due_amount: Number(r.due_amount),
          paid_amount: Number(r.paid_amount),
          outstanding,
          overdue_days: overdue,
          bucket: agingBucket(overdue),
          status: r.status,
          last_payment_date: pMap.get(r.id) ?? null,
        };
      }).filter((r) => r.outstanding > 0.01);
      setRows(list);
      setLoading(false);
    })();
  }, [merchantId, storeId]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return rows.filter((r) => !s || r.customer_name.toLowerCase().includes(s) || (r.order_no ?? '').toLowerCase().includes(s));
  }, [rows, q]);

  const buckets = useMemo(() => {
    const b: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    filtered.forEach((r) => (b[r.bucket] += r.outstanding));
    return b;
  }, [filtered]);
  const total = filtered.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Accounts Receivable Aging</h1>
          <p className="text-sm text-muted-foreground">Outstanding customer balances grouped by aging bucket</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV('ar-aging', filtered)}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(['0-30', '31-60', '61-90', '90+'] as const).map((b) => (
          <Card key={b}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{b} days</div>
            <div className="text-lg font-semibold font-mono">{inr(buckets[b])}</div>
          </CardContent></Card>
        ))}
        <Card className="border-primary"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Outstanding</div>
          <div className="text-lg font-semibold font-mono text-primary">{inr(total)}</div>
        </CardContent></Card>
      </div>

      <div className="flex gap-2 items-center">
        <Input placeholder="Search customer / invoice…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Aging Detail ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2 pl-4">Customer</th>
                  <th className="p-2">Invoice #</th>
                  <th className="p-2">Invoice Date</th>
                  <th className="p-2">Due Date</th>
                  <th className="p-2 text-right">Outstanding</th>
                  <th className="p-2 text-right">Overdue Days</th>
                  <th className="p-2">Bucket</th>
                  <th className="p-2">Last Payment</th>
                  <th className="p-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
                {!loading && filtered.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No outstanding receivables</td></tr>}
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 pl-4">{r.customer_name}</td>
                    <td className="p-2 font-mono text-xs">{r.order_no ?? '—'}</td>
                    <td className="p-2">{r.invoice_date}</td>
                    <td className="p-2">{r.due_date ?? '—'}</td>
                    <td className="p-2 text-right font-mono">{inr(r.outstanding)}</td>
                    <td className="p-2 text-right">{r.overdue_days}</td>
                    <td className="p-2"><Badge variant={r.bucket === '90+' ? 'destructive' : r.bucket === '61-90' ? 'default' : 'secondary'}>{r.bucket}</Badge></td>
                    <td className="p-2">{r.last_payment_date ?? '—'}</td>
                    <td className="p-2 pr-4"><Badge variant="outline">{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
