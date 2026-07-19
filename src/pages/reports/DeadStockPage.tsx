import React, { useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { Ghost } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, readInventory, readInventoryHistory } from '@/lib/reports/invPurchHelpers';
import { lastDatesFor, daysSince } from '@/lib/reports/phase2Helpers';

const DeadStockPage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [thresholdDays, setThresholdDays] = useState(60);
  const [sortBy, setSortBy] = useState<'value' | 'age'>('value');
  const [search, setSearch] = useState('');
  const inventory = useMemo(() => readInventory(), []);
  const history = useMemo(() => readInventoryHistory(scope.storeId ?? undefined), [scope.storeId]);

  const rows = useMemo(() => inventory
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
    .map(i => {
      const d = lastDatesFor(history, i.id);
      const cutoff = Date.now() - thresholdDays * 86400000;
      const lastAnyT = d.lastAny ? new Date(d.lastAny).getTime() : 0;
      const dead = lastAnyT < cutoff && i.quantity > 0;
      const idle = d.lastAny ? daysSince(d.lastAny)! : Math.floor((Date.now() - new Date(i.lastUpdated).getTime()) / 86400000);
      return dead ? {
        id: i.id, name: i.name, unit: i.unit,
        stock: i.quantity, value: i.quantity * (i.costPerUnit || 0),
        idle, lastSale: d.lastSale, lastPurchase: d.lastPurchase, lastMovement: d.lastAny,
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => sortBy === 'value' ? (b!.value - a!.value) : (b!.idle - a!.idle)) as any[],
    [inventory, history, thresholdDays, sortBy, search]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Dead Stock Report"
        subtitle={`Items with no movement > ${thresholdDays} days`}
        icon={<Ghost className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        rightExtra={
          <>
            <Select value={String(thresholdDays)} onValueChange={(v) => setThresholdDays(Number(v))}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30+ days</SelectItem>
                <SelectItem value="60">60+ days</SelectItem>
                <SelectItem value="90">90+ days</SelectItem>
                <SelectItem value="180">180+ days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="value">Highest Dead Value</SelectItem>
                <SelectItem value="age">Longest Dead Period</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        buildPayload={() => ({
          title: `Dead Stock (>${thresholdDays}d)`,
          storeName: scope.storeName,
          kpis: [
            { label: 'Dead Items', value: rows.length },
            { label: 'Dead Value', value: fmtINR(totalValue) },
          ],
          sections: [{
            title: 'Dead Stock',
            headers: ['Item', 'Stock', 'Value', 'Idle (d)', 'Last Sale', 'Last Purchase'],
            rows: rows.map(r => [r.name, `${fmt(r.stock)} ${r.unit}`, fmtINR(r.value), r.idle,
              r.lastSale ? new Date(r.lastSale).toLocaleDateString('en-IN') : '—',
              r.lastPurchase ? new Date(r.lastPurchase).toLocaleDateString('en-IN') : '—']),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Dead Items</div><div className="text-lg font-bold text-destructive">{rows.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Dead Value</div><div className="text-lg font-bold text-destructive">{fmtINR(totalValue)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Threshold</div><div className="text-lg font-bold">{thresholdDays} days</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Idle (d)</TableHead>
                <TableHead>Last Sale</TableHead>
                <TableHead>Last Purchase</TableHead>
                <TableHead>Last Movement</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No dead stock detected</TableCell></TableRow>
                  : rows.slice(0, 500).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">{fmt(r.stock)} {r.unit}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{fmtINR(r.value)}</TableCell>
                      <TableCell className="text-right">{r.idle}</TableCell>
                      <TableCell className="text-xs">{r.lastSale ? new Date(r.lastSale).toLocaleDateString('en-IN') : '—'}</TableCell>
                      <TableCell className="text-xs">{r.lastPurchase ? new Date(r.lastPurchase).toLocaleDateString('en-IN') : '—'}</TableCell>
                      <TableCell className="text-xs">{r.lastMovement ? new Date(r.lastMovement).toLocaleDateString('en-IN') : '—'}</TableCell>
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

export default DeadStockPage;
