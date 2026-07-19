
-- Customer Intelligence Reports (adapted to actual schema: orders/credit_ledger, no pos_orders/pos_credit_ledger)

CREATE OR REPLACE FUNCTION public.get_customer_clv_report(p_merchant_id UUID)
RETURNS TABLE (
  customer_id UUID, customer_name VARCHAR, mobile VARCHAR, email VARCHAR,
  customer_since TIMESTAMPTZ, total_orders BIGINT, completed_orders BIGINT, cancelled_orders BIGINT,
  total_revenue NUMERIC, total_profit NUMERIC, avg_order_value NUMERIC,
  last_order_date TIMESTAMPTZ, purchase_frequency NUMERIC, estimated_clv NUMERIC,
  credit_used NUMERIC, credit_paid NUMERIC, outstanding_credit NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH co AS (
    SELECT c.id, c.name::VARCHAR AS name, c.phone::VARCHAR AS phone, c.email::VARCHAR AS email, c.created_at,
      COUNT(o.id) AS total_c,
      COUNT(o.id) FILTER (WHERE o.status='completed') AS comp_c,
      COUNT(o.id) FILTER (WHERE o.status='cancelled') AS canc_c,
      COALESCE(SUM(o.total) FILTER (WHERE o.status='completed'),0) AS rev,
      MAX(o.created_at) AS last_ord,
      COALESCE(SUM(o.total) FILTER (WHERE o.status='completed'),0)*0.4 AS prof
    FROM public.pos_customers c
    LEFT JOIN public.stores s ON s.id = c.store_id
    LEFT JOIN public.orders o ON o.customer_id = c.id AND o.store_id = c.store_id
    WHERE c.merchant_id = p_merchant_id
    GROUP BY c.id
  ), cc AS (
    SELECT c.id,
      COALESCE(SUM(l.due_amount),0) AS c_used,
      COALESCE(SUM(l.paid_amount),0) AS c_paid
    FROM public.pos_customers c
    LEFT JOIN public.credit_ledger l ON l.customer_id = c.id
    WHERE c.merchant_id = p_merchant_id
    GROUP BY c.id
  )
  SELECT co.id, co.name, co.phone, co.email, co.created_at,
    co.total_c, co.comp_c, co.canc_c, co.rev, co.prof,
    CASE WHEN co.comp_c>0 THEN co.rev/co.comp_c ELSE 0 END,
    co.last_ord, co.comp_c::NUMERIC,
    (CASE WHEN co.comp_c>0 THEN co.rev/co.comp_c ELSE 0 END)*co.comp_c::NUMERIC*1.5,
    cc.c_used, cc.c_paid, (cc.c_used - cc.c_paid)
  FROM co LEFT JOIN cc ON cc.id = co.id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_customer_segmentation_report(p_merchant_id UUID)
RETURNS TABLE (
  customer_id UUID, customer_name VARCHAR, segment VARCHAR, orders BIGINT,
  revenue NUMERIC, profit NUMERIC, last_visit TIMESTAMPTZ, avg_spend NUMERIC, credit_balance NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH s AS (
    SELECT c.id, c.name::VARCHAR AS name, c.created_at,
      COUNT(o.id) FILTER (WHERE o.status='completed') AS oc,
      COALESCE(SUM(o.total) FILTER (WHERE o.status='completed'),0) AS rev,
      MAX(o.created_at) FILTER (WHERE o.status='completed') AS lv,
      COALESCE((SELECT SUM(due_amount - paid_amount) FROM public.credit_ledger WHERE customer_id=c.id),0) AS out_c
    FROM public.pos_customers c
    LEFT JOIN public.orders o ON o.customer_id=c.id AND o.store_id=c.store_id
    WHERE c.merchant_id = p_merchant_id
    GROUP BY c.id
  )
  SELECT s.id, s.name,
    (CASE
      WHEN s.rev > 10000 THEN 'VIP'
      WHEN s.oc >= 5 THEN 'Regular'
      WHEN s.lv < NOW() - INTERVAL '180 days' THEN 'Lost'
      WHEN s.lv < NOW() - INTERVAL '90 days' THEN 'Inactive'
      WHEN s.created_at > NOW() - INTERVAL '30 days' THEN 'New'
      ELSE 'Occasional' END)::VARCHAR,
    s.oc, s.rev, s.rev*0.4, s.lv,
    CASE WHEN s.oc>0 THEN s.rev/s.oc ELSE 0 END, s.out_c
  FROM s;
END; $$;

CREATE OR REPLACE FUNCTION public.get_high_value_customers_report(p_merchant_id UUID)
RETURNS TABLE (
  customer_id UUID, customer_name VARCHAR, lifetime_revenue NUMERIC, lifetime_profit NUMERIC,
  avg_bill NUMERIC, visits BIGINT, last_visit TIMESTAMPTZ, outstanding_credit NUMERIC, ranking BIGINT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH s AS (
    SELECT c.id, c.name::VARCHAR AS name,
      COUNT(o.id) FILTER (WHERE o.status='completed') AS v,
      COALESCE(SUM(o.total) FILTER (WHERE o.status='completed'),0) AS rev,
      MAX(o.created_at) FILTER (WHERE o.status='completed') AS lv,
      COALESCE((SELECT SUM(due_amount - paid_amount) FROM public.credit_ledger WHERE customer_id=c.id),0) AS oc
    FROM public.pos_customers c
    LEFT JOIN public.orders o ON o.customer_id=c.id AND o.store_id=c.store_id
    WHERE c.merchant_id = p_merchant_id
    GROUP BY c.id
  )
  SELECT s.id, s.name, s.rev, s.rev*0.4,
    CASE WHEN s.v>0 THEN s.rev/s.v ELSE 0 END,
    s.v, s.lv, s.oc,
    ROW_NUMBER() OVER (ORDER BY s.rev DESC)
  FROM s WHERE s.rev > 0;
END; $$;

CREATE OR REPLACE FUNCTION public.get_customer_credit_aging_report(p_merchant_id UUID)
RETURNS TABLE (
  customer_id UUID, customer_name VARCHAR, mobile VARCHAR, outstanding NUMERIC,
  days_0_30 NUMERIC, days_31_60 NUMERIC, days_61_90 NUMERIC, days_91_180 NUMERIC, days_180_plus NUMERIC,
  last_payment TIMESTAMPTZ, last_bill TIMESTAMPTZ, credit_limit NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH a AS (
    SELECT c.id, c.name::VARCHAR AS name, c.phone::VARCHAR AS phone, COALESCE(c.credit_limit,0) AS climit,
      COALESCE(SUM(l.due_amount - l.paid_amount),0) AS tot,
      COALESCE(SUM(l.due_amount - l.paid_amount) FILTER (WHERE l.created_at >= NOW()-INTERVAL '30 days'),0) AS d1,
      COALESCE(SUM(l.due_amount - l.paid_amount) FILTER (WHERE l.created_at >= NOW()-INTERVAL '60 days' AND l.created_at < NOW()-INTERVAL '30 days'),0) AS d2,
      COALESCE(SUM(l.due_amount - l.paid_amount) FILTER (WHERE l.created_at >= NOW()-INTERVAL '90 days' AND l.created_at < NOW()-INTERVAL '60 days'),0) AS d3,
      COALESCE(SUM(l.due_amount - l.paid_amount) FILTER (WHERE l.created_at >= NOW()-INTERVAL '180 days' AND l.created_at < NOW()-INTERVAL '90 days'),0) AS d4,
      COALESCE(SUM(l.due_amount - l.paid_amount) FILTER (WHERE l.created_at < NOW()-INTERVAL '180 days'),0) AS d5,
      MAX(l.updated_at) FILTER (WHERE l.paid_amount > 0) AS lp,
      MAX(l.created_at) AS lb
    FROM public.pos_customers c
    LEFT JOIN public.credit_ledger l ON l.customer_id=c.id
    WHERE c.merchant_id = p_merchant_id
    GROUP BY c.id
  )
  SELECT a.id, a.name, a.phone, a.tot, a.d1, a.d2, a.d3, a.d4, a.d5, a.lp, a.lb, a.climit
  FROM a WHERE a.tot > 0;
END; $$;

CREATE OR REPLACE FUNCTION public.get_customer_profitability_report(p_merchant_id UUID)
RETURNS TABLE (
  customer_id UUID, customer_name VARCHAR, revenue NUMERIC, gross_profit NUMERIC, net_profit NUMERIC,
  margin_percent NUMERIC, discount_given NUMERIC, refund_amount NUMERIC, credit_balance NUMERIC,
  orders BIGINT, avg_bill NUMERIC, ranking BIGINT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH p AS (
    SELECT c.id, c.name::VARCHAR AS name,
      COUNT(o.id) FILTER (WHERE o.status='completed') AS oc,
      COALESCE(SUM(o.total) FILTER (WHERE o.status='completed'),0) AS rev,
      COALESCE(SUM(o.discount) FILTER (WHERE o.status='completed'),0) AS disc,
      COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('cancelled','refunded')),0) AS ref,
      COALESCE((SELECT SUM(due_amount - paid_amount) FROM public.credit_ledger WHERE customer_id=c.id),0) AS cb
    FROM public.pos_customers c
    LEFT JOIN public.orders o ON o.customer_id=c.id AND o.store_id=c.store_id
    WHERE c.merchant_id = p_merchant_id
    GROUP BY c.id
  )
  SELECT p.id, p.name, p.rev, p.rev*0.4, (p.rev*0.4)-p.disc,
    CASE WHEN p.rev>0 THEN (((p.rev*0.4)-p.disc)/p.rev)*100 ELSE 0 END,
    p.disc, p.ref, p.cb, p.oc,
    CASE WHEN p.oc>0 THEN p.rev/p.oc ELSE 0 END,
    ROW_NUMBER() OVER (ORDER BY ((p.rev*0.4)-p.disc) DESC)
  FROM p WHERE p.rev > 0;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_customer_clv_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_segmentation_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_high_value_customers_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_credit_aging_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_profitability_report(UUID) TO authenticated;
