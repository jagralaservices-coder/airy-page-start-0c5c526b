import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { exportCSV, inr } from '@/lib/accounting/exportUtils';
import { Download, Printer } from 'lucide-react';

interface SettlementRow {
  id: string; gateway_id: string; collected: number; settled: number; pending: number;
  fees: number; settlement_date: string; status: string; gateway_settlement_id: string;
  net: number; gst_on_fees: number;
}

export default function PaymentSettlementReport() {
  const { storeId } = useAccountingContext();
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [hasGateway, setHasGateway] = useState<boolean | null>(null);
  const [txnCounts, setTxnCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!storeId) return;
    (async () => {
      const { count } = await supabase.from('merchant_gateway_connections').select('id', { count: 'exact', head: true }).eq('store_id', storeId);
      setHasGateway((count ?? 0) > 0);
      if (!count) { setRows([]); return; }
      const { data } = await supabase.from('gateway_settlements').select('*').eq('store_id', storeId).gte('settlement_date', from).lte('settlement_date', to + 'T23:59:59Z').order('settlement_date', { ascending: false });
      const list = (data ?? []).map((r: any) => {
        const fees = Number(r.fees) || 0;
        const gst = +(fees * 0.18).toFixed(2);
        return { ...r, fees, gst_on_fees: gst, net: Number(r.settled) - fees - gst };
      });
      setRows(list as any);
      const { data: txn } = await supabase.from('gateway_transactions').select('gateway_id').eq('store_id', storeId).gte('created_at', from).lte('created_at', to + 'T23:59:59Z');
      const counts: Record<string, number> = {};
      (txn ?? []).forEach((t: any) => (counts[t.gateway_id] = (counts[t.gateway_id] || 0) + 1));
      setTxnCounts(counts);
    })();
  }, [storeId, from, to]);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    collected: a.collected + Number(r.collected), settled: a.settled + Number(r.settled),
    pending: a.pending + Number(r.pending), fees: a.fees + r.fees, gst: a.gst + r.gst_on_fees, net: a.net + r.net,
  }), { collected: 0, settled: 0, pending: 0, fees: 0, gst: 0, net: 0 }), [rows]);

  if (hasGateway === false) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">Payment Settlement Report</h1>
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          No payment gateway connected. Set up a gateway in Payment Integrations to see settlement reports.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Payment Settlement Report</h1>
          <p className="text-sm text-muted-foreground">Gateway settlements, fees, GST and net credits</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV('settlement-report', rows)}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
        </div>
      </div>
      <div className="flex gap-2 items-end">
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          ['Collected', totals.collected], ['Settled', totals.settled], ['Pending', totals.pending],
          ['Fees', totals.fees], ['GST on Fees', totals.gst], ['Net Credit', totals.net],
        ].map(([l, v]) => <Card key={l as string}><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">{l as string}</div>
          <div className="text-base font-semibold font-mono">{inr(v as number)}</div>
        </CardContent></Card>)}
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Settlements ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr>
              <th className="p-2 pl-4">Date</th><th className="p-2">Gateway</th><th className="p-2">Settlement ID</th>
              <th className="p-2 text-right">Collected</th><th className="p-2 text-right">Fees</th><th className="p-2 text-right">GST</th>
              <th className="p-2 text-right">Settled</th><th className="p-2 text-right">Pending</th>
              <th className="p-2 text-right">Net</th><th className="p-2 text-right">Txns</th><th className="p-2 pr-4">Status</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">No settlements in this period</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 pl-4">{String(r.settlement_date).slice(0, 10)}</td>
                  <td className="p-2 uppercase text-xs">{r.gateway_id}</td>
                  <td className="p-2 font-mono text-xs">{r.gateway_settlement_id}</td>
                  <td className="p-2 text-right font-mono">{inr(r.collected)}</td>
                  <td className="p-2 text-right font-mono">{inr(r.fees)}</td>
                  <td className="p-2 text-right font-mono">{inr(r.gst_on_fees)}</td>
                  <td className="p-2 text-right font-mono">{inr(r.settled)}</td>
                  <td className="p-2 text-right font-mono">{inr(r.pending)}</td>
                  <td className="p-2 text-right font-mono font-semibold">{inr(r.net)}</td>
                  <td className="p-2 text-right">{txnCounts[r.gateway_id] ?? '—'}</td>
                  <td className="p-2 pr-4"><Badge variant={r.status === 'settled' ? 'default' : 'secondary'}>{r.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
