import React, { useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, readInventory, readInventoryHistory } from '@/lib/reports/invPurchHelpers';
import { openingStockAt, closingStockAt, rangeBounds, netMovement } from '@/lib/reports/phase2Helpers';

const InventoryTurnoverPage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [search, setSearch] = useState('');
  const range = presetToRange(preset, customRange);
  const { from, to } = rangeBounds(range);
  const days = Math.max(1, Math.round((to - from) / 86400000));

  const inventory = useMemo(() => readInventory(), []);
  const history = useMemo(() => readInventoryHistory(scope.storeId ?? undefined), [scope.storeId]);

  const rows = useMemo(() => inventory
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
    .map(i => {
      const opening = openingStockAt(i, history, from);
      const closing = closingStockAt(i, history, to);
      const avg = (opening + closing) / 2;
      // COGS proxy = usage qty × cost within range
      let usedQty = 0;
      history.forEach(h => {
        if (h.inventoryId === i.id && h.type === 'usage') {
          const t = new Date(h.createdAt).getTime();
          if (t >= from && t <= to) usedQty += Math.abs(h.quantity);
        }
      });
      const cost = i.costPerUnit || 0;
      const cogs = usedQty * cost;
      const avgInvValue = avg * cost;
      const turnover = avgInvValue > 0 ? cogs / avgInvValue : 0;
      const daysInInv = turnover > 0 ? days / turnover : Infinity;
      return { id: i.id, name: i.name, unit: i.unit, cogs, avgInv: avg, avgInvValue, turnover, daysInInv, usedQty };
    })
    .filter(r => r.avgInv > 0 || r.usedQty > 0)
    .sort((a, b) => b.turnover - a.turnover), [inventory, history, from, to, days, search]);

  const speed = (t: number) => t >= 4 ? 'fast' : t >= 1 ? 'normal' : 'slow';

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Inventory Turnover"
        subtitle="COGS / Average Inventory"
        icon={<RefreshCw className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        buildPayload={() => ({
          title: 'Inventory Turnover Report',
          storeName: scope.storeName,
          dateRange: `${range.from?.toLocaleDateString('en-IN')} - ${range.to?.toLocaleDateString('en-IN')}`,
          kpis: [
            { label: 'Items', value: rows.length },
            { label: 'Fast', value: rows.filter(r => speed(r.turnover) === 'fast').length },
            { label: 'Slow', value: rows.filter(r => speed(r.turnover) === 'slow').length },
          ],
          sections: [{
            title: 'Turnover by Item',
            headers: ['Item', 'COGS', 'Avg Inventory', 'Avg Value', 'Turnover', 'Days in Inv'],
            rows: rows.map(r => [r.name, fmtINR(r.cogs), fmt(r.avgInv), fmtINR(r.avgInvValue), r.turnover.toFixed(2), isFinite(r.daysInInv) ? fmt(r.daysInInv) : '∞']),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Items Tracked</div><div className="text-lg font-bold">{rows.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Fast Movers</div><div className="text-lg font-bold text-success">{rows.filter(r => speed(r.turnover) === 'fast').length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Slow Movers</div><div className="text-lg font-bold text-destructive">{rows.filter(r => speed(r.turnover) === 'slow').length}</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Avg Inventory</TableHead>
                <TableHead className="text-right">Turnover</TableHead>
                <TableHead className="text-right">Days in Inv</TableHead>
                <TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.slice(0, 500).map(r => {
                  const s = speed(r.turnover);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">{fmtINR(r.cogs)}</TableCell>
                      <TableCell className="text-right">{fmt(r.avgInv)} {r.unit}</TableCell>
                      <TableCell className="text-right font-semibold">{r.turnover.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{isFinite(r.daysInInv) ? fmt(r.daysInInv) : '∞'}</TableCell>
                      <TableCell>
                        <Badge variant={s === 'fast' ? 'default' : s === 'slow' ? 'destructive' : 'secondary'}>{s.toUpperCase()}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default InventoryTurnoverPage;
