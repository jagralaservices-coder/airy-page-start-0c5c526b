
-- 1. Alter pos_customers
ALTER TABLE public.pos_customers
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS anniversary_date date,
  ADD COLUMN IF NOT EXISTS wedding_anniversary date;

-- 2. customer_feedbacks
CREATE TABLE public.customer_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.pos_customers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('pos','qr','whatsapp','website','app','email','manual')),
  type text NOT NULL CHECK (type IN ('complaint','suggestion','appreciation','service','food','delivery','staff','billing','cleanliness','display')),
  rating integer CHECK (rating >= 1 AND rating <= 5),
  comments text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved')),
  assigned_to uuid REFERENCES auth.users(id),
  resolution_time interval,
  resolution_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_feedbacks TO authenticated;
GRANT ALL ON public.customer_feedbacks TO service_role;
ALTER TABLE public.customer_feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access feedbacks in their merchant stores"
ON public.customer_feedbacks FOR ALL TO authenticated
USING (store_id IN (SELECT id FROM public.stores WHERE public.can_manage_store(id)))
WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE public.can_manage_store(id)));

CREATE TRIGGER trg_customer_feedbacks_updated_at
BEFORE UPDATE ON public.customer_feedbacks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. customer_csat_scores
CREATE TABLE public.customer_csat_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.pos_customers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  rating_scale integer NOT NULL CHECK (rating_scale IN (5,10)),
  rating_value integer NOT NULL,
  nps_category text CHECK (nps_category IN ('promoter','passive','detractor')),
  category text CHECK (category IN ('food','service','delivery','staff','billing','ambience','overall')),
  comments text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_csat_scores TO authenticated;
GRANT ALL ON public.customer_csat_scores TO service_role;
ALTER TABLE public.customer_csat_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access CSAT in their merchant stores"
ON public.customer_csat_scores FOR ALL TO authenticated
USING (store_id IN (SELECT id FROM public.stores WHERE public.can_manage_store(id)))
WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE public.can_manage_store(id)));

-- 4. Feedback report
CREATE OR REPLACE FUNCTION public.get_customer_feedback_report(p_merchant_id uuid)
RETURNS TABLE (
  id uuid, customer_id uuid, customer_name varchar, order_id uuid, order_number varchar,
  source text, type text, rating integer, comments text, status text,
  assigned_to uuid, resolution_time interval, resolution_status text,
  created_at timestamptz, store_id uuid, store_name text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT f.id, f.customer_id, c.name::varchar, f.order_id, o.order_number::varchar,
    f.source, f.type, f.rating, f.comments, f.status,
    f.assigned_to, f.resolution_time, f.resolution_status,
    f.created_at, f.store_id, s.name::text
  FROM public.customer_feedbacks f
  LEFT JOIN public.pos_customers c ON f.customer_id = c.id
  LEFT JOIN public.orders o ON f.order_id = o.id
  LEFT JOIN public.stores s ON f.store_id = s.id
  WHERE f.merchant_id = p_merchant_id
  ORDER BY f.created_at DESC;
END; $$;

-- 5. CSAT report
CREATE OR REPLACE FUNCTION public.get_customer_csat_report(p_merchant_id uuid)
RETURNS TABLE (
  id uuid, customer_id uuid, customer_name varchar, order_id uuid, order_number varchar,
  rating_scale integer, rating_value integer, nps_category text, category text,
  comments text, created_at timestamptz, store_id uuid, store_name text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT cs.id, cs.customer_id, c.name::varchar, cs.order_id, o.order_number::varchar,
    cs.rating_scale, cs.rating_value, cs.nps_category, cs.category,
    cs.comments, cs.created_at, cs.store_id, s.name::text
  FROM public.customer_csat_scores cs
  LEFT JOIN public.pos_customers c ON cs.customer_id = c.id
  LEFT JOIN public.orders o ON cs.order_id = o.id
  LEFT JOIN public.stores s ON cs.store_id = s.id
  WHERE cs.merchant_id = p_merchant_id
  ORDER BY cs.created_at DESC;
END; $$;

-- 6. Birthday report
CREATE OR REPLACE FUNCTION public.get_customer_birthday_report(p_merchant_id uuid)
RETURNS TABLE (
  customer_id uuid, customer_name varchar, phone varchar, email varchar,
  date_of_birth date, anniversary_date date, wedding_anniversary date,
  age integer, upcoming_in_days integer, last_visit timestamptz,
  lifetime_value numeric, store_id uuid, store_name text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name::varchar, c.phone::varchar, c.email::varchar,
    c.date_of_birth, c.anniversary_date, c.wedding_anniversary,
    (EXTRACT(YEAR FROM current_date) - EXTRACT(YEAR FROM c.date_of_birth))::integer,
    CASE WHEN c.date_of_birth IS NOT NULL
      THEN (EXTRACT(DOY FROM c.date_of_birth) - EXTRACT(DOY FROM current_date))::integer
      ELSE NULL END,
    MAX(o.created_at),
    COALESCE(SUM(o.total) FILTER (WHERE o.status='completed'), 0),
    c.store_id, s.name::text
  FROM public.pos_customers c
  LEFT JOIN public.orders o ON c.id = o.customer_id
  LEFT JOIN public.stores s ON c.store_id = s.id
  WHERE c.merchant_id = p_merchant_id
  GROUP BY c.id, c.name, c.phone, c.email, c.date_of_birth, c.anniversary_date, c.wedding_anniversary, c.store_id, s.name;
END; $$;

-- 7. Inactive customers report
CREATE OR REPLACE FUNCTION public.get_inactive_customers_report(p_merchant_id uuid, p_days_inactive integer DEFAULT 30)
RETURNS TABLE (
  customer_id uuid, customer_name varchar, phone varchar, email varchar,
  last_visit timestamptz, total_orders bigint, lifetime_value numeric,
  inactive_days integer, store_id uuid, store_name text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name::varchar, c.phone::varchar, c.email::varchar,
    MAX(o.created_at), COUNT(o.id),
    COALESCE(SUM(o.total) FILTER (WHERE o.status='completed'), 0),
    (EXTRACT(EPOCH FROM (current_timestamp - COALESCE(MAX(o.created_at), c.created_at))) / 86400)::integer,
    c.store_id, s.name::text
  FROM public.pos_customers c
  LEFT JOIN public.orders o ON c.id = o.customer_id
  LEFT JOIN public.stores s ON c.store_id = s.id
  WHERE c.merchant_id = p_merchant_id
  GROUP BY c.id, c.name, c.phone, c.email, c.store_id, c.created_at, s.name
  HAVING (EXTRACT(EPOCH FROM (current_timestamp - MAX(o.created_at))) / 86400)::integer >= p_days_inactive
      OR (COUNT(o.id) = 0 AND (EXTRACT(EPOCH FROM (current_timestamp - c.created_at)) / 86400)::integer >= p_days_inactive);
END; $$;

GRANT EXECUTE ON FUNCTION public.get_customer_feedback_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_csat_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_birthday_report(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inactive_customers_report(uuid, integer) TO authenticated;
