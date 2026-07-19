import React, { useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { PackagePlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ReportShell from '@/components/reports/ReportShell';
import { Preset } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, readInventory, readInventoryHistory } from '@/lib/reports/invPurchHelpers';
import { avgDailyConsumption } from '@/lib/reports/phase2Helpers';

const HOLDING_COST_PCT = 0.15; // 15% annualized carrying cost approximation

const OverstockPage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [idealDays, setIdealDays] = useState(30);
  const [search, setSearch] = useState('');
  const inventory = useMemo(() => readInventory(), []);
  const history = useMemo(() => readInventoryHistory(scope.storeId ?? undefined), [scope.storeId]);

  const rows = useMemo(() => {
    const lookback = 60;
    const from = Date.now() - lookback * 86400000;
    const to = Date.now();
    return inventory
      .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
      .map(i => {
        const avgDaily = avgDailyConsumption(history, i.id, from, to);
        const idealQty = avgDaily * idealDays;
        const excess = i.quantity - idealQty;
        const cost = i.costPerUnit || 0;
        const excessValue = Math.max(0, excess) * cost;
        const daysOfInv = avgDaily > 0 ? i.quantity / avgDaily : Infinity;
        const holdingCost = excessValue * HOLDING_COST_PCT * (daysOfInv / 365);
        const action = excess <= 0 ? 'ok' : excess > idealQty * 2 ? 'clearance' : excess > idealQty ? 'promotion' : 'reduce';
        return {
          id: i.id, name: i.name, unit: i.unit,
          current: i.quantity, idealQty, excess: Math.max(0, excess),
          value: i.quantity * cost, excessValue, holdingCost, daysOfInv, avgDaily, action,
        };
      })
      .filter(r => r.excess > 0)
      .sort((a, b) => b.excessValue - a.excessValue);
  }, [inventory, history, idealDays, search]);

  const totalExcess = rows.reduce((s, r) => s + r.excessValue, 0);
  const totalHolding = rows.reduce((s, r) => s + r.holdingCost, 0);

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Overstock Analysis"
        subtitle={`Items exceeding ${idealDays}-day ideal cover`}
        icon={<PackagePlus className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        rightExtra={
          <Select value={String(idealDays)} onValueChange={(v) => setIdealDays(Number(v))}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15-day cover</SelectItem>
              <SelectItem value="30">30-day cover</SelectItem>
              <SelectItem value="45">45-day cover</SelectItem>
              <SelectItem value="60">60-day cover</SelectItem>
              <SelectItem value="90">90-day cover</SelectItem>
            </SelectContent>
          </Select>
        }
        buildPayload={() => ({
          title: 'Overstock Analysis',
          storeName: scope.storeName,
          kpis: [
            { label: 'Overstocked Items', value: rows.length },
            { label: 'Excess Value', value: fmtINR(totalExcess) },
            { label: 'Est. Holding Cost', value: fmtINR(totalHolding) },
          ],
          sections: [{
            title: 'Overstock Recommendations',
            headers: ['Item', 'Current Qty', 'Ideal Qty', 'Excess', 'Value', 'Excess Value', 'Days of Inv', 'Action'],
            rows: rows.map(r => [r.name, fmt(r.current), fmt(r.idealQty), fmt(r.excess), fmtINR(r.value), fmtINR(r.excessValue), isFinite(r.daysOfInv) ? fmt(r.daysOfInv) : '∞', r.action]),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Overstocked Items</div><div className="text-lg font-bold text-warning">{rows.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Excess Value</div><div className="text-lg font-bold text-destructive">{fmtINR(totalExcess)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Est. Holding Cost</div><div className="text-lg font-bold">{fmtINR(totalHolding)}</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Ideal</TableHead>
                <TableHead className="text-right">Excess</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Excess Value</TableHead>
                <TableHead className="text-right">Days of Inv</TableHead>
                <TableHead>Action</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No overstock detected</TableCell></TableRow>
                  : rows.slice(0, 500).map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">{fmt(r.current)} {r.unit}</TableCell>
                      <TableCell className="text-right">{fmt(r.idealQty)}</TableCell>
                      <TableCell className="text-right font-semibold text-warning">{fmt(r.excess)}</TableCell>
                      <TableCell className="text-right">{fmtINR(r.value)}</TableCell>
                      <TableCell className="text-right text-destructive">{fmtINR(r.excessValue)}</TableCell>
                      <TableCell className="text-right">{isFinite(r.daysOfInv) ? fmt(r.daysOfInv) : '∞'}</TableCell>
                      <TableCell>
                        <Badge variant={r.action === 'clearance' ? 'destructive' : r.action === 'promotion' ? 'secondary' : 'default'}>
                          {r.action === 'clearance' ? 'Clearance' : r.action === 'promotion' ? 'Promotion' : 'Reduce Purchase'}
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

export default OverstockPage;
