import React, { useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { Utensils } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, inRange, readInventory, readInventoryHistory } from '@/lib/reports/invPurchHelpers';
import { usePOS } from '@/contexts/POSContext';

const FoodCostPage: React.FC = () => {
  const scope = useReportScope();
  const { orders, menuItems } = usePOS();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [search, setSearch] = useState('');
  const range = presetToRange(preset, customRange);
  const inventory = useMemo(() => readInventory(), []);
  const history = useMemo(() => readInventoryHistory(scope.storeId ?? undefined), [scope.storeId]);

  const rows = useMemo(() => {
    const costMap = new Map<string, number>(); // menuItemId → aggregate recipe cost
    const qtyMap = new Map<string, number>();
    const revenueMap = new Map<string, number>();

    history.filter(h => h.type === 'usage' && h.menuItemId && inRange(h.createdAt, range)).forEach(h => {
      const raw = inventory.find(i => i.id === h.inventoryId);
      const cost = raw?.costPerUnit || 0;
      const key = h.menuItemId!;
      costMap.set(key, (costMap.get(key) || 0) + Math.abs(h.quantity) * cost);
    });
    (orders || []).forEach(o => {
      if (o.status === 'cancelled') return;
      if (!inRange(new Date(o.createdAt).toISOString(), range)) return;
      o.items.forEach(it => {
        qtyMap.set(it.id, (qtyMap.get(it.id) || 0) + it.quantity);
        revenueMap.set(it.id, (revenueMap.get(it.id) || 0) + it.price * it.quantity);
      });
    });

    const list = (menuItems || [])
      .filter(mi => !search || mi.name.toLowerCase().includes(search.toLowerCase()))
      .map(mi => {
        const totalCost = costMap.get(mi.id) || 0;
        const qty = qtyMap.get(mi.id) || 0;
        const revenue = revenueMap.get(mi.id) || 0;
        const costPerPortion = qty > 0 ? totalCost / qty : 0;
        const grossProfit = revenue - totalCost;
        const foodCostPct = revenue > 0 ? (totalCost / revenue) * 100 : 0;
        const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
        return {
          id: mi.id, name: mi.name, category: (mi as any).category || '-',
          recipeCost: costPerPortion,
          sellPrice: mi.price,
          grossProfit, foodCostPct, margin,
          totalQty: qty, totalCost, revenue,
        };
      })
      .filter(r => r.totalQty > 0 || r.recipeCost > 0)
      .sort((a, b) => b.revenue - a.revenue);
    return list;
  }, [menuItems, orders, history, inventory, range, search]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
  const overall = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Food Cost Report"
        subtitle="Recipe cost, food cost %, margins"
        icon={<Utensils className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        buildPayload={() => ({
          title: 'Food Cost Report',
          storeName: scope.storeName,
          dateRange: `${range.from?.toLocaleDateString('en-IN')} - ${range.to?.toLocaleDateString('en-IN')}`,
          kpis: [
            { label: 'Revenue', value: fmtINR(totalRevenue) },
            { label: 'Cost', value: fmtINR(totalCost) },
            { label: 'Overall Food Cost %', value: overall.toFixed(1) + '%' },
          ],
          sections: [{
            title: 'By Menu Item',
            headers: ['Item', 'Recipe Cost', 'Sell Price', 'Qty Sold', 'Revenue', 'Total Cost', 'Gross Profit', 'Food Cost %', 'Margin %'],
            rows: rows.map(r => [r.name, fmtINR(r.recipeCost), fmtINR(r.sellPrice), fmt(r.totalQty), fmtINR(r.revenue), fmtINR(r.totalCost), fmtINR(r.grossProfit), r.foodCostPct.toFixed(1) + '%', r.margin.toFixed(1) + '%']),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Menu Items</div><div className="text-lg font-bold">{rows.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Revenue</div><div className="text-lg font-bold">{fmtINR(totalRevenue)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Cost</div><div className="text-lg font-bold text-destructive">{fmtINR(totalCost)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Food Cost %</div><div className={`text-lg font-bold ${overall > 35 ? 'text-destructive' : 'text-success'}`}>{overall.toFixed(1)}%</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Recipe Cost</TableHead>
                <TableHead className="text-right">Sell Price</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-right">Gross Profit</TableHead>
                <TableHead className="text-right">Food Cost %</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.slice(0, 500).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{fmtINR(r.recipeCost)}</TableCell>
                    <TableCell className="text-right">{fmtINR(r.sellPrice)}</TableCell>
                    <TableCell className="text-right">{fmt(r.totalQty)}</TableCell>
                    <TableCell className="text-right">{fmtINR(r.revenue)}</TableCell>
                    <TableCell className="text-right">{fmtINR(r.totalCost)}</TableCell>
                    <TableCell className="text-right font-semibold text-success">{fmtINR(r.grossProfit)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={r.foodCostPct > 40 ? 'destructive' : r.foodCostPct > 30 ? 'secondary' : 'default'}>
                        {r.foodCostPct.toFixed(1)}%
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

export default FoodCostPage;
