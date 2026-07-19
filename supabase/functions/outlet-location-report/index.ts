// Owner-only Outlet & Location Reports aggregator.
// Modes: outlets | branches | regions | counters | outlet-detail
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Order = {
  id: string;
  store_id: string;
  status: string | null;
  total: number | null;
  subtotal: number | null;
  tax_total: number | null;
  tax: number | null;
  discount: number | null;
  paid_amount: number | null;
  payment_method: string | null;
  cashier_id: string | null;
  cash_session_id: string | null;
  customer_id: string | null;
  items: any;
  created_at: string;
};

const num = (v: any) => (typeof v === "number" ? v : parseFloat(v ?? "0") || 0);

function deriveAggregates(orders: Order[]) {
  let gross = 0, net = 0, tax = 0, discount = 0, revenue = 0;
  let ordersCount = 0, billsCount = 0, items = 0, cancelled = 0, returns = 0;
  for (const o of orders) {
    const isCancelled = o.status === "cancelled";
    const isReturn = o.status === "returned" || o.status === "refunded";
    if (isCancelled) { cancelled++; continue; }
    if (isReturn) { returns++; continue; }
    const total = num(o.total);
    const sub = num(o.subtotal) || total;
    const t = num(o.tax_total ?? o.tax);
    const d = num(o.discount);
    gross += sub + d;
    net += total;
    tax += t;
    discount += d;
    revenue += total - t;
    ordersCount++;
    if (o.id) billsCount++;
    const arr = Array.isArray(o.items) ? o.items : [];
    items += arr.reduce((s: number, it: any) => s + (it.qty ?? it.quantity ?? 1), 0);
  }
  const profit = revenue; // cost not tracked → revenue == profit floor
  const margin = net > 0 ? (profit / net) * 100 : 0;
  const aov = billsCount > 0 ? net / billsCount : 0;
  const avgItems = billsCount > 0 ? items / billsCount : 0;
  return { gross, net, tax, discount, revenue, profit, margin, ordersCount, billsCount, cancelled, returns, aov, avgItems };
}

function growth(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

function bucketISO(ts: string, mode: "hour" | "day" | "month" | "year") {
  const d = new Date(ts);
  switch (mode) {
    case "hour": return `${d.getHours().toString().padStart(2, "0")}:00`;
    case "day": return d.toISOString().slice(0, 10);
    case "month": return d.toISOString().slice(0, 7);
    case "year": return d.getUTCFullYear().toString();
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ ok: false, error: "unauthorized" }, 401);

    const supa = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userRes, error: userErr } = await supa.auth.getUser(token);
    if (userErr || !userRes?.user) return json({ ok: false, error: "unauthorized" }, 401);
    const uid = userRes.user.id;

    // Role check — owner/admin only.
    const { data: roles } = await supa
      .from("user_roles")
      .select("role, merchant_id, customer_id")
      .eq("user_id", uid)
      .eq("is_active", true);
    const allowed = (roles ?? []).filter((r) =>
      ["owner", "admin", "super_admin"].includes(r.role)
    );
    if (allowed.length === 0) return json({ ok: false, error: "forbidden_owner_only" }, 403);

    const isPlatformAdmin = allowed.some((r) => r.role === "admin" || r.role === "super_admin");
    const merchantId = allowed.find((r) => r.merchant_id)?.merchant_id
                    ?? allowed.find((r) => r.customer_id)?.customer_id
                    ?? null;

    const body = await req.json().catch(() => ({}));
    const {
      mode = "outlets",
      from, to,
      store_id, branch, region, state, city, manager,
      compare_from, compare_to,
    } = body as any;

    if (!from || !to) return json({ ok: false, error: "from and to required" }, 400);

    // --- Resolve scoped stores ---
    let storesQ = supa.from("stores").select(
      "id, name, outlet_code, branch_name, branch_code, region, manager_name, manager_user_id, city, state, country, is_active, merchant_id, customer_id"
    ).eq("is_active", true);
    if (!isPlatformAdmin) {
      if (!merchantId) return json({ ok: false, error: "no merchant scope" }, 403);
      storesQ = storesQ.or(`merchant_id.eq.${merchantId},customer_id.eq.${merchantId}`);
    }
    if (branch) storesQ = storesQ.eq("branch_name", branch);
    if (region) storesQ = storesQ.eq("region", region);
    if (state) storesQ = storesQ.eq("state", state);
    if (city) storesQ = storesQ.eq("city", city);
    if (manager) storesQ = storesQ.eq("manager_name", manager);

    const { data: stores, error: storesErr } = await storesQ;
    if (storesErr) return json({ ok: false, error: storesErr.message }, 500);
    let storeList = stores ?? [];
    if (store_id) storeList = storeList.filter((s) => s.id === store_id);
    const storeIds = storeList.map((s) => s.id);
    if (storeIds.length === 0) {
      return json({ ok: true, scope: { is_owner: true, store_ids: [] }, stores: [], rows: [], totals: {} });
    }

    const fetchOrders = async (fromISO: string, toISO: string): Promise<Order[]> => {
      const { data, error } = await supa
        .from("orders")
        .select("id, store_id, status, total, subtotal, tax_total, tax, discount, paid_amount, payment_method, cashier_id, cash_session_id, customer_id, items, created_at")
        .in("store_id", storeIds)
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      if (error) throw error;
      return (data ?? []) as Order[];
    };

    const orders = await fetchOrders(from, to);

    // Previous period (equal length) — for growth.
    let prevOrders: Order[] = [];
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    const span = Math.max(1, toMs - fromMs);
    const prevFrom = new Date(fromMs - span).toISOString();
    const prevTo = new Date(toMs - span).toISOString();
    prevOrders = await fetchOrders(prevFrom, prevTo);

    const byStoreCurr = new Map<string, Order[]>();
    const byStorePrev = new Map<string, Order[]>();
    for (const o of orders) (byStoreCurr.get(o.store_id) ?? byStoreCurr.set(o.store_id, []).get(o.store_id)!).push(o);
    for (const o of prevOrders) (byStorePrev.get(o.store_id) ?? byStorePrev.set(o.store_id, []).get(o.store_id)!).push(o);

    // -------- outlets mode --------
    if (mode === "outlets") {
      const rows = storeList.map((s) => {
        const agg = deriveAggregates(byStoreCurr.get(s.id) ?? []);
        const prev = deriveAggregates(byStorePrev.get(s.id) ?? []);
        return {
          store_id: s.id,
          outlet_name: s.name,
          outlet_code: s.outlet_code,
          branch_name: s.branch_name,
          region: s.region,
          manager: s.manager_name,
          city: s.city, state: s.state,
          orders: agg.ordersCount, bills: agg.billsCount,
          gross: agg.gross, net: agg.net, revenue: agg.revenue, profit: agg.profit,
          margin_pct: agg.margin, discount: agg.discount, tax: agg.tax,
          returns: agg.returns, cancelled: agg.cancelled,
          aov: agg.aov, avg_items: agg.avgItems,
          growth_pct: growth(agg.revenue, prev.revenue),
        };
      });
      const totals = deriveAggregates(orders);
      const has_region = storeList.some((s) => !!s.region);
      return json({ ok: true, scope: { is_owner: true, store_ids: storeIds }, has_region, rows, totals });
    }

    // -------- branches mode --------
    if (mode === "branches") {
      const map = new Map<string, { outlets: Set<string>; curr: Order[]; prev: Order[] }>();
      for (const s of storeList) {
        const key = s.branch_name || "(Unassigned)";
        if (!map.has(key)) map.set(key, { outlets: new Set(), curr: [], prev: [] });
        const e = map.get(key)!;
        e.outlets.add(s.id);
        e.curr.push(...(byStoreCurr.get(s.id) ?? []));
        e.prev.push(...(byStorePrev.get(s.id) ?? []));
      }
      const rows = [...map.entries()].map(([branch_name, e]) => {
        const agg = deriveAggregates(e.curr);
        const prev = deriveAggregates(e.prev);
        return {
          branch_name,
          outlets: e.outlets.size,
          orders: agg.ordersCount, bills: agg.billsCount,
          sales: agg.net, revenue: agg.revenue, profit: agg.profit,
          aov: agg.aov, growth_pct: growth(agg.revenue, prev.revenue),
        };
      });
      return json({ ok: true, rows });
    }

    // -------- regions mode --------
    if (mode === "regions") {
      const map = new Map<string, { branches: Set<string>; outlets: Set<string>; curr: Order[]; prev: Order[] }>();
      for (const s of storeList) {
        if (!s.region) continue;
        if (!map.has(s.region)) map.set(s.region, { branches: new Set(), outlets: new Set(), curr: [], prev: [] });
        const e = map.get(s.region)!;
        if (s.branch_name) e.branches.add(s.branch_name);
        e.outlets.add(s.id);
        e.curr.push(...(byStoreCurr.get(s.id) ?? []));
        e.prev.push(...(byStorePrev.get(s.id) ?? []));
      }
      const rows = [...map.entries()].map(([region, e]) => {
        const agg = deriveAggregates(e.curr);
        const prev = deriveAggregates(e.prev);
        return {
          region,
          branches: e.branches.size,
          outlets: e.outlets.size,
          orders: agg.ordersCount, bills: agg.billsCount,
          sales: agg.net, revenue: agg.revenue, profit: agg.profit,
          growth_pct: growth(agg.revenue, prev.revenue),
        };
      });
      return json({ ok: true, rows });
    }

    // -------- counters mode --------
    if (mode === "counters") {
      // Group by cash_session_id (fallback cashier_id)
      const map = new Map<string, { curr: Order[]; cashier: string | null; store: string }>();
      for (const o of orders) {
        const key = o.cash_session_id || `cashier:${o.cashier_id ?? "unknown"}`;
        if (!map.has(key)) map.set(key, { curr: [], cashier: o.cashier_id, store: o.store_id });
        map.get(key)!.curr.push(o);
      }
      // Resolve cashier names + session info
      const cashierIds = [...new Set([...map.values()].map((v) => v.cashier).filter(Boolean) as string[])];
      const profileMap = new Map<string, string>();
      if (cashierIds.length) {
        const { data: profs } = await supa.from("profiles").select("id, full_name").in("id", cashierIds);
        for (const p of profs ?? []) profileMap.set(p.id, p.full_name ?? "");
      }
      const rows = [...map.entries()].map(([key, e]) => {
        const agg = deriveAggregates(e.curr);
        return {
          counter_id: key,
          counter_name: key.startsWith("cashier:") ? "Default Counter" : `Session ${key.slice(0, 8)}`,
          cashier: e.cashier ? (profileMap.get(e.cashier) || "Unknown") : "—",
          store_id: e.store,
          orders: agg.ordersCount, bills: agg.billsCount,
          gross: agg.gross, net: agg.net, revenue: agg.revenue, aov: agg.aov,
        };
      });
      return json({ ok: true, rows });
    }

    // -------- outlet-detail mode --------
    if (mode === "outlet-detail") {
      if (!store_id) return json({ ok: false, error: "store_id required" }, 400);
      const o = byStoreCurr.get(store_id) ?? [];
      const agg = deriveAggregates(o);

      // Trends
      const trendMap = new Map<string, { revenue: number; profit: number }>();
      for (const x of o) {
        if (x.status === "cancelled") continue;
        const day = bucketISO(x.created_at, "day");
        const cur = trendMap.get(day) ?? { revenue: 0, profit: 0 };
        const t = num(x.tax_total ?? x.tax);
        cur.revenue += num(x.total) - t;
        cur.profit += num(x.total) - t;
        trendMap.set(day, cur);
      }
      const trend = [...trendMap.entries()].sort().map(([d, v]) => ({ date: d, ...v }));

      // Hourly/daily/monthly/yearly
      const bucket = (m: "hour" | "day" | "month" | "year") => {
        const mp = new Map<string, number>();
        for (const x of o) {
          if (x.status === "cancelled") continue;
          const k = bucketISO(x.created_at, m);
          mp.set(k, (mp.get(k) ?? 0) + num(x.total));
        }
        return [...mp.entries()].sort().map(([k, v]) => ({ key: k, value: v }));
      };

      // Top products / categories
      const prodMap = new Map<string, { name: string; qty: number; revenue: number }>();
      const catMap = new Map<string, number>();
      for (const x of o) {
        if (x.status === "cancelled") continue;
        const arr = Array.isArray(x.items) ? x.items : [];
        for (const it of arr) {
          const key = it.id ?? it.product_id ?? it.name;
          const name = it.name ?? "Item";
          const qty = num(it.qty ?? it.quantity ?? 1);
          const rev = num(it.price ?? it.unit_price ?? 0) * qty;
          if (!prodMap.has(key)) prodMap.set(key, { name, qty: 0, revenue: 0 });
          const p = prodMap.get(key)!;
          p.qty += qty; p.revenue += rev;
          const cat = it.category ?? "Uncategorized";
          catMap.set(cat, (catMap.get(cat) ?? 0) + rev);
        }
      }
      const top_products = [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
      const top_categories = [...catMap.entries()].map(([name, revenue]) => ({ name, revenue }))
        .sort((a, b) => b.revenue - a.revenue).slice(0, 10);

      // Top customers
      const custMap = new Map<string, { id: string; spent: number; orders: number }>();
      for (const x of o) {
        if (x.status === "cancelled" || !x.customer_id) continue;
        if (!custMap.has(x.customer_id)) custMap.set(x.customer_id, { id: x.customer_id, spent: 0, orders: 0 });
        const c = custMap.get(x.customer_id)!;
        c.spent += num(x.total); c.orders++;
      }
      const top_customers = [...custMap.values()].sort((a, b) => b.spent - a.spent).slice(0, 10);

      // Payment split
      const payMap = new Map<string, number>();
      for (const x of o) {
        if (x.status === "cancelled") continue;
        const m = x.payment_method ?? "unknown";
        payMap.set(m, (payMap.get(m) ?? 0) + num(x.total));
      }
      const payments = [...payMap.entries()].map(([method, amount]) => ({ method, amount }));

      const store = storeList.find((s) => s.id === store_id);
      return json({
        ok: true, store, summary: agg, trend,
        hourly: bucket("hour"), daily: bucket("day"),
        monthly: bucket("month"), yearly: bucket("year"),
        top_products, top_categories, top_customers, payments,
      });
    }

    return json({ ok: false, error: "unknown mode" }, 400);
  } catch (e: any) {
    return json({ ok: false, error: e.message ?? String(e) }, 500);
  }
});
