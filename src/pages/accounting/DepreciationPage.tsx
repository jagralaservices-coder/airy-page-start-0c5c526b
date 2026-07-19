import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { exportCSV, inr } from '@/lib/accounting/exportUtils';
import { Download, Printer, Play } from 'lucide-react';
import { toast } from 'sonner';

interface Asset {
  id: string; name: string; asset_code: string; category: string;
  purchase_date: string; purchase_cost: number; salvage_value: number;
  useful_life_months: number; depreciation_method: string; wdv_rate: number | null;
  accumulated_depreciation: number; status: string;
}

interface Schedule {
  asset_id: string; asset_name: string; asset_code: string; method: string;
  period_date: string; opening_bv: number; depreciation: number; closing_bv: number;
}

function monthlyDep(a: Asset): number {
  if (a.depreciation_method === 'wdv' && a.wdv_rate) {
    const bv = Number(a.purchase_cost) - Number(a.accumulated_depreciation);
    return +(bv * (Number(a.wdv_rate) / 100) / 12).toFixed(2);
  }
  const life = Number(a.useful_life_months) || 60;
  return +((Number(a.purchase_cost) - Number(a.salvage_value)) / life).toFixed(2);
}

export default function DepreciationPage() {
  const { merchantId } = useAccountingContext();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [months, setMonths] = useState(12);
  const [posting, setPosting] = useState(false);

  const load = async () => {
    if (!merchantId) return;
    const [{ data: a }, { data: e }] = await Promise.all([
      supabase.from('fixed_assets').select('*').eq('merchant_id', merchantId).eq('status', 'active'),
      supabase.from('depreciation_entries').select('*').eq('merchant_id', merchantId).order('period_date', { ascending: false }).limit(500),
    ]);
    setAssets((a ?? []) as any);
    setEntries((e ?? []) as any);
  };
  useEffect(() => { load(); }, [merchantId]);

  const schedule = useMemo<Schedule[]>(() => {
    const out: Schedule[] = [];
    assets.forEach((a) => {
      let bv = Number(a.purchase_cost) - Number(a.accumulated_depreciation);
      const start = new Date();
      for (let i = 0; i < months; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i + 1, 0);
        const dep = a.depreciation_method === 'wdv' && a.wdv_rate
          ? +(bv * (Number(a.wdv_rate) / 100) / 12).toFixed(2)
          : +((Number(a.purchase_cost) - Number(a.salvage_value)) / Number(a.useful_life_months)).toFixed(2);
        const applied = Math.min(dep, Math.max(0, bv - Number(a.salvage_value)));
        if (applied <= 0) break;
        const closing = bv - applied;
        out.push({
          asset_id: a.id, asset_name: a.name, asset_code: a.asset_code, method: a.depreciation_method,
          period_date: d.toISOString().slice(0, 10),
          opening_bv: bv, depreciation: applied, closing_bv: closing,
        });
        bv = closing;
      }
    });
    return out;
  }, [assets, months]);

  const runMonthly = async () => {
    if (!merchantId) return;
    setPosting(true);
    try {
      const period = new Date(); period.setDate(1);
      const periodISO = new Date(period.getFullYear(), period.getMonth() + 1, 0).toISOString().slice(0, 10);
      let posted = 0;
      for (const a of assets) {
        const bv = Number(a.purchase_cost) - Number(a.accumulated_depreciation);
        const salvage = Number(a.salvage_value);
        if (bv <= salvage) continue;
        const dep = Math.min(monthlyDep(a), bv - salvage);
        if (dep <= 0) continue;
        const { data: existing } = await supabase.from('depreciation_entries')
          .select('id').eq('asset_id', a.id).eq('period_date', periodISO).maybeSingle();
        if (existing) continue;
        const { error } = await supabase.from('depreciation_entries').insert({
          merchant_id: merchantId, asset_id: a.id, period_date: periodISO,
          amount: dep, method: a.depreciation_method,
          book_value_before: bv, book_value_after: bv - dep,
        });
        if (error) continue;
        await supabase.from('fixed_assets').update({ accumulated_depreciation: Number(a.accumulated_depreciation) + dep }).eq('id', a.id);
        posted++;
      }
      toast.success(`Posted depreciation for ${posted} asset(s)`);
      load();
    } finally { setPosting(false); }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Depreciation</h1>
          <p className="text-sm text-muted-foreground">Straight-line & WDV depreciation schedules and journal posting</p>
        </div>
        <div className="flex gap-2">
          <div><Label className="text-xs">Preview months</Label><Input type="number" value={months} onChange={(e) => setMonths(Number(e.target.value) || 12)} className="w-24" /></div>
          <div className="flex gap-2 items-end">
            <Button variant="outline" size="sm" onClick={() => exportCSV('depreciation-schedule', schedule)}><Download className="h-4 w-4 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
            <Button size="sm" onClick={runMonthly} disabled={posting}><Play className="h-4 w-4 mr-1" />Post This Month</Button>
          </div>
        </div>
      </div>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Forward Schedule ({schedule.length})</CardTitle></CardHeader>
        <CardContent className="p-0 max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left sticky top-0"><tr>
              <th className="p-2 pl-4">Asset</th><th className="p-2">Period</th>
              <th className="p-2">Method</th>
              <th className="p-2 text-right">Opening BV</th>
              <th className="p-2 text-right">Depreciation</th>
              <th className="p-2 text-right pr-4">Closing BV</th>
            </tr></thead>
            <tbody>
              {schedule.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No active assets</td></tr>}
              {schedule.map((s, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 pl-4">{s.asset_name} <span className="text-xs text-muted-foreground font-mono">{s.asset_code}</span></td>
                  <td className="p-2">{s.period_date}</td>
                  <td className="p-2 text-xs">{s.method}</td>
                  <td className="p-2 text-right font-mono">{inr(s.opening_bv)}</td>
                  <td className="p-2 text-right font-mono">{inr(s.depreciation)}</td>
                  <td className="p-2 text-right pr-4 font-mono">{inr(s.closing_bv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Posted Depreciation ({entries.length})</CardTitle></CardHeader>
        <CardContent className="p-0 max-h-[300px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left sticky top-0"><tr>
              <th className="p-2 pl-4">Period</th><th className="p-2">Asset</th>
              <th className="p-2">Method</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2 text-right">BV Before</th>
              <th className="p-2 text-right pr-4">BV After</th>
            </tr></thead>
            <tbody>
              {entries.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No depreciation posted yet</td></tr>}
              {entries.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-2 pl-4">{e.period_date}</td>
                  <td className="p-2 font-mono text-xs">{e.asset_id.slice(0, 8)}</td>
                  <td className="p-2 text-xs">{e.method}</td>
                  <td className="p-2 text-right font-mono">{inr(e.amount)}</td>
                  <td className="p-2 text-right font-mono">{inr(e.book_value_before)}</td>
                  <td className="p-2 text-right pr-4 font-mono">{inr(e.book_value_after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
