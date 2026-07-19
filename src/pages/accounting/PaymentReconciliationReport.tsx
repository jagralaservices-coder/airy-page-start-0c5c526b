import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { exportCSV, inr } from '@/lib/accounting/exportUtils';
import { Download, Printer, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Row {
  key: string; date: string; ref: string;
  pos_amount: number; gateway_amount: number; bank_amount: number;
  diff: number; status: 'matched' | 'missing_gateway' | 'missing_pos' | 'mismatch' | 'duplicate';
  source: string;
}

export default function PaymentReconciliationReport() {
  const { storeId, merchantId } = useAccountingContext();
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!storeId || !merchantId) return;
    (async () => {
      const [{ data: pay }, { data: txn }, { data: bank }] = await Promise.all([
        supabase.from('payments').select('id,order_id,amount,reference,method,created_at').gte('created_at', from).lte('created_at', to + 'T23:59:59Z'),
        supabase.from('gateway_transactions').select('id,amount,gateway_txn_id,pos_reference,created_at,status').eq('store_id', storeId).gte('created_at', from).lte('created_at', to + 'T23:59:59Z'),
        supabase.from('bank_transactions').select('id,credit,reference,txn_date').eq('merchant_id', merchantId).gte('txn_date', from).lte('txn_date', to),
      ]);
      const map = new Map<string, Row>();
      const seen = new Set<string>();
      (pay ?? []).forEach((p: any) => {
        const key = (p.reference || p.id).toString();
        if (seen.has(key)) {
          map.set(key + '-dup', { key: key + '-dup', date: p.created_at.slice(0, 10), ref: key, pos_amount: Number(p.amount), gateway_amount: 0, bank_amount: 0, diff: 0, status: 'duplicate', source: 'POS' });
        } else {
          seen.add(key);
          map.set(key, { key, date: p.created_at.slice(0, 10), ref: key, pos_amount: Number(p.amount), gateway_amount: 0, bank_amount: 0, diff: 0, status: 'missing_gateway', source: 'POS' });
        }
      });
      (txn ?? []).forEach((t: any) => {
        const key = (t.pos_reference || t.gateway_txn_id || t.id).toString();
        const r = map.get(key);
        if (r) { r.gateway_amount = Number(t.amount); }
        else { map.set(key, { key, date: t.created_at.slice(0, 10), ref: key, pos_amount: 0, gateway_amount: Number(t.amount), bank_amount: 0, diff: 0, status: 'missing_pos', source: 'Gateway' }); }
      });
      (bank ?? []).forEach((b: any) => {
        const key = (b.reference || b.id).toString();
        const r = map.get(key);
        if (r) r.bank_amount = Number(b.credit);
      });
      const list = Array.from(map.values()).map((r) => {
        r.diff = r.pos_amount - r.gateway_amount;
        if (r.status === 'duplicate') return r;
        if (r.pos_amount === 0 && r.gateway_amount > 0) r.status = 'missing_pos';
        else if (r.pos_amount > 0 && r.gateway_amount === 0) r.status = 'missing_gateway';
        else if (Math.abs(r.diff) < 0.01) r.status = 'matched';
        else r.status = 'mismatch';
        return r;
      });
      setRows(list);
    })();
  }, [storeId, merchantId, from, to]);

  const summary = useMemo(() => {
    const s = { matched: 0, missing_gateway: 0, missing_pos: 0, mismatch: 0, duplicate: 0 };
    rows.forEach((r) => { s[r.status]++; });
    return s;
  }, [rows]);

  const badge = (s: Row['status']) => {
    const map: any = { matched: 'default', missing_gateway: 'destructive', missing_pos: 'destructive', mismatch: 'destructive', duplicate: 'secondary' };
    return <Badge variant={map[s]}>{s.replace('_', ' ')}</Badge>;
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Payment Reconciliation</h1>
          <p className="text-sm text-muted-foreground">Compare POS payments, gateway captures and bank credits</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV('payment-reconciliation', rows)}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
        </div>
      </div>
      <div className="flex gap-2 items-end">
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" />Matched</div><div className="text-lg font-semibold">{summary.matched}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-600" />Missing Gateway</div><div className="text-lg font-semibold">{summary.missing_gateway}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-600" />Missing POS</div><div className="text-lg font-semibold">{summary.missing_pos}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-destructive" />Mismatch</div><div className="text-lg font-semibold">{summary.mismatch}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Duplicates</div><div className="text-lg font-semibold">{summary.duplicate}</div></CardContent></Card>
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Recon Detail ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr>
              <th className="p-2 pl-4">Date</th><th className="p-2">Reference</th>
              <th className="p-2 text-right">POS</th><th className="p-2 text-right">Gateway</th><th className="p-2 text-right">Bank</th>
              <th className="p-2 text-right">Difference</th><th className="p-2 pr-4">Status</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nothing to reconcile</td></tr>}
              {rows.map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="p-2 pl-4">{r.date}</td>
                  <td className="p-2 font-mono text-xs">{r.ref}</td>
                  <td className="p-2 text-right font-mono">{r.pos_amount ? inr(r.pos_amount) : '—'}</td>
                  <td className="p-2 text-right font-mono">{r.gateway_amount ? inr(r.gateway_amount) : '—'}</td>
                  <td className="p-2 text-right font-mono">{r.bank_amount ? inr(r.bank_amount) : '—'}</td>
                  <td className="p-2 text-right font-mono">{r.diff ? inr(r.diff) : '—'}</td>
                  <td className="p-2 pr-4">{badge(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
