import React, { useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { PackageCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, readInventory, readInventoryHistory } from '@/lib/reports/invPurchHelpers';
import { closingStockAt, rangeBounds } from '@/lib/reports/phase2Helpers';

const ClosingStockPage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [search, setSearch] = useState('');
  const range = presetToRange(preset, customRange);
  const { to } = rangeBounds(range);

  const inventory = useMemo(() => readInventory(), []);
  const history = useMemo(() => readInventoryHistory(scope.storeId ?? undefined), [scope.storeId]);

  const rows = useMemo(() => inventory
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
    .map(i => {
      const closingQty = closingStockAt(i, history, to);
      // Average cost: weighted average of purchase entries; fall back to costPerUnit
      let totalCost = 0, totalQty = 0;
      history.forEach(h => {
        if (h.inventoryId === i.id && h.type === 'purchase' && h.costPerUnit) {
          const q = Math.abs(h.quantity);
          totalCost += q * (h.costPerUnit || 0);
          totalQty += q;
        }
      });
      const avgCost = totalQty > 0 ? totalCost / totalQty : (i.costPerUnit || 0);
      return {
        id: i.id, name: i.name, unit: i.unit,
        closingQty,
        avgCost,
        currentCost: i.costPerUnit || 0,
        value: closingQty * avgCost,
      };
    }).sort((a, b) => b.value - a.value), [inventory, history, to, search]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalQty = rows.reduce((s, r) => s + r.closingQty, 0);

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Closing Stock Report"
        subtitle={`Stock levels as of ${range.to?.toLocaleDateString('en-IN')}`}
        icon={<PackageCheck className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        buildPayload={() => ({
          title: 'Closing Stock Report',
          storeName: scope.storeName,
          dateRange: range.to?.toLocaleDateString('en-IN') || '',
          kpis: [
            { label: 'Items', value: rows.length },
            { label: 'Closing Qty', value: fmt(totalQty) },
            { label: 'Closing Value', value: fmtINR(totalValue) },
          ],
          sections: [{
            title: 'Closing Stock',
            headers: ['Item', 'Closing Qty', 'Avg Cost', 'Current Cost', 'Value'],
            rows: rows.map(r => [r.name, `${fmt(r.closingQty)} ${r.unit}`, fmtINR(r.avgCost), fmtINR(r.currentCost), fmtINR(r.value)]),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Items</div><div className="text-lg font-bold">{rows.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Closing Qty</div><div className="text-lg font-bold">{fmt(totalQty)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Closing Value</div><div className="text-lg font-bold">{fmtINR(totalValue)}</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Closing Qty</TableHead>
                <TableHead className="text-right">Avg Cost</TableHead>
                <TableHead className="text-right">Current Cost</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.slice(0, 500).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{fmt(r.closingQty)} {r.unit}</TableCell>
                    <TableCell className="text-right">{fmtINR(r.avgCost)}</TableCell>
                    <TableCell className="text-right">{fmtINR(r.currentCost)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmtINR(r.value)}</TableCell>
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

export default ClosingStockPage;
