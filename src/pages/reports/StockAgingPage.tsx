import React, { useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { Hourglass } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, readInventory, readInventoryHistory } from '@/lib/reports/invPurchHelpers';
import { lastDatesFor, daysSince, bucketAge } from '@/lib/reports/phase2Helpers';

const StockAgingPage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [search, setSearch] = useState('');
  const inventory = useMemo(() => readInventory(), []);
  const history = useMemo(() => readInventoryHistory(scope.storeId ?? undefined), [scope.storeId]);

  const rows = useMemo(() => inventory
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
    .map(i => {
      const d = lastDatesFor(history, i.id);
      const age = daysSince(d.lastAny) ?? daysSince(new Date(i.lastUpdated).toISOString());
      const bucket = bucketAge(age);
      return {
        id: i.id, name: i.name, unit: i.unit,
        stock: i.quantity,
        value: i.quantity * (i.costPerUnit || 0),
        age: age ?? 0,
        bucket,
        lastMovement: d.lastAny,
        lastSale: d.lastSale,
        lastPurchase: d.lastPurchase,
      };
    })
    .filter(r => r.stock > 0)
    .sort((a, b) => b.age - a.age), [inventory, history, search]);

  const buckets = ['0-30', '31-60', '61-90', '91-180', '180+', 'never'] as const;
  const bucketCounts = buckets.map(b => ({
    label: b === 'never' ? 'No Movement' : b + ' d',
    key: b,
    count: rows.filter(r => r.bucket === b).length,
    value: rows.filter(r => r.bucket === b).reduce((s, r) => s + r.value, 0),
  }));

  const bucketVariant = (b: string) =>
    b === '0-30' ? 'default' :
    b === '31-60' ? 'secondary' :
    b === '61-90' ? 'secondary' :
    b === '91-180' ? 'destructive' : 'destructive';

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Stock Aging Report"
        subtitle="Age of on-hand stock by last movement"
        icon={<Hourglass className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        buildPayload={() => ({
          title: 'Stock Aging Report',
          storeName: scope.storeName,
          kpis: bucketCounts.map(b => ({ label: b.label, value: `${b.count} · ${fmtINR(b.value)}` })),
          sections: [{
            title: 'Aging by Item',
            headers: ['Item', 'Stock', 'Age (Days)', 'Bucket', 'Last Movement', 'Last Sale', 'Last Purchase', 'Value'],
            rows: rows.map(r => [
              r.name, `${fmt(r.stock)} ${r.unit}`, r.age, r.bucket,
              r.lastMovement ? new Date(r.lastMovement).toLocaleDateString('en-IN') : '—',
              r.lastSale ? new Date(r.lastSale).toLocaleDateString('en-IN') : '—',
              r.lastPurchase ? new Date(r.lastPurchase).toLocaleDateString('en-IN') : '—',
              fmtINR(r.value),
            ]),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {bucketCounts.map(b => (
            <Card key={b.key}><CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{b.label}</div>
              <div className="text-lg font-bold">{b.count}</div>
              <div className="text-xs">{fmtINR(b.value)}</div>
            </CardContent></Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Age (d)</TableHead>
                <TableHead>Bucket</TableHead>
                <TableHead>Last Movement</TableHead>
                <TableHead>Last Sale</TableHead>
                <TableHead>Last Purchase</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.slice(0, 500).map(r => (
                  <TableRow key={r.id} className={r.bucket === '180+' || r.bucket === 'never' ? 'bg-destructive/5' : ''}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{fmt(r.stock)} {r.unit}</TableCell>
                    <TableCell className="text-right font-semibold">{r.age}</TableCell>
                    <TableCell><Badge variant={bucketVariant(r.bucket)}>{r.bucket}</Badge></TableCell>
                    <TableCell className="text-xs">{r.lastMovement ? new Date(r.lastMovement).toLocaleDateString('en-IN') : '—'}</TableCell>
                    <TableCell className="text-xs">{r.lastSale ? new Date(r.lastSale).toLocaleDateString('en-IN') : '—'}</TableCell>
                    <TableCell className="text-xs">{r.lastPurchase ? new Date(r.lastPurchase).toLocaleDateString('en-IN') : '—'}</TableCell>
                    <TableCell className="text-right">{fmtINR(r.value)}</TableCell>
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

export default StockAgingPage;
