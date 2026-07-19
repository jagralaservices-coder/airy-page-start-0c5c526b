import React, { useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { PackageOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, readInventory, readInventoryHistory } from '@/lib/reports/invPurchHelpers';
import { openingStockAt, rangeBounds } from '@/lib/reports/phase2Helpers';

const OpeningStockPage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [search, setSearch] = useState('');
  const range = presetToRange(preset, customRange);
  const { from } = rangeBounds(range);

  const inventory = useMemo(() => readInventory(), []);
  const history = useMemo(() => readInventoryHistory(scope.storeId ?? undefined), [scope.storeId]);

  const rows = useMemo(() => inventory
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
    .map(i => {
      const openingQty = openingStockAt(i, history, from);
      return {
        id: i.id,
        name: i.name,
        unit: i.unit,
        openingQty,
        cost: i.costPerUnit || 0,
        value: openingQty * (i.costPerUnit || 0),
      };
    }).sort((a, b) => b.value - a.value), [inventory, history, from, search]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalQty = rows.reduce((s, r) => s + r.openingQty, 0);

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Opening Stock Report"
        subtitle={`Stock levels as of ${range.from?.toLocaleDateString('en-IN')}`}
        icon={<PackageOpen className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        buildPayload={() => ({
          title: 'Opening Stock Report',
          storeName: scope.storeName,
          dateRange: range.from?.toLocaleDateString('en-IN') || '',
          kpis: [
            { label: 'Items', value: rows.length },
            { label: 'Opening Qty', value: fmt(totalQty) },
            { label: 'Opening Value', value: fmtINR(totalValue) },
          ],
          sections: [{
            title: 'Opening Stock',
            headers: ['Item', 'Opening Qty', 'Unit', 'Cost/Unit', 'Value'],
            rows: rows.map(r => [r.name, fmt(r.openingQty), r.unit, fmtINR(r.cost), fmtINR(r.value)]),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Items</div><div className="text-lg font-bold">{rows.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Opening Qty</div><div className="text-lg font-bold">{fmt(totalQty)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Opening Value</div><div className="text-lg font-bold">{fmtINR(totalValue)}</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Opening Qty</TableHead>
                <TableHead className="text-right">Cost/Unit</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No inventory</TableCell></TableRow>
                  : rows.slice(0, 500).map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right">{fmt(r.openingQty)} {r.unit}</TableCell>
                      <TableCell className="text-right">{fmtINR(r.cost)}</TableCell>
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

export default OpeningStockPage;
