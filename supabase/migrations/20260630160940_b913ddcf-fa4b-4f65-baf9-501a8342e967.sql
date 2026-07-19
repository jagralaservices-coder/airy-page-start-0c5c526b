
-- ============ sales_returns ============
CREATE TABLE public.sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  merchant_id uuid,
  return_no text NOT NULL,
  original_order_id uuid,
  original_invoice_no text,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  return_amount numeric NOT NULL DEFAULT 0,
  refund_amount numeric NOT NULL DEFAULT 0,
  exchange_amount numeric NOT NULL DEFAULT 0,
  credit_note_amount numeric NOT NULL DEFAULT 0,
  refund_method text NOT NULL DEFAULT 'cash',
  reason text NOT NULL DEFAULT 'other',
  reason_notes text,
  cashier_id uuid,
  cashier_name text,
  returned_by uuid,
  returned_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'completed',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_returns_return_no_store_uk UNIQUE (store_id, return_no)
);

CREATE INDEX idx_sales_returns_store_date ON public.sales_returns(store_id, returned_at DESC);
CREATE INDEX idx_sales_returns_merchant ON public.sales_returns(merchant_id);
CREATE INDEX idx_sales_returns_original_order ON public.sales_returns(original_order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_returns TO authenticated;
GRANT ALL ON public.sales_returns TO service_role;

ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_returns_select_scoped" ON public.sales_returns
  FOR SELECT TO authenticated
  USING (public.can_manage_store(store_id));

CREATE POLICY "sales_returns_insert_scoped" ON public.sales_returns
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "sales_returns_update_scoped" ON public.sales_returns
  FOR UPDATE TO authenticated
  USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "sales_returns_delete_scoped" ON public.sales_returns
  FOR DELETE TO authenticated
  USING (public.can_manage_store(store_id));

CREATE TRIGGER trg_sales_returns_updated
  BEFORE UPDATE ON public.sales_returns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_returns;
ALTER TABLE public.sales_returns REPLICA IDENTITY FULL;

-- ============ sales_return_items ============
CREATE TABLE public.sales_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.sales_returns(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid,
  product_name text NOT NULL,
  category text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_return_items_return ON public.sales_return_items(return_id);
CREATE INDEX idx_sales_return_items_store ON public.sales_return_items(store_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_return_items TO authenticated;
GRANT ALL ON public.sales_return_items TO service_role;

ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_return_items_select_scoped" ON public.sales_return_items
  FOR SELECT TO authenticated
  USING (public.can_manage_store(store_id));

CREATE POLICY "sales_return_items_insert_scoped" ON public.sales_return_items
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "sales_return_items_update_scoped" ON public.sales_return_items
  FOR UPDATE TO authenticated
  USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "sales_return_items_delete_scoped" ON public.sales_return_items
  FOR DELETE TO authenticated
  USING (public.can_manage_store(store_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_return_items;
ALTER TABLE public.sales_return_items REPLICA IDENTITY FULL;
