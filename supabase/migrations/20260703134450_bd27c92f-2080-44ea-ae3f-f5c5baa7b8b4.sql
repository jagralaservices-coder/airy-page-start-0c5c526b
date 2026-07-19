-- Phase 2: CRM, Loyalty & Marketing Intelligence

-- 1. LOYALTY SETTINGS
CREATE TABLE public.loyalty_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  points_per_currency numeric NOT NULL DEFAULT 1,
  currency_per_point numeric NOT NULL DEFAULT 0.1,
  min_order_amount numeric NOT NULL DEFAULT 0,
  max_redemption_percent numeric NOT NULL DEFAULT 100,
  validity_days integer NOT NULL DEFAULT 365,
  welcome_bonus_points integer NOT NULL DEFAULT 0,
  birthday_bonus_points integer NOT NULL DEFAULT 0,
  tier_bronze_min_spend numeric NOT NULL DEFAULT 0,
  tier_silver_min_spend numeric NOT NULL DEFAULT 10000,
  tier_gold_min_spend numeric NOT NULL DEFAULT 50000,
  tier_platinum_min_spend numeric NOT NULL DEFAULT 100000,
  tier_diamond_min_spend numeric NOT NULL DEFAULT 250000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_settings TO authenticated;
GRANT ALL ON public.loyalty_settings TO service_role;
ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access loyalty settings for their merchant"
ON public.loyalty_settings FOR ALL TO authenticated
USING (public.user_in_merchant(auth.uid(), merchant_id))
WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id));

-- 2. LOYALTY POINTS LEDGER
CREATE TABLE public.loyalty_points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.pos_customers(id) ON DELETE CASCADE,
  transaction_type varchar NOT NULL CHECK (transaction_type IN ('earn','redeem','expire','manual_adjustment','bonus','refund')),
  points integer NOT NULL,
  balance_after integer NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_points_ledger TO authenticated;
GRANT ALL ON public.loyalty_points_ledger TO service_role;
ALTER TABLE public.loyalty_points_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access loyalty ledger for their merchant"
ON public.loyalty_points_ledger FOR ALL TO authenticated
USING (public.user_in_merchant(auth.uid(), merchant_id))
WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id));

-- 3. COUPONS
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  code varchar NOT NULL,
  name varchar NOT NULL,
  discount_type varchar NOT NULL CHECK (discount_type IN ('flat','percentage','free_item','combo','bogo')),
  discount_value numeric NOT NULL DEFAULT 0,
  min_order_amount numeric NOT NULL DEFAULT 0,
  max_discount_amount numeric,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  usage_limit integer,
  customer_usage_limit integer DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  applicable_stores uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access coupons for their merchant"
ON public.coupons FOR ALL TO authenticated
USING (public.user_in_merchant(auth.uid(), merchant_id))
WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id));

-- 4. COUPON USAGE
CREATE TABLE public.coupon_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.pos_customers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  discount_given numeric NOT NULL,
  order_amount numeric NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_usage TO authenticated;
GRANT ALL ON public.coupon_usage TO service_role;
ALTER TABLE public.coupon_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access coupon usage for their merchant"
ON public.coupon_usage FOR ALL TO authenticated
USING (public.user_in_merchant(auth.uid(), merchant_id))
WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id));

-- 5. ALTER pos_customers
ALTER TABLE public.pos_customers ADD COLUMN IF NOT EXISTS acquisition_source varchar DEFAULT 'Walk-in';
ALTER TABLE public.pos_customers ADD COLUMN IF NOT EXISTS loyalty_points integer DEFAULT 0;
ALTER TABLE public.pos_customers ADD COLUMN IF NOT EXISTS loyalty_tier varchar DEFAULT 'Bronze';

-- 6. RPC: Customer Acquisition
CREATE OR REPLACE FUNCTION public.get_customer_acquisition_report(p_merchant_id UUID)
RETURNS TABLE (
  customer_id UUID, customer_name VARCHAR, source VARCHAR,
  registration_date TIMESTAMPTZ, first_order_date TIMESTAMPTZ, first_order_value NUMERIC,
  total_orders BIGINT, total_revenue NUMERIC, total_profit NUMERIC,
  retention_status VARCHAR, lifetime_value NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH customer_stats AS (
    SELECT c.id, c.name::VARCHAR AS name, c.acquisition_source::VARCHAR AS source, c.created_at AS registration_date,
      MIN(o.created_at) AS first_order_date,
      (SELECT total FROM public.orders o2 WHERE o2.customer_id = c.id AND o2.status <> 'cancelled' ORDER BY created_at ASC LIMIT 1) AS first_order_value,
      COUNT(o.id) FILTER (WHERE o.status <> 'cancelled') AS total_orders,
      COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'cancelled'),0) AS total_revenue,
      COALESCE(SUM(o.total - COALESCE(o.tax,0) - COALESCE(o.discount,0)) FILTER (WHERE o.status <> 'cancelled'),0) AS total_profit,
      MAX(o.created_at) AS last_order_date
    FROM public.pos_customers c
    LEFT JOIN public.orders o ON o.customer_id = c.id
    WHERE c.merchant_id = p_merchant_id OR c.store_id IN (SELECT id FROM public.stores WHERE merchant_id = p_merchant_id)
    GROUP BY c.id, c.name, c.acquisition_source, c.created_at
  )
  SELECT cs.id, cs.name, cs.source, cs.registration_date, cs.first_order_date,
    COALESCE(cs.first_order_value,0), cs.total_orders, cs.total_revenue, cs.total_profit,
    (CASE
      WHEN cs.total_orders > 1 AND cs.last_order_date >= (now() - interval '30 days') THEN 'Active'
      WHEN cs.total_orders > 1 THEN 'At Risk'
      WHEN cs.total_orders = 1 THEN 'New'
      ELSE 'Inactive' END)::VARCHAR,
    cs.total_revenue
  FROM customer_stats cs
  ORDER BY cs.registration_date DESC;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_customer_acquisition_report(UUID) TO authenticated;

-- 7. RPC: Customer Loyalty
CREATE OR REPLACE FUNCTION public.get_customer_loyalty_report(p_merchant_id UUID)
RETURNS TABLE (
  customer_id UUID, customer_name VARCHAR, tier VARCHAR, current_points INTEGER,
  earned_points BIGINT, redeemed_points BIGINT, expired_points BIGINT,
  total_orders BIGINT, total_revenue NUMERIC, last_visit TIMESTAMPTZ, membership_date TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH ledger_stats AS (
    SELECT customer_id,
      COALESCE(SUM(points) FILTER (WHERE transaction_type IN ('earn','bonus','manual_adjustment') AND points > 0),0) AS earned,
      COALESCE(SUM(ABS(points)) FILTER (WHERE transaction_type = 'redeem'),0) AS redeemed,
      COALESCE(SUM(ABS(points)) FILTER (WHERE transaction_type = 'expire'),0) AS expired
    FROM public.loyalty_points_ledger WHERE merchant_id = p_merchant_id
    GROUP BY customer_id
  ), order_stats AS (
    SELECT customer_id, COUNT(id) AS orders_count, COALESCE(SUM(total),0) AS revenue, MAX(created_at) AS last_order
    FROM public.orders WHERE status <> 'cancelled' GROUP BY customer_id
  )
  SELECT c.id, c.name::VARCHAR, c.loyalty_tier::VARCHAR, c.loyalty_points,
    COALESCE(ls.earned,0)::BIGINT, COALESCE(ls.redeemed,0)::BIGINT, COALESCE(ls.expired,0)::BIGINT,
    COALESCE(os.orders_count,0), COALESCE(os.revenue,0), os.last_order, c.created_at
  FROM public.pos_customers c
  LEFT JOIN ledger_stats ls ON ls.customer_id = c.id
  LEFT JOIN order_stats os ON os.customer_id = c.id
  WHERE c.merchant_id = p_merchant_id OR c.store_id IN (SELECT id FROM public.stores WHERE merchant_id = p_merchant_id)
  ORDER BY c.loyalty_points DESC;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_customer_loyalty_report(UUID) TO authenticated;

-- 8. RPC: Loyalty Points Ledger
CREATE OR REPLACE FUNCTION public.get_loyalty_points_ledger_report(p_merchant_id UUID)
RETURNS TABLE (
  transaction_id UUID, transaction_date TIMESTAMPTZ, customer_id UUID, customer_name VARCHAR,
  transaction_type VARCHAR, points INTEGER, balance_after INTEGER, reference VARCHAR,
  order_number VARCHAR, store_name VARCHAR
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT l.id, l.created_at, l.customer_id, c.name::VARCHAR, l.transaction_type::VARCHAR,
    l.points, l.balance_after, l.notes::VARCHAR, o.order_number::VARCHAR, s.name::VARCHAR
  FROM public.loyalty_points_ledger l
  JOIN public.pos_customers c ON c.id = l.customer_id
  LEFT JOIN public.orders o ON o.id = l.order_id
  LEFT JOIN public.stores s ON s.id = l.store_id
  WHERE l.merchant_id = p_merchant_id
  ORDER BY l.created_at DESC;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_loyalty_points_ledger_report(UUID) TO authenticated;

-- 9. RPC: Coupon Usage
CREATE OR REPLACE FUNCTION public.get_coupon_usage_report(p_merchant_id UUID)
RETURNS TABLE (
  coupon_id UUID, coupon_code VARCHAR, coupon_name VARCHAR, created_date TIMESTAMPTZ,
  valid_from TIMESTAMPTZ, valid_to TIMESTAMPTZ, times_used BIGINT, revenue_generated NUMERIC,
  discount_given NUMERIC, avg_order_value NUMERIC, customers_used BIGINT, status VARCHAR
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH usage_stats AS (
    SELECT cu.coupon_id, COUNT(cu.id) AS total_uses,
      COALESCE(SUM(cu.order_amount),0) AS total_revenue,
      COALESCE(SUM(cu.discount_given),0) AS total_discount,
      COUNT(DISTINCT cu.customer_id) AS unique_customers
    FROM public.coupon_usage cu WHERE cu.merchant_id = p_merchant_id GROUP BY cu.coupon_id
  )
  SELECT c.id, c.code::VARCHAR, c.name::VARCHAR, c.created_at, c.valid_from, c.valid_to,
    COALESCE(us.total_uses,0), COALESCE(us.total_revenue,0), COALESCE(us.total_discount,0),
    CASE WHEN us.total_uses > 0 THEN us.total_revenue / us.total_uses ELSE 0 END,
    COALESCE(us.unique_customers,0),
    (CASE
      WHEN c.is_active = false THEN 'Disabled'
      WHEN c.valid_to IS NOT NULL AND c.valid_to < now() THEN 'Expired'
      WHEN c.usage_limit IS NOT NULL AND us.total_uses >= c.usage_limit THEN 'Limit Reached'
      ELSE 'Active' END)::VARCHAR
  FROM public.coupons c
  LEFT JOIN usage_stats us ON us.coupon_id = c.id
  WHERE c.merchant_id = p_merchant_id
  ORDER BY c.created_at DESC;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_coupon_usage_report(UUID) TO authenticated;

-- updated_at triggers
CREATE TRIGGER trg_loyalty_settings_updated BEFORE UPDATE ON public.loyalty_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_coupons_updated BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
