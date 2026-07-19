// Enterprise Employee Performance aggregator (merged Salesperson Performance + Salesperson-wise Sales).
// Modes: list | detail
// RBAC: Owner/Admin -> all stores in their merchant scope. Store users -> only their own store(s).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const num = (v: any) => (typeof v === "number" ? v : parseFloat(v ?? "0") || 0);

type Order = {
  id: string; store_id: string; status: string | null;
  total: number | null; subtotal: number | null; tax_total: number | null; tax: number | null;
  discount: number | null; paid_amount: number | null;
  payment_method: string | null; payment_breakdown: any;
  cashier_id: string | null; customer_id: string | null;
  items: any; created_at: string;
};

function agg(os: Order[]) {
  let gross = 0, net = 0, tax = 0, discount = 0, revenue = 0;
  let orders = 0, bills = 0, items = 0, cancelled = 0, returns = 0, refunds = 0;
  let highest = 0, lowest = Infinity;
  for (const o of os) {
    if (o.status === "cancelled") { cancelled++; continue; }
    if (o.status === "returned") { returns++; continue; }
    if (o.status === "refunded") { refunds++; continue; }
    const total = num(o.total);
    const sub = num(o.subtotal) || total;
    const t = num(o.tax_total ?? o.tax);
    const d = num(o.discount);
    gross += sub + d; net += total; tax += t; discount += d; revenue += total - t;
    orders++; bills++;
    if (total > highest) highest = total;
    if (total < lowest) lowest = total;
    const arr = Array.isArray(o.items) ? o.items : [];
    items += arr.reduce((s: number, it: any) => s + num(it.qty ?? it.quantity ?? 1), 0);
  }
  if (lowest === Infinity) lowest = 0;
  const aov = bills > 0 ? net / bills : 0;
  const profit = revenue;
  return { gross, net, tax, discount, revenue, profit, orders, bills, items, cancelled, returns, refunds, aov, highest, lowest };
}
const growth = (c: number, p: number) => p ? ((c - p) / p) * 100 : null;

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

    const { data: myRoles } = await supa
      .from("user_roles")
      .select("role, store_id, merchant_id, customer_id")
      .eq("user_id", uid).eq("is_active", true);
    const roles = myRoles ?? [];
    const isPlatformAdmin = roles.some((r) => ["super_admin", "admin"].includes(r.role));
    const isOwner = roles.some((r) => r.role === "owner");
    const isStoreUser = !isOwner && !isPlatformAdmin && roles.length > 0;
    const merchantId = roles.find((r) => r.merchant_id)?.merchant_id
                    ?? roles.find((r) => r.customer_id)?.customer_id ?? null;

    const body = await req.json().catch(() => ({}));
    const { mode = "list", from, to, store_id, role: roleFilter, user_id } = body as any;
    if (!from || !to) return json({ ok: false, error: "from and to required" }, 400);

    // Resolve scope of stores user may see.
    let storesQ = supa.from("stores").select("id, name, branch_name, outlet_code, region, merchant_id, customer_id").eq("is_active", true);
    if (isPlatformAdmin) {
      // no filter
    } else if (isOwner) {
      if (!merchantId) return json({ ok: false, error: "no merchant scope" }, 403);
      storesQ = storesQ.or(`merchant_id.eq.${merchantId},customer_id.eq.${merchantId}`);
    } else if (isStoreUser) {
      const myStoreIds = [...new Set(roles.map((r) => r.store_id).filter(Boolean))] as string[];
      if (myStoreIds.length === 0) return json({ ok: false, error: "no store scope" }, 403);
      storesQ = storesQ.in("id", myStoreIds);
    } else {
      return json({ ok: false, error: "forbidden" }, 403);
    }
    const { data: stores, error: storesErr } = await storesQ;
    if (storesErr) return json({ ok: false, error: storesErr.message }, 500);
    let storeList = stores ?? [];
    if (store_id) storeList = storeList.filter((s) => s.id === store_id);
    const storeIds = storeList.map((s) => s.id);
    if (storeIds.length === 0) return json({ ok: true, scope: { is_owner: isOwner || isPlatformAdmin }, employees: [], rows: [], totals: {} });

    // Employees (user_roles in scope).
    let empQ = supa.from("user_roles")
      .select("id, user_id, role, store_id, is_active, staff_code, created_at")
      .in("store_id", storeIds)
      .in("role", ["staff", "store_manager", "cashier", "manager", "owner"]);
    if (roleFilter) empQ = empQ.eq("role", roleFilter);
    const { data: empRoles } = await empQ;
    const empRows = (empRoles ?? []) as any[];
    const userIds = [...new Set(empRows.map((r) => r.user_id).filter(Boolean))];
    const profMap = new Map<string, any>();
    if (userIds.length) {
      const { data: profs } = await supa.from("profiles").select("id, full_name, email").in("id", userIds);
      for (const p of profs ?? []) profMap.set(p.id, p);
    }
    const storeMap = new Map(storeList.map((s) => [s.id, s] as const));

    const fetchOrders = async (fromISO: string, toISO: string): Promise<Order[]> => {
      const { data, error } = await supa
        .from("orders")
        .select("id, store_id, status, total, subtotal, tax_total, tax, discount, paid_amount, payment_method, payment_breakdown, cashier_id, customer_id, items, created_at")
        .in("store_id", storeIds)
        .gte("created_at", fromISO).lte("created_at", toISO);
      if (error) throw error;
      return (data ?? []) as Order[];
    };

    const curr = await fetchOrders(from, to);
    const fromMs = new Date(from).getTime(), toMs = new Date(to).getTime();
    const span = Math.max(1, toMs - fromMs);
    const prev = await fetchOrders(new Date(fromMs - span).toISOString(), new Date(toMs - span).toISOString());

    const byCashier = (os: Order[]) => {
      const m = new Map<string, Order[]>();
      for (const o of os) {
        const k = o.cashier_id || "unassigned";
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(o);
      }
      return m;
    };
    const currMap = byCashier(curr);
    const prevMap = byCashier(prev);

    if (mode === "list") {
      // One row per employee role. Attribute orders by cashier_id.
      // Include "Unassigned" pseudo-employee for cashier_id not in roles.
      const seen = new Set<string>();
      const rows = empRows.map((r) => {
        const p = profMap.get(r.user_id);
        const orders = currMap.get(r.user_id) ?? [];
        const prevOrders = prevMap.get(r.user_id) ?? [];
        seen.add(r.user_id);
        const a = agg(orders); const pr = agg(prevOrders);
        const st = storeMap.get(r.store_id);
        return {
          user_role_id: r.id,
          user_id: r.user_id,
          name: p?.full_name || p?.email || "Unknown",
          email: p?.email,
          staff_code: r.staff_code,
          role: r.role,
          store_id: r.store_id,
          store_name: st?.name,
          outlet_code: st?.outlet_code,
          branch_name: st?.branch_name,
          region: st?.region,
          is_active: r.is_active,
          orders: a.orders, bills: a.bills,
          gross: a.gross, net: a.net, revenue: a.revenue, profit: a.profit,
          aov: a.aov, discount: a.discount,
          returns: a.returns, refunds: a.refunds, cancelled: a.cancelled,
          growth_pct: growth(a.revenue, pr.revenue),
        };
      });
      // Attribute orphan cashier rollups (cashier_id present but no role row visible).
      for (const [cid, os] of currMap.entries()) {
        if (cid === "unassigned" || seen.has(cid)) continue;
        const a = agg(os);
        const p = profMap.get(cid);
        rows.push({
          user_role_id: `orphan:${cid}`, user_id: cid,
          name: p?.full_name || p?.email || "Unattached Cashier",
          email: p?.email, staff_code: null, role: "cashier",
          store_id: os[0]?.store_id, store_name: storeMap.get(os[0]?.store_id ?? "")?.name,
          outlet_code: null, branch_name: null, region: null, is_active: true,
          orders: a.orders, bills: a.bills, gross: a.gross, net: a.net,
          revenue: a.revenue, profit: a.profit, aov: a.aov, discount: a.discount,
          returns: a.returns, refunds: a.refunds, cancelled: a.cancelled, growth_pct: null,
        } as any);
      }
      const totals = agg(curr);
      const totalEmployees = rows.length;
      const activeEmployees = rows.filter((r) => r.is_active).length;
      const sorted = [...rows].sort((a, b) => b.net - a.net);
      const summary = {
        total_employees: totalEmployees,
        active_employees: activeEmployees,
        total_sales: totals.net, total_orders: totals.orders, total_bills: totals.bills,
        avg_bill_value: totals.aov,
        avg_sales_per_employee: activeEmployees > 0 ? totals.net / activeEmployees : 0,
        highest_performer: sorted[0] ? { name: sorted[0].name, sales: sorted[0].net } : null,
        lowest_performer: sorted.length > 1 ? { name: sorted[sorted.length - 1].name, sales: sorted[sorted.length - 1].net } : null,
      };
      return json({ ok: true, scope: { is_owner: isOwner || isPlatformAdmin }, rows, totals, summary });
    }

    if (mode === "detail") {
      if (!user_id) return json({ ok: false, error: "user_id required" }, 400);
      const os = (currMap.get(user_id) ?? []);
      const prevOs = (prevMap.get(user_id) ?? []);
      const a = agg(os); const pr = agg(prevOs);
      const p = profMap.get(user_id);
      const myRole = empRows.find((r) => r.user_id === user_id);

      // Trends by day
      const dayMap = new Map<string, { revenue: number; orders: number; bills: number }>();
      for (const o of os) {
        if (o.status === "cancelled") continue;
        const d = new Date(o.created_at).toISOString().slice(0, 10);
        const e = dayMap.get(d) ?? { revenue: 0, orders: 0, bills: 0 };
        const t = num(o.tax_total ?? o.tax);
        e.revenue += num(o.total) - t; e.orders++; e.bills++;
        dayMap.set(d, e);
      }
      const daily = [...dayMap.entries()].sort().map(([date, v]) => ({ date, ...v }));

      // Monthly / yearly
      const bucket = (mode: "month" | "year") => {
        const m = new Map<string, number>();
        for (const o of os) {
          if (o.status === "cancelled") continue;
          const d = new Date(o.created_at);
          const k = mode === "month" ? d.toISOString().slice(0, 7) : String(d.getUTCFullYear());
          m.set(k, (m.get(k) ?? 0) + num(o.total));
        }
        return [...m.entries()].sort().map(([key, value]) => ({ key, value }));
      };

      // Peak hour / day
      const hourMap = new Map<number, number>();
      const dowMap = new Map<number, number>();
      for (const o of os) {
        if (o.status === "cancelled") continue;
        const d = new Date(o.created_at);
        hourMap.set(d.getHours(), (hourMap.get(d.getHours()) ?? 0) + num(o.total));
        dowMap.set(d.getDay(), (dowMap.get(d.getDay()) ?? 0) + num(o.total));
      }
      const peakHour = [...hourMap.entries()].sort((a, b) => b[1] - a[1])[0];
      const peakDow = [...dowMap.entries()].sort((a, b) => b[1] - a[1])[0];

      // Top products / categories
      const prodMap = new Map<string, { name: string; qty: number; revenue: number }>();
      const catMap = new Map<string, number>();
      for (const o of os) {
        if (o.status === "cancelled") continue;
        const arr = Array.isArray(o.items) ? o.items : [];
        for (const it of arr) {
          const key = it.id ?? it.product_id ?? it.name ?? "x";
          const name = it.name ?? "Item";
          const qty = num(it.qty ?? it.quantity ?? 1);
          const rev = num(it.price ?? it.unit_price ?? 0) * qty;
          if (!prodMap.has(key)) prodMap.set(key, { name, qty: 0, revenue: 0 });
          const ent = prodMap.get(key)!; ent.qty += qty; ent.revenue += rev;
          const cat = it.category ?? "Uncategorized";
          catMap.set(cat, (catMap.get(cat) ?? 0) + rev);
        }
      }
      const top_products = [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
      const top_categories = [...catMap.entries()].map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

      // Top customers
      const custMap = new Map<string, { id: string; spent: number; orders: number }>();
      for (const o of os) {
        if (o.status === "cancelled" || !o.customer_id) continue;
        if (!custMap.has(o.customer_id)) custMap.set(o.customer_id, { id: o.customer_id, spent: 0, orders: 0 });
        const c = custMap.get(o.customer_id)!; c.spent += num(o.total); c.orders++;
      }
      const top_customers = [...custMap.values()].sort((a, b) => b.spent - a.spent).slice(0, 10);

      // Payment split (incl. split payments)
      const payMap = new Map<string, number>();
      for (const o of os) {
        if (o.status === "cancelled") continue;
        const br = o.payment_breakdown;
        if (br && typeof br === "object") {
          const parts = Array.isArray(br) ? br : Object.entries(br).map(([method, amount]) => ({ method, amount }));
          for (const p of parts) {
            const m = (p.method || "unknown").toString().toLowerCase();
            payMap.set(m, (payMap.get(m) ?? 0) + num(p.amount));
          }
        } else {
          const m = (o.payment_method ?? "unknown").toLowerCase();
          payMap.set(m, (payMap.get(m) ?? 0) + num(o.total));
        }
      }
      const payments = [...payMap.entries()].map(([method, amount]) => ({ method, amount }));

      return json({
        ok: true,
        employee: {
          user_id, name: p?.full_name || p?.email || "Employee", email: p?.email,
          role: myRole?.role, store_id: myRole?.store_id,
          store_name: storeMap.get(myRole?.store_id ?? "")?.name,
          branch_name: storeMap.get(myRole?.store_id ?? "")?.branch_name,
          staff_code: myRole?.staff_code,
        },
        summary: { ...a, growth_pct: growth(a.revenue, pr.revenue) },
        daily, monthly: bucket("month"), yearly: bucket("year"),
        peak_hour: peakHour ? { hour: peakHour[0], sales: peakHour[1] } : null,
        peak_day: peakDow ? { dow: peakDow[0], sales: peakDow[1] } : null,
        top_products, top_categories, top_customers, payments,
      });
    }

    return json({ ok: false, error: "unknown mode" }, 400);
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
