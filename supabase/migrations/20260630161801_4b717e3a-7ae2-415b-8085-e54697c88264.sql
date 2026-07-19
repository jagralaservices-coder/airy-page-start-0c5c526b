
-- Quotation status enum
DO $$ BEGIN
  CREATE TYPE public.quotation_status AS ENUM ('draft','pending','approved','rejected','expired','converted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- quotations
CREATE TABLE IF NOT EXISTS public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  quotation_no text NOT NULL,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  customer_email text,
  salesperson_id uuid,
  salesperson_name text,
  status public.quotation_status NOT NULL DEFAULT 'draft',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  grand_total numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  terms text,
  expiry_date timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  rejected_at timestamptz,
  rejected_by uuid,
  rejection_reason text,
  converted_at timestamptz,
  converted_order_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, quotation_no)
);

CREATE INDEX IF NOT EXISTS idx_quotations_store ON public.quotations(store_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_created_at ON public.quotations(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT ALL ON public.quotations TO service_role;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotations_admin_all" ON public.quotations FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[]));

CREATE POLICY "quotations_store_select" ON public.quotations FOR SELECT TO authenticated
  USING (public.can_manage_store(store_id));

CREATE POLICY "quotations_store_insert" ON public.quotations FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "quotations_store_update" ON public.quotations FOR UPDATE TO authenticated
  USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "quotations_store_delete" ON public.quotations FOR DELETE TO authenticated
  USING (public.can_manage_store(store_id));

CREATE TRIGGER trg_quotations_updated_at BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_quotations_stamp_meta BEFORE INSERT ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_metadata_on_insert();

ALTER TABLE public.quotations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quotations;

-- quotation_items
CREATE TABLE IF NOT EXISTS public.quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  product_id uuid,
  product_name text NOT NULL,
  sku text,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  price numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON public.quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_store ON public.quotation_items(store_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_items TO authenticated;
GRANT ALL ON public.quotation_items TO service_role;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotation_items_admin_all" ON public.quotation_items FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[]));

CREATE POLICY "quotation_items_store_select" ON public.quotation_items FOR SELECT TO authenticated
  USING (public.can_manage_store(store_id));

CREATE POLICY "quotation_items_store_insert" ON public.quotation_items FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "quotation_items_store_update" ON public.quotation_items FOR UPDATE TO authenticated
  USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "quotation_items_store_delete" ON public.quotation_items FOR DELETE TO authenticated
  USING (public.can_manage_store(store_id));

ALTER TABLE public.quotation_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quotation_items;

-- Auto-expire helper: callable to mark expired quotations
CREATE OR REPLACE FUNCTION public.expire_old_quotations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.quotations
     SET status = 'expired', updated_at = now()
   WHERE status IN ('draft','pending','approved')
     AND expiry_date IS NOT NULL
     AND expiry_date < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION public.expire_old_quotations() TO authenticated;
