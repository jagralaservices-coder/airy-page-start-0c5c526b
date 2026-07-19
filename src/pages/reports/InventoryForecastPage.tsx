import React, { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ReportShell from '@/components/reports/ReportShell';
import { Preset } from '@/lib/reports/timeRanges';
import { DateRange } from 'react-day-picker';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, readInventory, readInventoryHistory } from '@/lib/reports/invPurchHelpers';

const HORIZONS = [7, 15, 30, 60, 90];

const InventoryForecastPage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [horizon, setHorizon] = useState(30);
  const [search, setSearch] = useState('');

  const inventory = useMemo(() => readInventory(), []);
  const history = useMemo(() => readInventoryHistory(scope.storeId ?? undefined), [scope.storeId]);

  const forecast = useMemo(() => {
    // Compute avg daily consumption from last 30 days of usage
    const lookback = 30;
    const cutoff = Date.now() - lookback * 86400000;
    const consumption = new Map<string, number>();
    history.filter(h => h.type === 'usage' && new Date(h.createdAt).getTime() >= cutoff)
      .forEach(h => consumption.set(h.inventoryId, (consumption.get(h.inventoryId) || 0) + Math.abs(h.quantity)));

    return inventory
      .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
      .map(i => {
        const totalUsed = consumption.get(i.id) || 0;
        const avgDaily = totalUsed / lookback;
        const daysLeft = avgDaily > 0 ? i.quantity / avgDaily : Infinity;
        const stockOutDate = avgDaily > 0 ? new Date(Date.now() + daysLeft * 86400000) : null;
        const expectedConsumption = avgDaily * horizon;
        const recommendedPurchase = Math.max(0, expectedConsumption + i.minStock - i.quantity);
        const reorderDate = avgDaily > 0 && i.minStock > 0
          ? new Date(Date.now() + Math.max(0, (i.quantity - i.minStock) / avgDaily) * 86400000)
          : null;
        return {
          id: i.id, name: i.name, unit: i.unit, current: i.quantity,
          avgDaily, expectedConsumption, recommendedPurchase, stockOutDate, reorderDate,
          value: recommendedPurchase * (i.costPerUnit || 0),
          daysLeft,
        };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [inventory, history, horizon, search]);

  const stockOuts = forecast.filter(f => f.daysLeft <= horizon).length;
  const totalPurchaseValue = forecast.reduce((s, f) => s + f.value, 0);

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Inventory Forecast"
        subtitle="Predicted consumption and reorder planning"
        icon={<Sparkles className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        rightExtra={
          <Select value={String(horizon)} onValueChange={(v) => setHorizon(Number(v))}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {HORIZONS.map(h => <SelectItem key={h} value={String(h)}>{h} Days</SelectItem>)}
            </SelectContent>
          </Select>
        }
        buildPayload={() => ({
          title: `Inventory Forecast (${horizon} days)`,
          storeName: scope.storeName,
          kpis: [
            { label: 'Items at Risk', value: stockOuts },
            { label: 'Est. Purchase Value', value: fmtINR(totalPurchaseValue) },
            { label: 'Horizon', value: `${horizon} days` },
          ],
          sections: [{
            title: 'Forecast',
            headers: ['Item', 'Current', 'Avg/Day', 'Expected Consumption', 'Recommended Purchase', 'Stock Out Date', 'Reorder Date'],
            rows: forecast.map(f => [
              f.name, fmt(f.current), fmt(f.avgDaily), fmt(f.expectedConsumption), fmt(f.recommendedPurchase),
              f.stockOutDate ? f.stockOutDate.toLocaleDateString('en-IN') : '—',
              f.reorderDate ? f.reorderDate.toLocaleDateString('en-IN') : '—',
            ]),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Horizon</div><div className="text-lg font-bold">{horizon} days</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Items at Risk</div><div className="text-lg font-bold text-destructive">{stockOuts}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Est. Purchase Value</div><div className="text-lg font-bold">{fmtINR(totalPurchaseValue)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Items Tracked</div><div className="text-lg font-bold">{forecast.length}</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Avg/Day</TableHead>
                  <TableHead className="text-right">Expected Use</TableHead>
                  <TableHead className="text-right">Recommended</TableHead>
                  <TableHead>Stock Out</TableHead>
                  <TableHead>Reorder By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecast.slice(0, 300).map(f => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="text-right">{fmt(f.current)} {f.unit}</TableCell>
                    <TableCell className="text-right">{fmt(f.avgDaily)}</TableCell>
                    <TableCell className="text-right">{fmt(f.expectedConsumption)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(f.recommendedPurchase)}</TableCell>
                    <TableCell>
                      {f.stockOutDate ? (
                        <Badge variant={f.daysLeft <= horizon ? 'destructive' : 'secondary'}>
                          {f.stockOutDate.toLocaleDateString('en-IN')}
                        </Badge>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">{f.reorderDate ? f.reorderDate.toLocaleDateString('en-IN') : '—'}</TableCell>
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

export default InventoryForecastPage;
