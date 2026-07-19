// Brand-Wise Sales Report — backend aggregation with RBAC.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Payload {
  store_id?: string;
  store_ids?: string[];
  from: string;
  to: string;
  brand_id?: string | null;
  brand_type?: 'internal' | 'external' | null;
  category_id?: string | null;
  payment_method?: string | null;
  order_type?: string | null;
  customer_id?: string | null;
  salesperson_id?: string | null;
  drill?: boolean;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0)) || 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: 'unauthorized' });
    const userId = userData.user.id;

    const body = (await req.json()) as Payload;
    if (!body?.from || !body?.to) return json(400, { error: 'from/to required' });

    // RBAC scope
    const { data: roles } = await admin
      .from('user_roles')
      .select('role, store_id, merchant_id, customer_id, is_active')
      .eq('user_id', userId)
      .eq('is_active', true);

    const isOwner = !!roles?.some((r) =>
      ['super_admin', 'admin', 'owner', 'merchant'].includes(r.role as string),
    );

    let storeIds: string[] = [];
    if (isOwner) {
      if (body.store_ids?.length) storeIds = body.store_ids;
      else if (body.store_id) storeIds = [body.store_id];
      else {
        const merchantIds = Array.from(
          new Set(
            (roles ?? [])
              .map((r) => r.merchant_id || r.customer_id)
              .filter(Boolean) as string[],
          ),
        );
        let q = admin.from('stores').select('id').eq('is_active', true);
        if (merchantIds.length) q = q.in('merchant_id', merchantIds);
        const { data: s } = await q;
        storeIds = (s ?? []).map((x: any) => x.id);
      }
    } else {
      const allowed = Array.from(
        new Set((roles ?? []).map((r) => r.store_id).filter(Boolean) as string[]),
      );
      const requested = body.store_id ? [body.store_id] : allowed;
      storeIds = requested.filter((id) => allowed.includes(id));
      if (storeIds.length === 0) return json(403, { error: 'no_store_scope' });
    }
    if (storeIds.length === 0) return json(200, emptyResponse());

    // Pull brands and stores (for fallback naming)
    const [{ data: brandsRows }, { data: storeRows }] = await Promise.all([
      admin.from('brands').select('id, name, brand_type, store_id').in('store_id', storeIds),
      admin
        .from('stores')
        .select('id, name, default_internal_brand, brand_type_default')
        .in('id', storeIds),
    ]);
    const brandsById = new Map<string, any>((brandsRows ?? []).map((b: any) => [b.id, b]));
    const storeById = new Map<string, any>((storeRows ?? []).map((s: any) => [s.id, s]));

    // Pull products to map item.id → brand
    const { data: productRows } = await admin
      .from('products')
      .select('id, name, brand_id, brand_type, category_id, store_id, cost')
      .in('store_id', storeIds);
    const productById = new Map<string, any>(
      (productRows ?? []).map((p: any) => [p.id, p]),
    );

    // ── Aggregate one period ─────────────────────────────────
    const aggregate = async (fromIso: string, toIso: string) => {
      let q = admin
        .from('orders')
        .select(
          'id, store_id, total, subtotal, tax, discount, items, payment_method, order_type, customer_id, status, created_at',
        )
        .in('store_id', storeIds)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .neq('status', 'cancelled');
      if (body.payment_method) q = q.eq('payment_method', body.payment_method);
      if (body.order_type) q = q.eq('order_type', body.order_type);
      if (body.customer_id) q = q.eq('customer_id', body.customer_id);
      const { data: orders, error } = await q.limit(50000);
      if (error) throw error;

      type Bucket = {
        brandKey: string;
        brandName: string;
        brandType: 'internal' | 'external';
        products: Set<string>;
        qty: number;
        gross: number;
        discount: number;
        tax: number;
        revenue: number;
        cogs: number;
        orderIds: Set<string>;
      };
      const buckets = new Map<string, Bucket>();
      const trend: Record<string, Record<string, number>> = {}; // date → brandKey → revenue
      const topProducts = new Map<string, { name: string; brandKey: string; qty: number; revenue: number }>();
      const topCustomers = new Map<string, { id: string; qty: number; spent: number }>();
      const categoryByBrand = new Map<string, Map<string, number>>();
      let totalBills = 0;

      for (const o of orders ?? []) {
        const items = Array.isArray((o as any).items) ? (o as any).items : [];
        if (!items.length) continue;
        const subtotal = num(o.subtotal) || items.reduce((s: number, it: any) => s + num(it.price) * num(it.quantity || 1), 0);
        const discount = num(o.discount);
        const tax = num(o.tax);
        const revenueOrder = num(o.total);
        totalBills++;
        const storeMeta = storeById.get(o.store_id) ?? {};
        const fallbackBrandName: string =
          storeMeta.default_internal_brand || storeMeta.name || 'House Brand';
        const fallbackKey = `house:${o.store_id}`;
        const dateKey = String(o.created_at).slice(0, 10);

        for (const it of items) {
          const qty = num(it.quantity || 1);
          const price = num(it.price);
          const lineGross = price * qty;
          const share = subtotal > 0 ? lineGross / subtotal : 0;
          const lineDiscount = discount * share;
          const lineTax = tax * share;
          const lineRevenue = revenueOrder * share;

          const prod = productById.get(it.id) || productById.get(it.productId) || productById.get(it.product_id);
          // Prefer brand fields embedded in the cart item (set from MenuItem at sale time),
          // then fall back to the linked product row, then to the store's House Brand.
          const embeddedBrandId = it.brandId ?? it.brand_id ?? null;
          const embeddedBrandName = it.brandName ?? it.brand_name ?? null;
          const embeddedBrandType = it.brandType ?? it.brand_type ?? null;
          const brandId = embeddedBrandId ?? prod?.brand_id ?? null;
          const brandRow = brandId ? brandsById.get(brandId) : null;
          const brandType: 'internal' | 'external' = brandRow
            ? brandRow.brand_type
            : (embeddedBrandType as 'internal' | 'external' | null)
            ?? prod?.brand_type
            ?? 'internal';
          const brandKey = brandId ?? fallbackKey;
          const brandName = brandRow?.name ?? embeddedBrandName ?? fallbackBrandName;

          // Apply optional filters
          if (body.brand_id && brandKey !== body.brand_id) continue;
          if (body.brand_type && brandType !== body.brand_type) continue;
          if (body.category_id && prod?.category_id !== body.category_id) continue;

          let b = buckets.get(brandKey);
          if (!b) {
            b = {
              brandKey,
              brandName,
              brandType,
              products: new Set(),
              qty: 0,
              gross: 0,
              discount: 0,
              tax: 0,
              revenue: 0,
              cogs: 0,
              orderIds: new Set(),
            };
            buckets.set(brandKey, b);
          }
          b.qty += qty;
          b.gross += lineGross;
          b.discount += lineDiscount;
          b.tax += lineTax;
          b.revenue += lineRevenue;
          b.cogs += num(prod?.cost) * qty;
          b.products.add(String(it.id ?? it.name));
          b.orderIds.add(o.id);

          if (!trend[dateKey]) trend[dateKey] = {};
          trend[dateKey][brandKey] = (trend[dateKey][brandKey] ?? 0) + lineRevenue;

          const pkey = `${brandKey}::${it.id ?? it.name}`;
          const tp = topProducts.get(pkey) || { name: it.name, brandKey, qty: 0, revenue: 0 };
          tp.qty += qty;
          tp.revenue += lineRevenue;
          topProducts.set(pkey, tp);

          const catKey = prod?.category_id || it.category || 'Uncategorized';
          if (!categoryByBrand.has(brandKey)) categoryByBrand.set(brandKey, new Map());
          const cm = categoryByBrand.get(brandKey)!;
          cm.set(catKey, (cm.get(catKey) ?? 0) + lineRevenue);
        }

        if (o.customer_id) {
          const c = topCustomers.get(o.customer_id) || { id: o.customer_id, qty: 0, spent: 0 };
          c.spent += revenueOrder;
          c.qty += 1;
          topCustomers.set(o.customer_id, c);
        }
      }

      const brands = Array.from(buckets.values()).map((b) => {
        const net = b.gross - b.discount;
        const profit = net - b.cogs;
        const margin = net > 0 ? (profit / net) * 100 : 0;
        const orders = b.orderIds.size;
        const aov = orders > 0 ? b.revenue / orders : 0;
        return {
          brand_id: b.brandKey,
          brand_name: b.brandName,
          brand_type: b.brandType,
          products_count: b.products.size,
          qty: b.qty,
          gross: b.gross,
          discount: b.discount,
          tax: b.tax,
          net,
          revenue: b.revenue,
          cogs: b.cogs,
          profit,
          margin_pct: margin,
          orders,
          bills: orders,
          aov,
        };
      });

      const trendOut = Object.entries(trend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, byBrand]) => ({ date, ...byBrand }));

      const totals = brands.reduce(
        (s, b) => ({
          gross: s.gross + b.gross,
          discount: s.discount + b.discount,
          tax: s.tax + b.tax,
          net: s.net + b.net,
          revenue: s.revenue + b.revenue,
          profit: s.profit + b.profit,
          qty: s.qty + b.qty,
          products: s.products + b.products_count,
          orders: s.orders + b.orders,
        }),
        { gross: 0, discount: 0, tax: 0, net: 0, revenue: 0, profit: 0, qty: 0, products: 0, orders: 0 },
      );

      const topProductsOut = Array.from(topProducts.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 25);

      return {
        brands,
        trend: trendOut,
        totals,
        bills: totalBills,
        topProducts: topProductsOut,
        topCustomers: Array.from(topCustomers.values()).sort((a, b) => b.spent - a.spent).slice(0, 25),
        categoryByBrand: Array.from(categoryByBrand.entries()).map(([brandKey, m]) => ({
          brandKey,
          categories: Array.from(m.entries()).map(([category, revenue]) => ({ category, revenue })),
        })),
      };
    };

    // Date arithmetic for previous period
    const fromDate = new Date(body.from);
    const toDate = new Date(body.to);
    const spanMs = toDate.getTime() - fromDate.getTime();
    const prevTo = new Date(fromDate.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - spanMs);

    const [current, previous] = await Promise.all([
      aggregate(fromDate.toISOString(), toDate.toISOString()),
      aggregate(prevFrom.toISOString(), prevTo.toISOString()),
    ]);

    // Growth %
    const prevByBrand = new Map(previous.brands.map((b: any) => [b.brand_id, b.revenue]));
    const brandsWithGrowth = current.brands.map((b: any) => {
      const prev = prevByBrand.get(b.brand_id) ?? 0;
      const growth = prev === 0 ? (b.revenue > 0 ? null : 0) : ((b.revenue - prev) / prev) * 100;
      return { ...b, prev_revenue: prev, growth_pct: growth };
    });

    return json(200, {
      ok: true,
      scope: { is_owner: isOwner, store_ids: storeIds },
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      previous_period: { from: prevFrom.toISOString(), to: prevTo.toISOString() },
      brands: brandsWithGrowth,
      totals: current.totals,
      previous_totals: previous.totals,
      bills: current.bills,
      trend: current.trend,
      top_products: current.topProducts,
      top_customers: current.topCustomers,
      category_by_brand: current.categoryByBrand,
    });
  } catch (err) {
    console.error('[brand-sales-report]', err);
    return json(500, { error: 'internal_error', message: (err as Error).message });
  }
});

function emptyResponse() {
  return {
    ok: true,
    brands: [],
    totals: { gross: 0, discount: 0, tax: 0, net: 0, revenue: 0, profit: 0, qty: 0, products: 0, orders: 0 },
    previous_totals: { gross: 0, discount: 0, tax: 0, net: 0, revenue: 0, profit: 0, qty: 0, products: 0, orders: 0 },
    bills: 0,
    trend: [],
    top_products: [],
    top_customers: [],
    category_by_brand: [],
  };
}
