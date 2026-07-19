import React, { useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, inRange, readInventory, readInventoryHistory, daysBetween } from '@/lib/reports/invPurchHelpers';

const StockConsumptionPage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [search, setSearch] = useState('');
  const range = presetToRange(preset, customRange);

  const inventory = useMemo(() => readInventory(), []);
  const history = useMemo(() => readInventoryHistory(scope.storeId ?? undefined), [scope.storeId]);
  const days = range.from && range.to ? daysBetween(range.from, range.to) : 1;

  const rows = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; qty: number; value: number; byDay: Map<string, number> }>();
    history.filter(h => h.type === 'usage' && inRange(h.createdAt, range))
      .forEach(h => {
        const invItem = inventory.find(i => i.id === h.inventoryId);
        const cost = invItem?.costPerUnit || 0;
        const cur = map.get(h.inventoryId) || { name: h.inventoryName, unit: h.unit, qty: 0, value: 0, byDay: new Map() };
        const qty = Math.abs(h.quantity);
        cur.qty += qty;
        cur.value += qty * cost;
        const dayKey = new Date(h.createdAt).toDateString();
        cur.byDay.set(dayKey, (cur.byDay.get(dayKey) || 0) + qty);
        map.set(h.inventoryId, cur);
      });
    return Array.from(map.entries())
      .filter(([, v]) => !search || v.name.toLowerCase().includes(search.toLowerCase()))
      .map(([id, v]) => {
        const daily = Array.from(v.byDay.values());
        const highest = daily.length ? Math.max(...daily) : 0;
        const lowest = daily.length ? Math.min(...daily) : 0;
        return {
          id, name: v.name, unit: v.unit, qty: v.qty, value: v.value,
          avgDaily: v.qty / days,
          avgWeekly: v.qty / days * 7,
          avgMonthly: v.qty / days * 30,
          highest, lowest,
        };
      })
      .sort((a, b) => b.qty - a.qty);
  }, [history, inventory, range, days, search]);

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Stock Consumption"
        subtitle="Item-level usage analytics"
        icon={<TrendingDown className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        buildPayload={() => ({
          title: 'Stock Consumption Report',
          storeName: scope.storeName,
          dateRange: `${range.from?.toLocaleDateString('en-IN')} - ${range.to?.toLocaleDateString('en-IN')}`,
          kpis: [
            { label: 'Items Consumed', value: rows.length },
            { label: 'Total Qty', value: fmt(totalQty) },
            { label: 'Consumption Value', value: fmtINR(totalValue) },
          ],
          sections: [{
            title: 'By Item',
            headers: ['Item', 'Qty', 'Value', 'Avg/Day', 'Avg/Week', 'Avg/Month', 'Highest Day', 'Lowest Day'],
            rows: rows.map(r => [r.name, fmt(r.qty), fmtINR(r.value), fmt(r.avgDaily), fmt(r.avgWeekly), fmt(r.avgMonthly), fmt(r.highest), fmt(r.lowest)]),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Items Consumed</div><div className="text-lg font-bold">{rows.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Qty</div><div className="text-lg font-bold">{fmt(totalQty)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Consumption Value</div><div className="text-lg font-bold">{fmtINR(totalValue)}</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Avg/Day</TableHead>
                  <TableHead className="text-right">Avg/Week</TableHead>
                  <TableHead className="text-right">Avg/Month</TableHead>
                  <TableHead className="text-right">High Day</TableHead>
                  <TableHead className="text-right">Low Day</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No consumption in this range</TableCell></TableRow>
                  : rows.slice(0, 500).map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">{fmt(r.qty)} {r.unit}</TableCell>
                      <TableCell className="text-right">{fmtINR(r.value)}</TableCell>
                      <TableCell className="text-right">{fmt(r.avgDaily)}</TableCell>
                      <TableCell className="text-right">{fmt(r.avgWeekly)}</TableCell>
                      <TableCell className="text-right">{fmt(r.avgMonthly)}</TableCell>
                      <TableCell className="text-right">{fmt(r.highest)}</TableCell>
                      <TableCell className="text-right">{fmt(r.lowest)}</TableCell>
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

export default StockConsumptionPage;
