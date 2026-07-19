import React, { useEffect, useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, inRange } from '@/lib/reports/invPurchHelpers';

interface PORow {
  id: string; poNumber: string; supplierId: string | null; supplier: string;
  status: string; createdAt: string; total: number;
  items: { name: string; qty: number; total: number }[];
}

const VendorPurchasePage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<PORow[]>([]);
  const [payments, setPayments] = useState<Map<string, number>>(new Map()); // supplier_id -> paid
  const [outstanding, setOutstanding] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const range = presetToRange(preset, customRange);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: pos }, { data: pays }, { data: invs }] = await Promise.all([
        supabase.from('purchase_orders')
          .select('id, po_number, status, total, created_at, supplier_id, suppliers(name), purchase_order_items(quantity, total, products(name))')
          .order('created_at', { ascending: false }).limit(3000),
        supabase.from('supplier_payments').select('supplier_id, amount').limit(5000),
        supabase.from('supplier_invoices').select('supplier_id, total, amount_paid').limit(5000),
      ]);

      if (pos) setRows(pos.map((r: any) => ({
        id: r.id, poNumber: r.po_number,
        supplierId: r.supplier_id,
        supplier: r.suppliers?.name || '—',
        status: r.status, createdAt: r.created_at, total: Number(r.total || 0),
        items: (r.purchase_order_items || []).map((i: any) => ({
          name: i.products?.name || '—', qty: Number(i.quantity), total: Number(i.total || 0),
        })),
      })));

      const pmap = new Map<string, number>();
      (pays || []).forEach((p: any) => {
        if (!p.supplier_id) return;
        pmap.set(p.supplier_id, (pmap.get(p.supplier_id) || 0) + Number(p.amount || 0));
      });
      setPayments(pmap);

      const omap = new Map<string, number>();
      (invs || []).forEach((inv: any) => {
        if (!inv.supplier_id) return;
        const due = Number(inv.total || 0) - Number(inv.amount_paid || 0);
        if (due > 0) omap.set(inv.supplier_id, (omap.get(inv.supplier_id) || 0) + due);
      });
      setOutstanding(omap);

      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => rows.filter(r => inRange(r.createdAt, range)), [rows, range]);

  const vendors = useMemo(() => {
    const map = new Map<string, {
      name: string; supplierId: string | null; count: number; amount: number;
      last: string; pending: number; cancelled: number;
      items: Map<string, { qty: number; total: number }>;
    }>();
    filtered.forEach(r => {
      const cur = map.get(r.supplier) || { name: r.supplier, supplierId: r.supplierId, count: 0, amount: 0, last: r.createdAt, pending: 0, cancelled: 0, items: new Map() };
      cur.count += 1;
      cur.amount += r.total;
      if (r.createdAt > cur.last) cur.last = r.createdAt;
      if (['draft', 'ordered', 'shipped'].includes(r.status)) cur.pending += 1;
      if (r.status === 'cancelled') cur.cancelled += 1;
      r.items.forEach(it => {
        const c = cur.items.get(it.name) || { qty: 0, total: 0 };
        c.qty += it.qty; c.total += it.total;
        cur.items.set(it.name, c);
      });
      map.set(r.supplier, cur);
    });
    return Array.from(map.values())
      .filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()))
      .map(v => {
        const paid = v.supplierId ? (payments.get(v.supplierId) || 0) : 0;
        const outstandingAmt = v.supplierId ? (outstanding.get(v.supplierId) || 0) : 0;
        const paymentStatus = outstandingAmt <= 0 ? 'settled' : paid > 0 ? 'partial' : 'unpaid';
        const topItems = Array.from(v.items.entries())
          .map(([name, x]) => ({ name, ...x })).sort((a, b) => b.total - a.total).slice(0, 3);
        return {
          ...v,
          avgPurchase: v.count > 0 ? v.amount / v.count : 0,
          paid, outstanding: outstandingAmt, paymentStatus, topItems,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [filtered, payments, outstanding, search]);

  const totalAmount = vendors.reduce((s, v) => s + v.amount, 0);
  const totalOutstanding = vendors.reduce((s, v) => s + v.outstanding, 0);

  const topChart = vendors.slice(0, 10).map(v => ({ name: v.name, value: v.amount }));
  const trend = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(r => {
      const d = new Date(r.createdAt).toLocaleDateString('en-IN');
      map.set(d, (map.get(d) || 0) + r.total);
    });
    return Array.from(map.entries()).map(([date, value]) => ({ date, value })).slice(-30);
  }, [filtered]);

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Vendor-wise Purchase"
        subtitle="Supplier analytics and outstanding"
        icon={<Truck className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        buildPayload={() => ({
          title: 'Vendor-wise Purchase Report',
          storeName: scope.storeName,
          dateRange: `${range.from?.toLocaleDateString('en-IN')} - ${range.to?.toLocaleDateString('en-IN')}`,
          kpis: [
            { label: 'Vendors', value: vendors.length },
            { label: 'Total Purchase', value: fmtINR(totalAmount) },
            { label: 'Outstanding', value: fmtINR(totalOutstanding) },
          ],
          sections: [{
            title: 'Vendor Performance',
            headers: ['Supplier', 'Orders', 'Amount', 'Avg', 'Last', 'Pending', 'Cancelled', 'Paid', 'Outstanding', 'Status'],
            rows: vendors.map(v => [
              v.name, v.count, fmtINR(v.amount), fmtINR(v.avgPurchase),
              new Date(v.last).toLocaleDateString('en-IN'),
              v.pending, v.cancelled, fmtINR(v.paid), fmtINR(v.outstanding), v.paymentStatus,
            ]),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Vendors</div><div className="text-lg font-bold">{vendors.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Purchase</div><div className="text-lg font-bold">{fmtINR(totalAmount)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Outstanding</div><div className="text-lg font-bold text-destructive">{fmtINR(totalOutstanding)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Orders</div><div className="text-lg font-bold">{filtered.length}</div></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card><CardContent className="p-4">
            <div className="text-sm font-semibold mb-3">Top Vendors</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topChart} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => fmtINR(v)} />
                <Bar dataKey="value" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-sm font-semibold mb-3">Purchase Trend</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => fmtINR(v)} />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Avg</TableHead>
                <TableHead>Last</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Cancelled</TableHead>
                <TableHead>Top Items</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={10} className="text-center py-8">Loading…</TableCell></TableRow>
                  : vendors.length === 0 ? <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No vendor purchases</TableCell></TableRow>
                  : vendors.map(v => (
                    <TableRow key={v.name}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell className="text-right">{v.count}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtINR(v.amount)}</TableCell>
                      <TableCell className="text-right">{fmtINR(v.avgPurchase)}</TableCell>
                      <TableCell className="text-xs">{new Date(v.last).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell className="text-right">{v.pending}</TableCell>
                      <TableCell className="text-right">{v.cancelled}</TableCell>
                      <TableCell className="text-xs">
                        {v.topItems.map(i => <div key={i.name} className="text-muted-foreground">{i.name} ({fmt(i.qty)})</div>)}
                      </TableCell>
                      <TableCell className="text-right text-destructive">{fmtINR(v.outstanding)}</TableCell>
                      <TableCell>
                        <Badge variant={v.paymentStatus === 'settled' ? 'default' : v.paymentStatus === 'partial' ? 'secondary' : 'destructive'}>
                          {v.paymentStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VendorPurchasePage;
