import React, { useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { PieChart as PieIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, inRange, readInventory, readInventoryHistory } from '@/lib/reports/invPurchHelpers';

const CLASS_COLORS: Record<string, string> = {
  A: 'hsl(var(--success))',
  B: 'hsl(var(--warning))',
  C: 'hsl(var(--destructive))',
};

const ABCAnalysisPage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [search, setSearch] = useState('');
  const range = presetToRange(preset, customRange);
  const inventory = useMemo(() => readInventory(), []);
  const history = useMemo(() => readInventoryHistory(scope.storeId ?? undefined), [scope.storeId]);

  const rows = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    history.filter(h => h.type === 'usage' && inRange(h.createdAt, range)).forEach(h => {
      const raw = inventory.find(i => i.id === h.inventoryId);
      const cost = raw?.costPerUnit || 0;
      const q = Math.abs(h.quantity);
      const cur = map.get(h.inventoryId) || { name: h.inventoryName, qty: 0, revenue: 0 };
      cur.qty += q;
      cur.revenue += q * cost;
      map.set(h.inventoryId, cur);
    });
    const list = Array.from(map.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.revenue - a.revenue);
    const total = list.reduce((s, r) => s + r.revenue, 0);
    let cum = 0;
    return list.map(r => {
      cum += r.revenue;
      const cumPct = total > 0 ? (cum / total) * 100 : 0;
      const contrib = total > 0 ? (r.revenue / total) * 100 : 0;
      const cls = cumPct <= 70 ? 'A' : cumPct <= 90 ? 'B' : 'C';
      return { ...r, contrib, cumPct, cls };
    }).filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));
  }, [history, inventory, range, search]);

  const summary = ['A', 'B', 'C'].map(c => ({
    name: `Class ${c}`,
    count: rows.filter(r => r.cls === c).length,
    value: rows.filter(r => r.cls === c).reduce((s, r) => s + r.revenue, 0),
    color: CLASS_COLORS[c],
  }));

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="ABC Inventory Analysis"
        subtitle="Pareto classification by revenue contribution"
        icon={<PieIcon className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        buildPayload={() => ({
          title: 'ABC Inventory Analysis',
          storeName: scope.storeName,
          dateRange: `${range.from?.toLocaleDateString('en-IN')} - ${range.to?.toLocaleDateString('en-IN')}`,
          kpis: summary.map(s => ({ label: s.name, value: `${s.count} · ${fmtINR(s.value)}` })),
          sections: [{
            title: 'ABC Breakdown',
            headers: ['Item', 'Revenue', 'Contribution %', 'Cumulative %', 'Class'],
            rows: rows.map(r => [r.name, fmtINR(r.revenue), r.contrib.toFixed(1) + '%', r.cumPct.toFixed(1) + '%', r.cls]),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {summary.map(s => (
            <Card key={s.name}><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{s.name}</div>
              <div className="text-lg font-bold" style={{ color: s.color }}>{s.count} items</div>
              <div className="text-xs">{fmtINR(s.value)}</div>
            </CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card><CardContent className="p-4">
            <div className="text-sm font-semibold mb-3">Class Distribution</div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={summary} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} label>
                  {summary.map((s) => <Cell key={s.name} fill={s.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtINR(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-sm font-semibold mb-3">Top 10 by Revenue</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rows.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => fmtINR(v)} />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Consumption</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Contribution %</TableHead>
                <TableHead className="text-right">Cumulative %</TableHead>
                <TableHead>Class</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.slice(0, 500).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{fmt(r.qty)}</TableCell>
                    <TableCell className="text-right">{fmtINR(r.revenue)}</TableCell>
                    <TableCell className="text-right">{r.contrib.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{r.cumPct.toFixed(1)}%</TableCell>
                    <TableCell>
                      <Badge style={{ backgroundColor: CLASS_COLORS[r.cls], color: 'white' }}>{r.cls}</Badge>
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

export default ABCAnalysisPage;
