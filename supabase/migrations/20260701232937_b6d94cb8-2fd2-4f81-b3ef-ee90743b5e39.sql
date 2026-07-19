
-- Phase 4: Enterprise Procurement & Intelligence
-- Adapted to this project's schema (user_roles + get_user_merchant_id/has_any_role, set_updated_at trigger fn)

-- 1) purchase_budgets
CREATE TABLE IF NOT EXISTS public.purchase_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  department_id uuid,
  vendor_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  budget_period varchar(50) NOT NULL,
  allocated_amount numeric(12,2) NOT NULL DEFAULT 0,
  utilized_amount numeric(12,2) NOT NULL DEFAULT 0,
  status varchar(50) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_budgets TO authenticated;
GRANT ALL ON public.purchase_budgets TO service_role;

ALTER TABLE public.purchase_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pb_select_merchant" ON public.purchase_budgets
  FOR SELECT TO authenticated
  USING (merchant_id = public.get_user_merchant_id(auth.uid())
         OR public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[]));

CREATE POLICY "pb_manage_merchant" ON public.purchase_budgets
  FOR ALL TO authenticated
  USING (
    (merchant_id = public.get_user_merchant_id(auth.uid())
      AND public.has_any_role(auth.uid(), ARRAY['owner','manager','store_manager']::app_role[]))
    OR public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[])
  )
  WITH CHECK (
    (merchant_id = public.get_user_merchant_id(auth.uid())
      AND public.has_any_role(auth.uid(), ARRAY['owner','manager','store_manager']::app_role[]))
    OR public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[])
  );

CREATE TRIGGER purchase_budgets_set_updated_at
  BEFORE UPDATE ON public.purchase_budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_pb_merchant ON public.purchase_budgets(merchant_id);
CREATE INDEX IF NOT EXISTS idx_pb_store ON public.purchase_budgets(store_id);
CREATE INDEX IF NOT EXISTS idx_pb_period ON public.purchase_budgets(budget_period);

-- 2) purchase_suggestions
CREATE TABLE IF NOT EXISTS public.purchase_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL,
  recommended_vendor_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  suggested_quantity numeric(10,2) NOT NULL DEFAULT 0,
  reason text,
  expected_delivery_date date,
  status varchar(50) NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_suggestions TO authenticated;
GRANT ALL ON public.purchase_suggestions TO service_role;

ALTER TABLE public.purchase_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ps_select_merchant" ON public.purchase_suggestions
  FOR SELECT TO authenticated
  USING (merchant_id = public.get_user_merchant_id(auth.uid())
         OR public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[]));

CREATE POLICY "ps_manage_merchant" ON public.purchase_suggestions
  FOR ALL TO authenticated
  USING (
    (merchant_id = public.get_user_merchant_id(auth.uid())
      AND public.has_any_role(auth.uid(), ARRAY['owner','manager','store_manager','staff']::app_role[]))
    OR public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[])
  )
  WITH CHECK (
    (merchant_id = public.get_user_merchant_id(auth.uid())
      AND public.has_any_role(auth.uid(), ARRAY['owner','manager','store_manager','staff']::app_role[]))
    OR public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[])
  );

CREATE TRIGGER purchase_suggestions_set_updated_at
  BEFORE UPDATE ON public.purchase_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ps_merchant ON public.purchase_suggestions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_ps_store ON public.purchase_suggestions(store_id);
CREATE INDEX IF NOT EXISTS idx_ps_status ON public.purchase_suggestions(status);

-- 3) purchase_orders workflow columns (staff refs)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_orders' AND column_name='store_id') THEN
    ALTER TABLE public.purchase_orders ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_orders' AND column_name='requested_by') THEN
    ALTER TABLE public.purchase_orders ADD COLUMN requested_by uuid REFERENCES public.staff(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_orders' AND column_name='approved_by') THEN
    ALTER TABLE public.purchase_orders ADD COLUMN approved_by uuid REFERENCES public.staff(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_orders' AND column_name='finance_approved_by') THEN
    ALTER TABLE public.purchase_orders ADD COLUMN finance_approved_by uuid REFERENCES public.staff(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4) RPCs (placeholders returning shaped rows)
CREATE OR REPLACE FUNCTION public.calculate_supplier_scorecard(p_merchant_id uuid)
RETURNS TABLE (
  supplier_id uuid,
  supplier_name text,
  overall_score numeric,
  on_time_delivery_rate numeric,
  quality_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.name::text, 95.0::numeric, 98.5::numeric, 92.0::numeric
  FROM public.suppliers s
  WHERE s.merchant_id = p_merchant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_inventory_optimization(p_merchant_id uuid)
RETURNS TABLE (
  item_name text,
  category text,
  status text,
  recommended_action text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT 'Sample Item'::text, 'Raw Material'::text, 'Overstock'::text, 'Transfer'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_demand_forecast(p_merchant_id uuid, days int)
RETURNS TABLE (
  date date,
  predicted_demand numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT (CURRENT_DATE + i)::date, (100 + (random() * 50))::numeric
  FROM generate_series(1, days) i;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_supplier_scorecard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_inventory_optimization(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_demand_forecast(uuid, int) TO authenticated;
