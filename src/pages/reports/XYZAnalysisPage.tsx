import React, { useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ReportShell from '@/components/reports/ReportShell';
import { Preset } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, readInventory, readInventoryHistory } from '@/lib/reports/invPurchHelpers';
import { monthlyDemandStats } from '@/lib/reports/phase2Helpers';

const CLS_COLORS: Record<string, string> = {
  X: 'hsl(var(--success))',
  Y: 'hsl(var(--warning))',
  Z: 'hsl(var(--destructive))',
};

const XYZAnalysisPage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [months, setMonths] = useState(6);
  const [search, setSearch] = useState('');
  const inventory = useMemo(() => readInventory(), []);
  const history = useMemo(() => readInventoryHistory(scope.storeId ?? undefined), [scope.storeId]);

  const rows = useMemo(() => inventory
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
    .map(i => {
      const stats = monthlyDemandStats(history, i.id, months);
      // X: CoV ≤ 0.25, Y: ≤ 0.5, Z: > 0.5
      const cls = stats.cov <= 0.25 ? 'X' : stats.cov <= 0.5 ? 'Y' : 'Z';
      const trend = stats.slope > 0.05 * stats.mean ? 'up' : stats.slope < -0.05 * stats.mean ? 'down' : 'flat';
      // Forecast next month via linear projection of last-month index.
      const forecast = Math.max(0, stats.mean + stats.slope * months);
      return {
        id: i.id, name: i.name, unit: i.unit,
        mean: stats.mean, std: stats.std, cov: stats.cov,
        buckets: stats.buckets, cls, trend, forecast,
      };
    })
    .filter(r => r.mean > 0)
    .sort((a, b) => a.cov - b.cov), [inventory, history, months, search]);

  const summary = ['X', 'Y', 'Z'].map(c => ({
    name: `Class ${c}`,
    count: rows.filter(r => r.cls === c).length,
    color: CLS_COLORS[c],
  }));

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="XYZ Inventory Analysis"
        subtitle="Demand stability classification"
        icon={<Activity className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        rightExtra={
          <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 months</SelectItem>
              <SelectItem value="6">6 months</SelectItem>
              <SelectItem value="12">12 months</SelectItem>
            </SelectContent>
          </Select>
        }
        buildPayload={() => ({
          title: 'XYZ Inventory Analysis',
          storeName: scope.storeName,
          kpis: summary.map(s => ({ label: s.name, value: s.count })),
          sections: [{
            title: 'Demand Stability',
            headers: ['Item', 'Avg Monthly Demand', 'Std Dev', 'CoV', 'Class', 'Trend', 'Forecast'],
            rows: rows.map(r => [r.name, fmt(r.mean), fmt(r.std), r.cov.toFixed(2), r.cls, r.trend, fmt(r.forecast)]),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {summary.map(s => (
            <Card key={s.name}><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{s.name}</div>
              <div className="text-lg font-bold" style={{ color: s.color }}>{s.count} items</div>
              <div className="text-xs text-muted-foreground">
                {s.name === 'Class X' ? 'Stable' : s.name === 'Class Y' ? 'Seasonal' : 'Irregular'}
              </div>
            </CardContent></Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Avg Monthly</TableHead>
                <TableHead className="text-right">Std Dev</TableHead>
                <TableHead className="text-right">CoV</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Trend</TableHead>
                <TableHead className="text-right">Forecast Next</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.slice(0, 500).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{fmt(r.mean)} {r.unit}</TableCell>
                    <TableCell className="text-right">{fmt(r.std)}</TableCell>
                    <TableCell className="text-right">{r.cov.toFixed(2)}</TableCell>
                    <TableCell><Badge style={{ backgroundColor: CLS_COLORS[r.cls], color: 'white' }}>{r.cls}</Badge></TableCell>
                    <TableCell>
                      {r.trend === 'up' ? <span className="inline-flex items-center gap-1 text-success text-xs"><TrendingUp className="w-3 h-3" />Rising</span> :
                        r.trend === 'down' ? <span className="inline-flex items-center gap-1 text-destructive text-xs"><TrendingDown className="w-3 h-3" />Falling</span> :
                        <span className="text-xs text-muted-foreground">Stable</span>}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{fmt(r.forecast)}</TableCell>
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

export default XYZAnalysisPage;
