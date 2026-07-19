import React, { useEffect, useState } from 'react';
// Simple inline shell — ReportShell has a more complex API for date pickers.
import { KpiCard } from '@/components/reports/KpiCard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { getActiveStore } from '@/lib/store';
import { getCatalogEntry } from '@/lib/paymentHub';

const PaymentGatewayReportPage: React.FC = () => {
  const [txns, setTxns] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);

  useEffect(() => {
    const storeId = getActiveStore();
    if (!storeId) return;
    (async () => {
      const [{ data: t }, { data: r }, { data: s }] = await Promise.all([
        (supabase as any).from('gateway_transactions').select('*').eq('store_id', storeId).order('created_at', { ascending: false }).limit(500),
        (supabase as any).from('gateway_refunds').select('*').eq('store_id', storeId).order('created_at', { ascending: false }).limit(200),
        (supabase as any).from('gateway_settlements').select('*').eq('store_id', storeId).order('settlement_date', { ascending: false }).limit(200),
      ]);
      setTxns(t || []); setRefunds(r || []); setSettlements(s || []);
    })();
  }, []);

  const paid = txns.filter(t => t.status === 'paid');
  const failed = txns.filter(t => t.status === 'failed').length;
  const totalCollected = paid.reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalFees = paid.reduce((s, t) => s + Number(t.fees || 0), 0);
  const totalRefunds = refunds.reduce((s, r) => s + Number(r.amount || 0), 0);
  const successRate = txns.length ? Math.round((paid.length / txns.length) * 100) : 0;

  const byGateway: Record<string, { paid: number; collected: number; fees: number; txns: number }> = {};
  txns.forEach(t => {
    const k = t.gateway_id;
    byGateway[k] = byGateway[k] || { paid: 0, collected: 0, fees: 0, txns: 0 };
    byGateway[k].txns++;
    if (t.status === 'paid') {
      byGateway[k].paid++;
      byGateway[k].collected += Number(t.amount || 0);
      byGateway[k].fees += Number(t.fees || 0);
    }
  });

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto"><div><h1 className="text-2xl font-bold">Payment Gateway Report</h1><p className="text-muted-foreground text-sm">Collections, fees, refunds, settlement and performance across connected gateways.</p></div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Collected" value={`₹${totalCollected.toFixed(2)}`} />
        <KpiCard label="Fees" value={`₹${totalFees.toFixed(2)}`} />
        <KpiCard label="Refunds" value={`₹${totalRefunds.toFixed(2)}`} />
        <KpiCard label="Transactions" value={txns.length} />
        <KpiCard label="Success %" value={`${successRate}%`} />
      </div>

      <Tabs defaultValue="collection" className="mt-6">
        <TabsList>
          <TabsTrigger value="collection">Collection</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="refunds">Refunds</TabsTrigger>
          <TabsTrigger value="settlement">Settlement</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="collection">
          <Table><TableHeader><TableRow>
            <TableHead>Gateway</TableHead><TableHead>Txns</TableHead><TableHead>Paid</TableHead><TableHead>Collected</TableHead>
          </TableRow></TableHeader><TableBody>
            {Object.entries(byGateway).map(([id, v]) => (
              <TableRow key={id}>
                <TableCell>{getCatalogEntry(id)?.name || id}</TableCell>
                <TableCell>{v.txns}</TableCell><TableCell>{v.paid}</TableCell>
                <TableCell>₹{v.collected.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </TabsContent>

        <TabsContent value="performance">
          <Table><TableHeader><TableRow>
            <TableHead>Gateway</TableHead><TableHead>Success %</TableHead><TableHead>Failed</TableHead>
          </TableRow></TableHeader><TableBody>
            {Object.entries(byGateway).map(([id, v]) => (
              <TableRow key={id}>
                <TableCell>{getCatalogEntry(id)?.name || id}</TableCell>
                <TableCell>{v.txns ? Math.round((v.paid / v.txns) * 100) : 0}%</TableCell>
                <TableCell>{v.txns - v.paid}</TableCell>
              </TableRow>
            ))}
            <TableRow><TableCell colSpan={3} className="text-xs text-muted-foreground">{failed} failed transactions overall.</TableCell></TableRow>
          </TableBody></Table>
        </TabsContent>

        <TabsContent value="fees">
          <Table><TableHeader><TableRow>
            <TableHead>Gateway</TableHead><TableHead>Collected</TableHead><TableHead>Fees</TableHead><TableHead>Net</TableHead>
          </TableRow></TableHeader><TableBody>
            {Object.entries(byGateway).map(([id, v]) => (
              <TableRow key={id}>
                <TableCell>{getCatalogEntry(id)?.name || id}</TableCell>
                <TableCell>₹{v.collected.toFixed(2)}</TableCell>
                <TableCell>₹{v.fees.toFixed(2)}</TableCell>
                <TableCell>₹{(v.collected - v.fees).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </TabsContent>

        <TabsContent value="refunds">
          <Table><TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Gateway</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead>
          </TableRow></TableHeader><TableBody>
            {refunds.map(r => (
              <TableRow key={r.id}>
                <TableCell>{new Date(r.refund_date || r.created_at).toLocaleString()}</TableCell>
                <TableCell>{getCatalogEntry(r.gateway_id)?.name || r.gateway_id}</TableCell>
                <TableCell>₹{Number(r.amount).toFixed(2)}</TableCell>
                <TableCell><Badge>{r.status}</Badge></TableCell>
                <TableCell>{r.reason || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </TabsContent>

        <TabsContent value="settlement">
          <Table><TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Gateway</TableHead><TableHead>Collected</TableHead><TableHead>Settled</TableHead><TableHead>Fees</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader><TableBody>
            {settlements.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No settlements recorded.</TableCell></TableRow>}
            {settlements.map(s => (
              <TableRow key={s.id}>
                <TableCell>{s.settlement_date ? new Date(s.settlement_date).toLocaleDateString() : '—'}</TableCell>
                <TableCell>{getCatalogEntry(s.gateway_id)?.name || s.gateway_id}</TableCell>
                <TableCell>₹{Number(s.collected || 0).toFixed(2)}</TableCell>
                <TableCell>₹{Number(s.settled || 0).toFixed(2)}</TableCell>
                <TableCell>₹{Number(s.fees || 0).toFixed(2)}</TableCell>
                <TableCell>{s.status || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </TabsContent>

        <TabsContent value="transactions">
          <Table><TableHeader><TableRow>
            <TableHead>Time</TableHead><TableHead>Gateway</TableHead><TableHead>Txn ID</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader><TableBody>
            {txns.slice(0, 100).map(t => (
              <TableRow key={t.id}>
                <TableCell>{new Date(t.created_at).toLocaleString()}</TableCell>
                <TableCell>{getCatalogEntry(t.gateway_id)?.name || t.gateway_id}</TableCell>
                <TableCell className="font-mono text-xs">{t.gateway_txn_id}</TableCell>
                <TableCell>₹{Number(t.amount).toFixed(2)}</TableCell>
                <TableCell><Badge variant={t.status === 'paid' ? 'default' : t.status === 'failed' ? 'destructive' : 'secondary'}>{t.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PaymentGatewayReportPage;
