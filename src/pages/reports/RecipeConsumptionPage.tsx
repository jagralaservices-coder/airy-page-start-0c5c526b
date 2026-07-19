import React, { useMemo, useState } from 'react';
import { DateRange } from 'react-day-picker';
import { ChefHat, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, inRange, readInventory, readInventoryHistory } from '@/lib/reports/invPurchHelpers';
import { usePOS } from '@/contexts/POSContext';

interface RecipeRowData {
  id: string; recipe: string; qtySold: number; revenue: number; recipeCost: number;
  foodCostPct: number; profit: number;
  ingredients: { name: string; qty: number; unit: string; cost: number }[];
}
const RecipeRow: React.FC<{ r: RecipeRowData }> = ({ r }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setOpen(o => !o)}>
        <TableCell>
          <div className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted">
            <ChevronRight className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} />
          </div>
        </TableCell>
        <TableCell className="font-medium">{r.recipe}</TableCell>
        <TableCell className="text-right">{fmt(r.qtySold)}</TableCell>
        <TableCell className="text-right">{fmtINR(r.revenue)}</TableCell>
        <TableCell className="text-right">{fmtINR(r.recipeCost)}</TableCell>
        <TableCell className="text-right">{r.foodCostPct.toFixed(1)}%</TableCell>
        <TableCell className="text-right font-semibold">{fmtINR(r.profit)}</TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 p-3">
            <div className="text-xs font-semibold mb-1">Ingredients Consumed</div>
            <table className="w-full text-xs">
              <tbody>
                {r.ingredients.map((ing, idx) => (
                  <tr key={idx}>
                    <td className="py-0.5">{ing.name}</td>
                    <td className="text-right py-0.5">{fmt(ing.qty)} {ing.unit}</td>
                    <td className="text-right py-0.5 w-24">{fmtINR(ing.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};


const RecipeConsumptionPage: React.FC = () => {
  const scope = useReportScope();
  const { orders } = usePOS();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [search, setSearch] = useState('');
  const range = presetToRange(preset, customRange);
  const inventory = useMemo(() => readInventory(), []);
  const history = useMemo(() => readInventoryHistory(scope.storeId ?? undefined), [scope.storeId]);

  const rows = useMemo(() => {
    // Group inventory usage by menuItemId
    const map = new Map<string, {
      recipe: string;
      qtySold: number;
      revenue: number;
      recipeCost: number;
      ingredients: Map<string, { name: string; qty: number; unit: string; cost: number }>;
    }>();
    history.filter(h => h.type === 'usage' && h.menuItemId && inRange(h.createdAt, range)).forEach(h => {
      const invItem = inventory.find(i => i.id === h.inventoryId);
      const cost = invItem?.costPerUnit || 0;
      const key = h.menuItemId!;
      const cur = map.get(key) || {
        recipe: h.menuItemName || 'Unknown',
        qtySold: 0, revenue: 0, recipeCost: 0,
        ingredients: new Map(),
      };
      const qty = Math.abs(h.quantity);
      cur.recipeCost += qty * cost;
      const ing = cur.ingredients.get(h.inventoryId) || { name: h.inventoryName, qty: 0, unit: h.unit, cost: 0 };
      ing.qty += qty; ing.cost += qty * cost;
      cur.ingredients.set(h.inventoryId, ing);
      map.set(key, cur);
    });
    // Fill qtySold + revenue from orders
    orders?.forEach(o => {
      if (!inRange(new Date(o.createdAt).toISOString(), range)) return;
      if (o.status === 'cancelled') return;
      o.items.forEach(it => {
        const r = map.get(it.id);
        if (r) { r.qtySold += it.quantity; r.revenue += it.price * it.quantity; }
      });
    });
    return Array.from(map.entries())
      .filter(([, v]) => !search || v.recipe.toLowerCase().includes(search.toLowerCase()))
      .map(([id, v]) => ({
        id, ...v,
        foodCostPct: v.revenue > 0 ? (v.recipeCost / v.revenue) * 100 : 0,
        profit: v.revenue - v.recipeCost,
        ingredients: Array.from(v.ingredients.values()),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [history, inventory, orders, range, search]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCost = rows.reduce((s, r) => s + r.recipeCost, 0);

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Recipe Consumption"
        subtitle="Recipe cost, food cost, and profitability"
        icon={<ChefHat className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        buildPayload={() => ({
          title: 'Recipe Consumption Report',
          storeName: scope.storeName,
          dateRange: `${range.from?.toLocaleDateString('en-IN')} - ${range.to?.toLocaleDateString('en-IN')}`,
          kpis: [
            { label: 'Recipes Sold', value: rows.length },
            { label: 'Revenue', value: fmtINR(totalRevenue) },
            { label: 'Recipe Cost', value: fmtINR(totalCost) },
            { label: 'Profit', value: fmtINR(totalRevenue - totalCost) },
          ],
          sections: [{
            title: 'By Recipe',
            headers: ['Recipe', 'Qty Sold', 'Revenue', 'Recipe Cost', 'Food Cost %', 'Profit'],
            rows: rows.map(r => [r.recipe, fmt(r.qtySold), fmtINR(r.revenue), fmtINR(r.recipeCost), r.foodCostPct.toFixed(1) + '%', fmtINR(r.profit)]),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Recipes Sold</div><div className="text-lg font-bold">{rows.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Revenue</div><div className="text-lg font-bold">{fmtINR(totalRevenue)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Recipe Cost</div><div className="text-lg font-bold text-destructive">{fmtINR(totalCost)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Profit</div><div className="text-lg font-bold text-success">{fmtINR(totalRevenue - totalCost)}</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Recipe</TableHead>
                  <TableHead className="text-right">Qty Sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Recipe Cost</TableHead>
                  <TableHead className="text-right">Food Cost %</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No recipe consumption in this range</TableCell></TableRow>
                  : rows.map(r => <RecipeRow key={r.id} r={r} />)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RecipeConsumptionPage;
