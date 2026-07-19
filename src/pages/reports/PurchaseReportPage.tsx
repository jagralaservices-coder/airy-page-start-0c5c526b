import React, { useEffect, useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, inRange } from '@/lib/reports/invPurchHelpers';

interface PORow {
  id: string; poNumber: string; supplier: string; status: string;
  createdAt: string; total: number;
  items: { name: string; qty: number; total: number }[];
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--warning))', 'hsl(var(--success))', 'hsl(var(--destructive))', 'hsl(var(--muted-foreground))'];

const PurchaseReportPage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<PORow[]>([]);
  const [loading, setLoading] = useState(true);
  const range = presetToRange(preset, customRange);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('purchase_orders')
        .select('id, po_number, status, total, created_at, suppliers(name), purchase_order_items(quantity, total, products(name))')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (data) {
        setRows(data.map((r: any) => ({
          id: r.id, poNumber: r.po_number,
          supplier: r.suppliers?.name || '—',
          status: r.status,
          createdAt: r.created_at,
          total: Number(r.total || 0),
          items: (r.purchase_order_items || []).map((i: any) => ({
            name: i.products?.name || '—', qty: Number(i.quantity), total: Number(i.total || 0),
          })),
        })));
      }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() =>
    rows.filter(r => inRange(r.createdAt, range))
      .filter(r => !search || r.supplier.toLowerCase().includes(search.toLowerCase()) || r.poNumber.toLowerCase().includes(search.toLowerCase())),
    [rows, range, search]);

  const totalPurchases = filtered.length;
  const totalValue = filtered.reduce((s, r) => s + r.total, 0);
  const avgPurchase = totalPurchases ? totalValue / totalPurchases : 0;
  const supplierCount = new Set(filtered.map(r => r.supplier)).size;
  const pending = filtered.filter(r => r.status === 'ordered' || r.status === 'shipped' || r.status === 'draft').length;
  const cancelled = filtered.filter(r => r.status === 'cancelled').length;

  const daily = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(r => {
      const d = new Date(r.createdAt).toLocaleDateString('en-IN');
      map.set(d, (map.get(d) || 0) + r.total);
    });
    return Array.from(map.entries()).map(([date, value]) => ({ date, value })).slice(-30);
  }, [filtered]);

  const supplierAgg = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(r => map.set(r.supplier, (map.get(r.supplier) || 0) + r.total));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [filtered]);

  const topItems = useMemo(() => {
    const map = new Map<string, { qty: number; value: number }>();
    filtered.forEach(r => r.items.forEach(it => {
      const cur = map.get(it.name) || { qty: 0, value: 0 };
      cur.qty += it.qty; cur.value += it.total;
      map.set(it.name, cur);
    }));
    return Array.from(map.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [filtered]);

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Purchase Report"
        subtitle="Purchase analytics and supplier insights"
        icon={<BarChart3 className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        buildPayload={() => ({
          title: 'Purchase Analytics',
          storeName: scope.storeName,
          dateRange: `${range.from?.toLocaleDateString('en-IN')} - ${range.to?.toLocaleDateString('en-IN')}`,
          kpis: [
            { label: 'Total Purchases', value: totalPurchases },
            { label: 'Purchase Value', value: fmtINR(totalValue) },
            { label: 'Average', value: fmtINR(avgPurchase) },
            { label: 'Suppliers', value: supplierCount },
            { label: 'Pending', value: pending },
            { label: 'Cancelled', value: cancelled },
          ],
          sections: [
            { title: 'Top Suppliers', headers: ['Supplier', 'Total'], rows: supplierAgg.map(s => [s.name, fmtINR(s.value)]) },
            { title: 'Top Items', headers: ['Item', 'Qty', 'Value'], rows: topItems.map(t => [t.name, fmt(t.qty), fmtINR(t.value)]) },
          ],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Purchases</div><div className="text-lg font-bold">{totalPurchases}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Value</div><div className="text-lg font-bold">{fmtINR(totalValue)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Average</div><div className="text-lg font-bold">{fmtINR(avgPurchase)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Suppliers</div><div className="text-lg font-bold">{supplierCount}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Pending</div><div className="text-lg font-bold text-warning">{pending}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Cancelled</div><div className="text-lg font-bold text-destructive">{cancelled}</div></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card><CardContent className="p-4">
            <div className="text-sm font-semibold mb-3">Daily Purchase Trend</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-sm font-semibold mb-3">Top Suppliers</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={supplierAgg} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-3">Top Purchased Items</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={3} className="text-center py-4">Loading…</TableCell></TableRow>
                  : topItems.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">No data</TableCell></TableRow>
                  : topItems.map(t => (
                    <TableRow key={t.name}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-right">{fmt(t.qty)}</TableCell>
                      <TableCell className="text-right">{fmtINR(t.value)}</TableCell>
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

export default PurchaseReportPage;
