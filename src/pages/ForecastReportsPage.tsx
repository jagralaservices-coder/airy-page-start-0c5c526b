import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format, startOfDay, endOfDay, subDays, addDays, addMonths, differenceInDays } from 'date-fns';
import {
  ArrowLeft, Download, Printer, FileSpreadsheet, TrendingUp, TrendingDown, Minus,
  Sparkles, Brain, Loader2, AlertTriangle, Package, Clock, Target, Activity,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

import { useLocale } from '@/contexts/LocaleContext';
import { useOwnerStore } from '@/hooks/useOwnerStore';
import { usePOS } from '@/contexts/POSContext';
import { supabase } from '@/integrations/supabase/client';
import { exportToCSV, exportToPrintableHTML, type ExportColumn } from '@/lib/reportExportUtils';
import { toast } from 'sonner';

// =============== Types ===============
type ForecastType = 'sales' | 'revenue' | 'demand';
type ForecastPeriod =
  | 'tomorrow' | 'next_7' | 'next_15' | 'next_30'
  | 'next_month' | 'next_quarter' | 'next_6_months' | 'next_year' | 'custom';
type ForecastBy =
  | 'overall' | 'product' | 'category' | 'customer' | 'salesperson'
  | 'payment_method' | 'time_slot' | 'order_type' | 'day' | 'week' | 'month'
  | 'store';

interface DailyPoint { date: string; value: number; qty: number; bills: number; }
interface ForecastPoint { date: string; actual?: number; forecast?: number; lower?: number; upper?: number; }

interface DimensionRow {
  key: string;
  label: string;
  historical: number;
  forecast: number;
  growth: number | null;
  fast?: boolean;
  slow?: boolean;
  qty?: number;
}

// =============== Helpers ===============
const getStoreIdFromStorage = (): string | null => {
  try {
    const s = localStorage.getItem('pos_active_store_data');
    if (s) { const p = JSON.parse(s); if (p?.id) return p.id; }
  } catch {}
  const a = localStorage.getItem('pos_active_store');
  if (a) { try { return JSON.parse(a); } catch {} }
  return null;
};

const periodLength = (p: ForecastPeriod, custom?: { from: Date; to: Date }) => {
  switch (p) {
    case 'tomorrow': return 1;
    case 'next_7': return 7;
    case 'next_15': return 15;
    case 'next_30': return 30;
    case 'next_month': return 30;
    case 'next_quarter': return 90;
    case 'next_6_months': return 180;
    case 'next_year': return 365;
    case 'custom': return custom ? Math.max(1, differenceInDays(custom.to, custom.from) + 1) : 30;
  }
};

const periodLabel = (p: ForecastPeriod, c?: { from: Date; to: Date }) => ({
  tomorrow: 'Tomorrow',
  next_7: 'Next 7 Days',
  next_15: 'Next 15 Days',
  next_30: 'Next 30 Days',
  next_month: 'Next Month',
  next_quarter: 'Next Quarter',
  next_6_months: 'Next 6 Months',
  next_year: 'Next Year',
  custom: c ? `${format(c.from, 'dd MMM')} – ${format(c.to, 'dd MMM yyyy')}` : 'Custom',
}[p]);

// Linear regression on daily series -> slope + intercept
const linearRegression = (series: number[]) => {
  const n = series.length;
  if (n < 2) return { slope: 0, intercept: n ? series[0] : 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += series[i]; sumXY += i * series[i]; sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
};

// Day-of-week seasonality factors (1.0 = baseline)
const dowFactors = (points: DailyPoint[]): number[] => {
  const buckets: number[][] = Array.from({ length: 7 }, () => []);
  for (const p of points) {
    const d = new Date(p.date).getDay();
    buckets[d].push(p.value);
  }
  const avgAll = points.length ? points.reduce((s, p) => s + p.value, 0) / points.length : 0;
  if (avgAll === 0) return Array(7).fill(1);
  return buckets.map(b => {
    if (!b.length) return 1;
    const avg = b.reduce((s, v) => s + v, 0) / b.length;
    return avg / avgAll;
  });
};

// Confidence score from residual variance
const confidenceScore = (series: number[], slope: number, intercept: number): number => {
  const n = series.length;
  if (n < 3) return 50;
  let sse = 0, sst = 0;
  const mean = series.reduce((s, v) => s + v, 0) / n;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * i;
    sse += (series[i] - pred) ** 2;
    sst += (series[i] - mean) ** 2;
  }
  if (sst === 0) return 60;
  const r2 = Math.max(0, 1 - sse / sst);
  return Math.round(50 + r2 * 50); // 50–100
};

const growthPct = (a: number, b: number): number | null => {
  if (b === 0 && a === 0) return null;
  if (b === 0) return null;
  return ((a - b) / Math.abs(b)) * 100;
};

const fmtPct = (n: number | null) => n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

// =============== Component ===============
const ForecastReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatCurrency } = useLocale();
  const { isOwner, selectedStoreId } = useOwnerStore();
  const pos = usePOS();
  const stores = pos?.stores || [];

  const initialType = (searchParams.get('t') as ForecastType) || 'sales';
  const [forecastType, setForecastType] = useState<ForecastType>(initialType);
  const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>('next_30');
  const [forecastBy, setForecastBy] = useState<ForecastBy>('overall');
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>({
    from: addDays(new Date(), 1),
    to: addDays(new Date(), 30),
  });
  const [storeFilter, setStoreFilter] = useState<string>('current'); // owner-only

  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [aiInsights, setAiInsights] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  // RBAC: store users locked to their store
  const effectiveStoreId = useMemo(() => {
    if (!isOwner) return getStoreIdFromStorage();
    if (storeFilter === 'all') return null;
    if (storeFilter === 'current') return selectedStoreId || getStoreIdFromStorage();
    return storeFilter;
  }, [isOwner, storeFilter, selectedStoreId]);

  const horizon = periodLength(forecastPeriod, customRange);
  // Use 2x horizon historical, min 30 days, max 365
  const historyDays = Math.min(365, Math.max(30, horizon * 3));

  // -------- Fetch history --------
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const end = endOfDay(new Date());
      const start = startOfDay(subDays(end, historyDays));
      let q = supabase.from('orders').select('*')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .neq('status', 'cancelled')
        .limit(20000);
      if (effectiveStoreId) q = q.eq('store_id', effectiveStoreId);
      const { data, error } = await q;
      if (error) {
        console.error('[Forecast] fetch error', error);
        toast.error('Failed to load historical data');
        setHistory([]);
      } else {
        setHistory(data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [effectiveStoreId, historyDays]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // -------- Daily aggregation --------
  const dailyPoints: DailyPoint[] = useMemo(() => {
    const map = new Map<string, DailyPoint>();
    const end = endOfDay(new Date());
    const start = startOfDay(subDays(end, historyDays));
    // Initialise zero buckets for stability
    for (let i = 0; i <= historyDays; i++) {
      const d = format(addDays(start, i), 'yyyy-MM-dd');
      map.set(d, { date: d, value: 0, qty: 0, bills: 0 });
    }
    for (const r of history) {
      const d = format(new Date(r.created_at), 'yyyy-MM-dd');
      if (!map.has(d)) continue;
      const bucket = map.get(d)!;
      const items = Array.isArray(r.items) ? r.items : [];
      const qty = items.reduce((s: number, it: any) => s + (Number(it.quantity) || 0), 0);
      bucket.value += Number(r.total) || 0;
      bucket.qty += qty;
      bucket.bills += 1;
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [history, historyDays]);

  // -------- Forecast computation --------
  const overallForecast = useMemo(() => {
    const valueSeries = dailyPoints.map(p => p.value);
    const qtySeries = dailyPoints.map(p => p.qty);
    const billsSeries = dailyPoints.map(p => p.bills);

    const { slope: vS, intercept: vI } = linearRegression(valueSeries);
    const { slope: qS, intercept: qI } = linearRegression(qtySeries);
    const { slope: bS, intercept: bI } = linearRegression(billsSeries);

    const dow = dowFactors(dailyPoints);
    const conf = confidenceScore(valueSeries, vS, vI);

    const n = dailyPoints.length;
    const points: ForecastPoint[] = dailyPoints.map((p, i) => ({
      date: p.date,
      actual: p.value,
      forecast: Math.max(0, vI + vS * i),
    }));

    let totalValue = 0, totalQty = 0, totalBills = 0;
    const lastDate = dailyPoints.length
      ? new Date(dailyPoints[dailyPoints.length - 1].date)
      : new Date();
    for (let i = 1; i <= horizon; i++) {
      const d = addDays(lastDate, i);
      const dStr = format(d, 'yyyy-MM-dd');
      const idx = n + i - 1;
      const factor = dow[d.getDay()] ?? 1;
      const v = Math.max(0, (vI + vS * idx) * factor);
      const qv = Math.max(0, (qI + qS * idx) * factor);
      const bv = Math.max(0, (bI + bS * idx) * factor);
      totalValue += v; totalQty += qv; totalBills += bv;
      const band = v * (1 - conf / 100) * 0.6;
      points.push({
        date: dStr,
        forecast: v,
        lower: Math.max(0, v - band),
        upper: v + band,
      });
    }

    const histTotal = valueSeries.reduce((s, v) => s + v, 0);
    const histAvgDaily = n ? histTotal / n : 0;
    const histPeriodTotal = histAvgDaily * horizon; // comparable window
    const histQtyTotal = qtySeries.reduce((s, v) => s + v, 0) / Math.max(1, n) * horizon;
    const histBillsTotal = billsSeries.reduce((s, v) => s + v, 0) / Math.max(1, n) * horizon;

    return {
      points,
      confidence: conf,
      expectedSales: totalValue,
      expectedBills: Math.round(totalBills),
      expectedOrders: Math.round(totalBills),
      expectedQty: Math.round(totalQty),
      expectedAvgBill: totalBills > 0 ? totalValue / totalBills : 0,
      growth: growthPct(totalValue, histPeriodTotal),
      qtyGrowth: growthPct(totalQty, histQtyTotal),
      billsGrowth: growthPct(totalBills, histBillsTotal),
      slope: vS,
      historicalAvgDaily: histAvgDaily,
    };
  }, [dailyPoints, horizon]);

  // -------- Revenue derived metrics --------
  const revenueMetrics = useMemo(() => {
    let histTax = 0, histDiscount = 0, histGross = 0, histNet = 0;
    for (const r of history) {
      const tax = Number(r.tax) || 0;
      const disc = Number(r.discount) || 0;
      const sub = Number(r.subtotal) || 0;
      const total = Number(r.total) || 0;
      histTax += tax; histDiscount += disc; histGross += sub + tax; histNet += total;
    }
    const n = Math.max(1, dailyPoints.length);
    const taxRate = histNet > 0 ? histTax / histNet : 0;
    const discRate = histNet > 0 ? histDiscount / histNet : 0;
    const grossRate = histNet > 0 ? histGross / histNet : 1;
    const fSales = overallForecast.expectedSales;
    const expectedTax = fSales * taxRate;
    const expectedDiscount = fSales * discRate;
    const expectedGross = fSales * grossRate;
    const expectedNet = fSales;
    const expectedProfit = Math.max(0, fSales - expectedDiscount - expectedTax * 0.1); // proxy
    const expectedMargin = fSales > 0 ? (expectedProfit / fSales) * 100 : 0;
    return { expectedTax, expectedDiscount, expectedGross, expectedNet, expectedProfit, expectedMargin };
  }, [history, dailyPoints.length, overallForecast.expectedSales]);

  // -------- Dimension breakdown forecast --------
  const dimensionRows: DimensionRow[] = useMemo(() => {
    if (forecastBy === 'overall') return [];

    const getKey = (r: any, it?: any): { key: string; label: string } | null => {
      switch (forecastBy) {
        case 'product':
          if (!it) return null;
          return { key: String(it.product_id || it.id || it.name || 'unknown'), label: String(it.name || 'Unknown') };
        case 'category':
          if (!it) return null;
          return { key: String(it.category || 'Uncategorised'), label: String(it.category || 'Uncategorised') };
        case 'customer': {
          const k = r.customer_name || 'Walk-in';
          return { key: k, label: k };
        }
        case 'salesperson': {
          const k = r.cashier_name || r.staff_name || 'Unknown';
          return { key: k, label: k };
        }
        case 'payment_method': {
          const k = r.payment_method || 'unknown';
          return { key: k, label: k };
        }
        case 'order_type': {
          const k = r.order_type || 'unknown';
          return { key: k, label: k };
        }
        case 'time_slot': {
          const h = new Date(r.created_at).getHours();
          const slot = h < 11 ? 'Morning (6-11)' : h < 15 ? 'Lunch (11-15)' : h < 19 ? 'Evening (15-19)' : 'Night (19-23)';
          return { key: slot, label: slot };
        }
        case 'day': {
          const k = format(new Date(r.created_at), 'EEEE');
          return { key: k, label: k };
        }
        case 'week': {
          const k = `Week ${format(new Date(r.created_at), 'w yyyy')}`;
          return { key: k, label: k };
        }
        case 'month': {
          const k = format(new Date(r.created_at), 'MMM yyyy');
          return { key: k, label: k };
        }
        case 'store': {
          const k = r.store_id || 'unknown';
          const st = stores.find((s: any) => s.id === k);
          return { key: k, label: st?.name || k };
        }
      }
      return null;
    };

    const agg = new Map<string, { label: string; total: number; qty: number; }>();
    const isItemLevel = forecastBy === 'product' || forecastBy === 'category';

    for (const r of history) {
      const items = Array.isArray(r.items) ? r.items : [];
      if (isItemLevel) {
        for (const it of items) {
          const k = getKey(r, it); if (!k) continue;
          const cur = agg.get(k.key) || { label: k.label, total: 0, qty: 0 };
          const qty = Number(it.quantity) || 0;
          const price = Number(it.price ?? it.unit_price ?? 0);
          cur.total += qty * price;
          cur.qty += qty;
          agg.set(k.key, cur);
        }
      } else {
        const k = getKey(r); if (!k) continue;
        const cur = agg.get(k.key) || { label: k.label, total: 0, qty: 0 };
        cur.total += Number(r.total) || 0;
        cur.qty += items.reduce((s: number, it: any) => s + (Number(it.quantity) || 0), 0);
        agg.set(k.key, cur);
      }
    }

    const n = Math.max(1, dailyPoints.length);
    const scale = horizon / n;
    // Apply the same trend multiplier as overall
    const overallHist = dailyPoints.reduce((s, p) => s + p.value, 0) / n;
    const overallFc = overallForecast.expectedSales / horizon;
    const trendMultiplier = overallHist > 0 ? overallFc / overallHist : 1;

    const rows: DimensionRow[] = Array.from(agg.entries()).map(([key, v]) => {
      const historical = v.total * scale;
      const forecast = v.total * scale * trendMultiplier;
      return {
        key, label: v.label, historical, forecast,
        growth: growthPct(forecast, historical),
        qty: Math.round(v.qty * scale * trendMultiplier),
      };
    }).sort((a, b) => b.forecast - a.forecast);

    // Mark fast/slow
    if (rows.length) {
      const top = Math.ceil(rows.length * 0.2);
      rows.slice(0, top).forEach(r => r.fast = true);
      rows.slice(-top).forEach(r => r.slow = true);
    }
    return rows;
  }, [forecastBy, history, dailyPoints, horizon, overallForecast.expectedSales, stores]);

  // -------- Demand: product-level forecast for stock alerts --------
  const productDemand = useMemo(() => {
    const agg = new Map<string, { name: string; qty: number; total: number; }>();
    for (const r of history) {
      const items = Array.isArray(r.items) ? r.items : [];
      for (const it of items) {
        const k = String(it.product_id || it.id || it.name || 'unknown');
        const cur = agg.get(k) || { name: String(it.name || k), qty: 0, total: 0 };
        cur.qty += Number(it.quantity) || 0;
        cur.total += (Number(it.quantity) || 0) * (Number(it.price ?? it.unit_price ?? 0));
        agg.set(k, cur);
      }
    }
    const n = Math.max(1, dailyPoints.length);
    const rows = Array.from(agg.entries()).map(([k, v]) => {
      const avgDailyQty = v.qty / n;
      const forecastQty = Math.round(avgDailyQty * horizon);
      return {
        key: k, name: v.name,
        avgDailyQty,
        forecastQty,
        historicalQty: v.qty,
        revenue: v.total * (horizon / n),
      };
    }).sort((a, b) => b.forecastQty - a.forecastQty);
    return rows;
  }, [history, dailyPoints.length, horizon]);

  // -------- AI Insights --------
  const generateAIInsights = useCallback(async () => {
    if (!history.length) { toast.warning('No historical data to analyse'); return; }
    setAiLoading(true);
    try {
      const topProducts = productDemand.slice(0, 5).map(p => `${p.name} (${p.forecastQty} units)`).join(', ');
      const slowProducts = productDemand.slice(-3).map(p => p.name).join(', ');
      const summary = {
        forecast_type: forecastType,
        period: periodLabel(forecastPeriod, customRange),
        horizon_days: horizon,
        history_days: historyDays,
        expected_sales: Math.round(overallForecast.expectedSales),
        expected_bills: overallForecast.expectedBills,
        expected_qty: overallForecast.expectedQty,
        growth_pct: overallForecast.growth,
        confidence: overallForecast.confidence,
        top_products: topProducts,
        slow_products: slowProducts,
      };

      const { data, error } = await supabase.functions.invoke('forecast-insights', {
        body: { summary },
      });

      if (error) throw error;
      let insights: string[] = Array.isArray(data?.insights) ? data.insights : [];
      if (!insights.length && typeof data?.text === 'string') {
        const m = data.text.match(/\[[\s\S]*\]/);
        if (m) { try { insights = JSON.parse(m[0]); } catch {} }
      }
      if (!insights.length && typeof data?.text === 'string') {
        insights = data.text.split('\n').map((s: string) => s.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 8);
      }
      setAiInsights(insights);
      toast.success('AI insights generated');
    } catch (e: any) {
      console.error('[Forecast AI]', e);
      // Fallback: deterministic insights
      const local: string[] = [];
      if (overallForecast.growth !== null) {
        local.push(`Overall ${forecastType} is projected to ${overallForecast.growth >= 0 ? 'grow' : 'decline'} by ${Math.abs(overallForecast.growth).toFixed(1)}% over ${periodLabel(forecastPeriod, customRange)}.`);
      }
      if (productDemand.length) {
        local.push(`Top mover: ${productDemand[0].name} — expected ${productDemand[0].forecastQty} units.`);
        if (productDemand.length > 3) {
          const slow = productDemand[productDemand.length - 1];
          local.push(`Slowest mover: ${slow.name} — consider reducing purchase quantity.`);
        }
      }
      local.push(`Forecast confidence: ${overallForecast.confidence}% based on ${historyDays} days of history.`);
      setAiInsights(local);
      toast.info('Showing offline insights');
    } finally {
      setAiLoading(false);
    }
  }, [history, productDemand, overallForecast, forecastType, forecastPeriod, customRange, horizon, historyDays]);

  // -------- Export --------
  const fmtMoney = (v: any) => formatCurrency(Number(v) || 0);
  const exportColumns: ExportColumn[] = useMemo(() => {
    if (forecastBy === 'overall') {
      return [
        { key: 'date', header: 'Date' },
        { key: 'actual', header: 'Actual', format: fmtMoney },
        { key: 'forecast', header: 'Forecast', format: fmtMoney },
      ];
    }
    return [
      { key: 'label', header: 'Item' },
      { key: 'historical', header: 'Historical', format: fmtMoney },
      { key: 'forecast', header: 'Forecast', format: fmtMoney },
      { key: 'qty', header: 'Qty' },
      { key: 'growth', header: 'Growth %' },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecastBy]);

  const exportRows = useMemo(() => {
    if (forecastBy === 'overall') {
      return overallForecast.points.map(p => ({
        date: p.date,
        actual: p.actual ?? '',
        forecast: p.forecast ?? '',
      }));
    }
    return dimensionRows.map(r => ({
      label: r.label,
      historical: r.historical,
      forecast: r.forecast,
      qty: r.qty,
      growth: fmtPct(r.growth),
    }));
  }, [forecastBy, overallForecast.points, dimensionRows]);

  const titleBase = `${forecastType[0].toUpperCase() + forecastType.slice(1)} Forecast`;
  const exportTitle = `${titleBase} – ${periodLabel(forecastPeriod, customRange)}`;

  const handleCSV = () => {
    exportToCSV(exportRows, exportColumns, exportTitle.replace(/\s+/g, '_'));
    toast.success('CSV downloaded');
  };
  const handlePrint = () => {
    exportToPrintableHTML(exportRows, exportColumns, exportTitle, {
      generatedAt: format(new Date(), 'dd MMM yyyy HH:mm'),
    });
  };

  // -------- UI helpers --------
  const TrendIcon: React.FC<{ value: number | null }> = ({ value }) => {
    if (value === null || value === 0) return <Minus className="h-4 w-4 text-muted-foreground" />;
    return value > 0
      ? <TrendingUp className="h-4 w-4 text-emerald-600" />
      : <TrendingDown className="h-4 w-4 text-red-600" />;
  };

  // Owner-only dimensions
  const dimensionOptions: { value: ForecastBy; label: string; ownerOnly?: boolean }[] = [
    { value: 'overall', label: 'Overall' },
    { value: 'product', label: 'Product' },
    { value: 'category', label: 'Category' },
    { value: 'customer', label: 'Customer' },
    { value: 'salesperson', label: 'Salesperson' },
    { value: 'payment_method', label: 'Payment Method' },
    { value: 'time_slot', label: 'Time Slot' },
    { value: 'order_type', label: 'Order Type' },
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'store', label: 'Store', ownerOnly: true },
  ];
  const visibleDimensions = dimensionOptions.filter(d => isOwner || !d.ownerOnly);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/reports')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-bold">Forecast Reports</h1>
                <Badge variant="secondary" className="ml-1">AI-powered</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {isOwner ? 'Owner view · Company-wide forecasting available' : 'Store view · Limited to your store'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCSV}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" /> Print / PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4 space-y-4">
        {/* Type tabs */}
        <Tabs value={forecastType} onValueChange={(v) => setForecastType(v as ForecastType)}>
          <TabsList>
            <TabsTrigger value="sales"><Activity className="h-4 w-4 mr-1" />Sales Forecast</TabsTrigger>
            <TabsTrigger value="revenue"><Target className="h-4 w-4 mr-1" />Revenue Forecast</TabsTrigger>
            <TabsTrigger value="demand"><Package className="h-4 w-4 mr-1" />Demand Forecast</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Forecast Period</label>
              <Select value={forecastPeriod} onValueChange={(v) => setForecastPeriod(v as ForecastPeriod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tomorrow">Tomorrow</SelectItem>
                  <SelectItem value="next_7">Next 7 Days</SelectItem>
                  <SelectItem value="next_15">Next 15 Days</SelectItem>
                  <SelectItem value="next_30">Next 30 Days</SelectItem>
                  <SelectItem value="next_month">Next Month</SelectItem>
                  <SelectItem value="next_quarter">Next Quarter</SelectItem>
                  <SelectItem value="next_6_months">Next 6 Months</SelectItem>
                  <SelectItem value="next_year">Next Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {forecastPeriod === 'custom' && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Custom Range</label>
                <DatePickerWithRange
                  date={{ from: customRange.from, to: customRange.to }}
                  setDate={(r: any) => {
                    if (r?.from) setCustomRange({ from: r.from, to: r.to ?? r.from });
                  }}
                />
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Forecast By</label>
              <Select value={forecastBy} onValueChange={(v) => setForecastBy(v as ForecastBy)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {visibleDimensions.map(d => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isOwner && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Store / Outlet</label>
                <Select value={storeFilter} onValueChange={setStoreFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current Store</SelectItem>
                    <SelectItem value="all">All Stores (Company)</SelectItem>
                    {stores.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Confidence + History size */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Forecast Confidence</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallForecast.confidence}%</div>
              <Progress value={overallForecast.confidence} className="mt-2 h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                Based on {historyDays} days · {history.length} orders
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Forecast Horizon</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{horizon} days</div>
              <p className="text-xs text-muted-foreground mt-1">{periodLabel(forecastPeriod, customRange)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">AI Insights</CardTitle>
              <Button size="sm" variant="outline" onClick={generateAIInsights} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Brain className="h-4 w-4 mr-1" />Generate</>}
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {aiInsights.length ? `${aiInsights.length} insights ready below` : 'Click Generate to analyse trends'}
              </p>
            </CardContent>
          </Card>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {/* SALES FORECAST */}
        {forecastType === 'sales' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MetricCard label="Expected Sales" value={formatCurrency(overallForecast.expectedSales)} growth={overallForecast.growth} />
              <MetricCard label="Expected Bills" value={overallForecast.expectedBills.toLocaleString()} growth={overallForecast.billsGrowth} />
              <MetricCard label="Expected Orders" value={overallForecast.expectedOrders.toLocaleString()} growth={overallForecast.billsGrowth} />
              <MetricCard label="Expected Qty Sold" value={overallForecast.expectedQty.toLocaleString()} growth={overallForecast.qtyGrowth} />
              <MetricCard label="Expected Avg Bill" value={formatCurrency(overallForecast.expectedAvgBill)} growth={null} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Historical vs Forecast — Sales Trend</CardTitle>
                <CardDescription>Daily actual sales and projected forecast with confidence band</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={overallForecast.points}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => formatCurrency(Number(v) || 0)} />
                    <Legend />
                    <Area type="monotone" dataKey="upper" stroke="none" fill="hsl(var(--primary))" fillOpacity={0.08} name="Upper bound" />
                    <Area type="monotone" dataKey="lower" stroke="none" fill="hsl(var(--background))" fillOpacity={1} name="Lower bound" />
                    <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Actual" />
                    <Line type="monotone" dataKey="forecast" stroke="hsl(var(--accent-foreground))" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Forecast" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}

        {/* REVENUE FORECAST */}
        {forecastType === 'revenue' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Expected Revenue" value={formatCurrency(revenueMetrics.expectedNet)} growth={overallForecast.growth} />
              <MetricCard label="Expected Profit" value={formatCurrency(revenueMetrics.expectedProfit)} growth={overallForecast.growth} />
              <MetricCard label="Expected Tax" value={formatCurrency(revenueMetrics.expectedTax)} growth={null} />
              <MetricCard label="Expected Discount" value={formatCurrency(revenueMetrics.expectedDiscount)} growth={null} />
              <MetricCard label="Expected Gross Sales" value={formatCurrency(revenueMetrics.expectedGross)} growth={null} />
              <MetricCard label="Expected Net Sales" value={formatCurrency(revenueMetrics.expectedNet)} growth={null} />
              <MetricCard label="Expected Margin" value={`${revenueMetrics.expectedMargin.toFixed(1)}%`} growth={null} />
              <MetricCard label="Avg Daily Revenue (Hist)" value={formatCurrency(overallForecast.historicalAvgDaily)} growth={null} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={overallForecast.points}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => formatCurrency(Number(v) || 0)} />
                    <Legend />
                    <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Actual Revenue" />
                    <Line type="monotone" dataKey="forecast" stroke="hsl(var(--accent-foreground))" strokeDasharray="5 5" strokeWidth={2} dot={false} name="Projected Revenue" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}

        {/* DEMAND FORECAST */}
        {forecastType === 'demand' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Expected Demand (Qty)" value={overallForecast.expectedQty.toLocaleString()} growth={overallForecast.qtyGrowth} />
              <MetricCard label="Expected Bills" value={overallForecast.expectedBills.toLocaleString()} growth={overallForecast.billsGrowth} />
              <MetricCard label="Unique Products Tracked" value={productDemand.length.toLocaleString()} growth={null} />
              <MetricCard label="Avg Daily Qty (Hist)" value={(productDemand.reduce((s, p) => s + p.avgDailyQty, 0)).toFixed(0)} growth={null} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card>
                <CardHeader><CardTitle className="text-base text-emerald-700">Fast Moving Products</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {productDemand.slice(0, 10).map(p => (
                      <div key={p.key} className="flex items-center justify-between text-sm border-b pb-1">
                        <span className="truncate">{p.name}</span>
                        <Badge variant="default">{p.forecastQty} units</Badge>
                      </div>
                    ))}
                    {!productDemand.length && <p className="text-sm text-muted-foreground">No data</p>}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base text-amber-700">Slow / Dead Stock Risk</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {productDemand.slice(-10).reverse().map(p => (
                      <div key={p.key} className="flex items-center justify-between text-sm border-b pb-1">
                        <span className="truncate">{p.name}</span>
                        <Badge variant={p.forecastQty === 0 ? 'destructive' : 'secondary'}>
                          {p.forecastQty === 0 ? 'Dead stock' : `${p.forecastQty} units`}
                        </Badge>
                      </div>
                    ))}
                    {!productDemand.length && <p className="text-sm text-muted-foreground">No data</p>}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Purchase Recommendations</CardTitle>
                <CardDescription>Recommended order quantities based on projected demand</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground border-b">
                      <tr>
                        <th className="py-2">Product</th>
                        <th className="py-2 text-right">Avg / day</th>
                        <th className="py-2 text-right">Forecast Qty</th>
                        <th className="py-2 text-right">Buffer (+15%)</th>
                        <th className="py-2 text-right">Est. Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productDemand.slice(0, 25).map(p => (
                        <tr key={p.key} className="border-b">
                          <td className="py-2">{p.name}</td>
                          <td className="py-2 text-right">{p.avgDailyQty.toFixed(1)}</td>
                          <td className="py-2 text-right">{p.forecastQty}</td>
                          <td className="py-2 text-right font-medium">{Math.ceil(p.forecastQty * 1.15)}</td>
                          <td className="py-2 text-right">{formatCurrency(p.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Dimension breakdown */}
        {forecastBy !== 'overall' && dimensionRows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Forecast by {visibleDimensions.find(d => d.value === forecastBy)?.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dimensionRows.slice(0, 15)}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v) || 0)} />
                  <Legend />
                  <Bar dataKey="historical" fill="hsl(var(--muted-foreground))" name="Historical" />
                  <Bar dataKey="forecast" fill="hsl(var(--primary))" name="Forecast" />
                </BarChart>
              </ResponsiveContainer>

              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr>
                      <th className="py-2">Name</th>
                      <th className="py-2 text-right">Historical</th>
                      <th className="py-2 text-right">Forecast</th>
                      <th className="py-2 text-right">Qty</th>
                      <th className="py-2 text-right">Growth</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dimensionRows.slice(0, 50).map(r => (
                      <tr key={r.key} className="border-b">
                        <td className="py-2">{r.label}</td>
                        <td className="py-2 text-right">{formatCurrency(r.historical)}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(r.forecast)}</td>
                        <td className="py-2 text-right">{r.qty ?? '—'}</td>
                        <td className="py-2 text-right">
                          <span className="inline-flex items-center gap-1 justify-end">
                            <TrendIcon value={r.growth} />
                            <span className={(r.growth ?? 0) > 0 ? 'text-emerald-700' : (r.growth ?? 0) < 0 ? 'text-red-700' : 'text-muted-foreground'}>
                              {fmtPct(r.growth)}
                            </span>
                          </span>
                        </td>
                        <td className="py-2">
                          {r.fast && <Badge variant="default" className="text-[10px]">Fast</Badge>}
                          {r.slow && <Badge variant="secondary" className="text-[10px]">Slow</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Insights output */}
        {aiInsights.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" /> AI-Generated Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {aiInsights.map((s, i) => (
                  <Alert key={i}>
                    <Sparkles className="h-4 w-4" />
                    <AlertDescription>{s}</AlertDescription>
                  </Alert>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && !history.length && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Not enough data</AlertTitle>
            <AlertDescription>
              No completed orders found for the last {historyDays} days for this scope. Forecasts will appear after sales activity.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; growth: number | null }> = ({ label, value, growth }) => (
  <Card>
    <CardContent className="pt-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
      {growth !== null && (
        <p className={`text-xs mt-1 flex items-center gap-1 ${growth > 0 ? 'text-emerald-700' : growth < 0 ? 'text-red-700' : 'text-muted-foreground'}`}>
          {growth > 0 ? <TrendingUp className="h-3 w-3" /> : growth < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {fmtPct(growth)} vs historical
        </p>
      )}
    </CardContent>
  </Card>
);

export default ForecastReportsPage;
