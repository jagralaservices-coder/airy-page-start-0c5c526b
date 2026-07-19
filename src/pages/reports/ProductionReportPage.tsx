import React, { useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { Factory } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, inRange, readInventory, readInventoryHistory } from '@/lib/reports/invPurchHelpers';

const ProductionReportPage: React.FC = () => {
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [search, setSearch] = useState('');
  const range = presetToRange(preset, customRange);
  const inventory = useMemo(() => readInventory(), []);
  const history = useMemo(() => readInventoryHistory(scope.storeId ?? undefined), [scope.storeId]);

  const rows = useMemo(() => {
    return history
      .filter(h => h.type === 'production' && inRange(h.createdAt, range))
      .filter(h => !search || h.inventoryName.toLowerCase().includes(search.toLowerCase()))
      .map(h => {
        const invItem = inventory.find(i => i.id === h.inventoryId);
        const consumedQty = (h.producedFrom || []).reduce((s, c) => s + c.quantity, 0);
        const productionCost = (h.producedFrom || []).reduce((s, c) => {
          const raw = inventory.find(i => i.name === c.name);
          return s + c.quantity * (raw?.costPerUnit || 0);
        }, 0);
        return {
          id: h.id,
          recipe: h.inventoryName,
          batch: h.id.slice(0, 8),
          producedQty: h.quantity,
          producedUnit: h.unit,
          consumedQty,
          productionCost,
          date: h.createdAt,
          by: h.createdBy || '—',
          components: h.producedFrom || [],
          costPerUnit: invItem?.costPerUnit || 0,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [history, inventory, range, search]);

  const totalProduced = rows.reduce((s, r) => s + r.producedQty, 0);
  const totalCost = rows.reduce((s, r) => s + r.productionCost, 0);

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Production Report"
        subtitle="Batch production and cost tracking"
        icon={<Factory className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        buildPayload={() => ({
          title: 'Production Report',
          storeName: scope.storeName,
          dateRange: `${range.from?.toLocaleDateString('en-IN')} - ${range.to?.toLocaleDateString('en-IN')}`,
          kpis: [
            { label: 'Batches', value: rows.length },
            { label: 'Produced', value: fmt(totalProduced) },
            { label: 'Production Cost', value: fmtINR(totalCost) },
          ],
          sections: [{
            title: 'Production Batches',
            headers: ['Date', 'Recipe', 'Batch', 'Produced', 'Consumed', 'Cost', 'By'],
            rows: rows.map(r => [new Date(r.date).toLocaleString('en-IN'), r.recipe, r.batch, `${fmt(r.producedQty)} ${r.producedUnit}`, fmt(r.consumedQty), fmtINR(r.productionCost), r.by]),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Batches</div><div className="text-lg font-bold">{rows.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Produced</div><div className="text-lg font-bold">{fmt(totalProduced)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Production Cost</div><div className="text-lg font-bold">{fmtINR(totalCost)}</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Recipe</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">Produced</TableHead>
                  <TableHead>Components Used</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No production in this range</TableCell></TableRow>
                  : rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{new Date(r.date).toLocaleString('en-IN')}</TableCell>
                      <TableCell className="font-medium">{r.recipe}</TableCell>
                      <TableCell className="text-xs font-mono">{r.batch}</TableCell>
                      <TableCell className="text-right">{fmt(r.producedQty)} {r.producedUnit}</TableCell>
                      <TableCell className="text-xs">
                        {r.components.map((c, i) => (
                          <div key={i} className="text-muted-foreground">{c.name}: {fmt(c.quantity)} {c.unit}</div>
                        ))}
                      </TableCell>
                      <TableCell className="text-right">{fmtINR(r.productionCost)}</TableCell>
                      <TableCell className="text-xs">{r.by}</TableCell>
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

export default ProductionReportPage;
