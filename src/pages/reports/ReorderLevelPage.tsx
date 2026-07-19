import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateRange } from 'react-day-picker';
import { AlertTriangle, ShoppingCart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ReportShell from '@/components/reports/ReportShell';
import { Preset, presetToRange } from '@/lib/reports/timeRanges';
import { useReportScope } from '@/lib/reports/scope';
import { fmt, fmtINR, readInventory, readInventoryHistory, stockStatus, inRange } from '@/lib/reports/invPurchHelpers';

const ReorderLevelPage: React.FC = () => {
  const navigate = useNavigate();
  const scope = useReportScope();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [sortBy, setSortBy] = useState<'lowest' | 'consumption'>('lowest');
  const [search, setSearch] = useState('');
  const range = presetToRange(preset, customRange);

  const inventory = useMemo(() => readInventory(), []);
  const history = useMemo(() => readInventoryHistory(scope.storeId ?? undefined), [scope.storeId]);

  const rows = useMemo(() => {
    const consumption = new Map<string, number>();
    history.filter(h => h.type === 'usage' && inRange(h.createdAt, range)).forEach(h => {
      consumption.set(h.inventoryId, (consumption.get(h.inventoryId) || 0) + Math.abs(h.quantity));
    });
    const list = inventory
      .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
      .map(i => {
        const status = stockStatus(i.quantity, i.minStock);
        return {
          id: i.id, name: i.name, unit: i.unit,
          current: i.quantity, min: i.minStock,
          required: Math.max(0, i.minStock - i.quantity),
          status,
          consumption: consumption.get(i.id) || 0,
          cost: i.costPerUnit || 0,
        };
      })
      .filter(r => r.status !== 'normal' || r.current <= r.min * 1.25);
    if (sortBy === 'consumption') list.sort((a, b) => b.consumption - a.consumption);
    else list.sort((a, b) => a.current - a.min - (b.current - b.min));
    return list;
  }, [inventory, history, range, sortBy, search]);

  const critical = rows.filter(r => r.status === 'critical').length;
  const low = rows.filter(r => r.status === 'low').length;
  const totalReorderValue = rows.reduce((s, r) => s + r.required * r.cost, 0);

  return (
    <div className="min-h-screen bg-background">
      <ReportShell
        title="Reorder Level Report"
        subtitle="Items at or below minimum stock"
        icon={<AlertTriangle className="w-4 h-4 text-primary" />}
        preset={preset} setPreset={setPreset}
        customRange={customRange} setCustomRange={setCustomRange}
        search={search} setSearch={setSearch}
        rightExtra={
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="h-8 w-52 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lowest">Lowest Stock First</SelectItem>
              <SelectItem value="consumption">Highest Consumption First</SelectItem>
            </SelectContent>
          </Select>
        }
        buildPayload={() => ({
          title: 'Reorder Level Report',
          storeName: scope.storeName,
          kpis: [
            { label: 'Critical', value: critical },
            { label: 'Low', value: low },
            { label: 'Est. Reorder Value', value: fmtINR(totalReorderValue) },
          ],
          sections: [{
            title: 'Items Needing Reorder',
            headers: ['Item', 'Unit', 'Current', 'Min', 'Required', 'Status', 'Consumption'],
            rows: rows.map(r => [r.name, r.unit, fmt(r.current), fmt(r.min), fmt(r.required), r.status, fmt(r.consumption)]),
          }],
        })}
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Critical</div><div className="text-lg font-bold text-destructive">{critical}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Low</div><div className="text-lg font-bold text-warning">{low}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Items Tracked</div><div className="text-lg font-bold">{inventory.length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Est. Reorder Value</div><div className="text-lg font-bold">{fmtINR(totalReorderValue)}</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                  <TableHead className="text-right">Required</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Consumption</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">All stock levels healthy</TableCell></TableRow>
                ) : rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right">{fmt(r.current)} {r.unit}</TableCell>
                    <TableCell className="text-right">{fmt(r.min)} {r.unit}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(r.required)} {r.unit}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'critical' ? 'destructive' : r.status === 'low' ? 'secondary' : 'default'}>
                        {r.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">{fmt(r.consumption)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => navigate('/purchase-orders')}>
                        <ShoppingCart className="w-3 h-3" /> Purchase
                      </Button>
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

export default ReorderLevelPage;
