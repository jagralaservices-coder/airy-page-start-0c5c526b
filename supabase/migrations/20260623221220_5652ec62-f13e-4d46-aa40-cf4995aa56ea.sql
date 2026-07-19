
-- ===== Priority 1: Orders -> store-scoped RLS =====
DROP POLICY IF EXISTS "orders_select_role" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_cashier_plus" ON public.orders;
DROP POLICY IF EXISTS "orders_update_mgr" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_owner" ON public.orders;

CREATE POLICY "orders_select_store" ON public.orders
  FOR SELECT USING (public.can_manage_store(store_id));
CREATE POLICY "orders_insert_store" ON public.orders
  FOR INSERT WITH CHECK (public.can_manage_store(store_id));
CREATE POLICY "orders_update_store" ON public.orders
  FOR UPDATE USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));
CREATE POLICY "orders_delete_store" ON public.orders
  FOR DELETE USING (public.can_manage_store(store_id));

-- ===== Priority 2: Add store_id and store-scoped RLS to 5 tables =====

-- products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
UPDATE public.products SET store_id = (SELECT id FROM public.stores ORDER BY created_at LIMIT 1) WHERE store_id IS NULL;
ALTER TABLE public.products ALTER COLUMN store_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS products_store_id_idx ON public.products(store_id);

DROP POLICY IF EXISTS "products_select_role" ON public.products;
DROP POLICY IF EXISTS "products_write_mgr" ON public.products;
CREATE POLICY "products_select_store" ON public.products
  FOR SELECT USING (public.can_manage_store(store_id));
CREATE POLICY "products_insert_store" ON public.products
  FOR INSERT WITH CHECK (public.can_manage_store(store_id));
CREATE POLICY "products_update_store" ON public.products
  FOR UPDATE USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));
CREATE POLICY "products_delete_store" ON public.products
  FOR DELETE USING (public.can_manage_store(store_id));

-- expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
UPDATE public.expenses SET store_id = (SELECT id FROM public.stores ORDER BY created_at LIMIT 1) WHERE store_id IS NULL;
ALTER TABLE public.expenses ALTER COLUMN store_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS expenses_store_id_idx ON public.expenses(store_id);

DROP POLICY IF EXISTS "expenses_select_role" ON public.expenses;
DROP POLICY IF EXISTS "exp insert self" ON public.expenses;
DROP POLICY IF EXISTS "exp update mgr" ON public.expenses;
DROP POLICY IF EXISTS "exp delete mgr" ON public.expenses;
CREATE POLICY "expenses_select_store" ON public.expenses
  FOR SELECT USING (public.can_manage_store(store_id));
CREATE POLICY "expenses_insert_store" ON public.expenses
  FOR INSERT WITH CHECK (public.can_manage_store(store_id) AND created_by = auth.uid());
CREATE POLICY "expenses_update_store" ON public.expenses
  FOR UPDATE USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));
CREATE POLICY "expenses_delete_store" ON public.expenses
  FOR DELETE USING (public.can_manage_store(store_id));

-- cash_sessions
ALTER TABLE public.cash_sessions ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
UPDATE public.cash_sessions SET store_id = (SELECT id FROM public.stores ORDER BY created_at LIMIT 1) WHERE store_id IS NULL;
ALTER TABLE public.cash_sessions ALTER COLUMN store_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS cash_sessions_store_id_idx ON public.cash_sessions(store_id);

DROP POLICY IF EXISTS "cash_sessions_select_role" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash open self" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash update auth" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash delete mgr" ON public.cash_sessions;
CREATE POLICY "cash_sessions_select_store" ON public.cash_sessions
  FOR SELECT USING (public.can_manage_store(store_id));
CREATE POLICY "cash_sessions_insert_store" ON public.cash_sessions
  FOR INSERT WITH CHECK (public.can_manage_store(store_id) AND opened_by = auth.uid());
CREATE POLICY "cash_sessions_update_store" ON public.cash_sessions
  FOR UPDATE USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));
CREATE POLICY "cash_sessions_delete_store" ON public.cash_sessions
  FOR DELETE USING (public.can_manage_store(store_id));

-- restaurant_tables
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
UPDATE public.restaurant_tables SET store_id = (SELECT id FROM public.stores ORDER BY created_at LIMIT 1) WHERE store_id IS NULL;
ALTER TABLE public.restaurant_tables ALTER COLUMN store_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS restaurant_tables_store_id_idx ON public.restaurant_tables(store_id);

DROP POLICY IF EXISTS "restaurant_tables_select_role" ON public.restaurant_tables;
DROP POLICY IF EXISTS "restaurant_tables_insert_role" ON public.restaurant_tables;
DROP POLICY IF EXISTS "restaurant_tables_update_role" ON public.restaurant_tables;
DROP POLICY IF EXISTS "tables delete mgr" ON public.restaurant_tables;
CREATE POLICY "restaurant_tables_select_store" ON public.restaurant_tables
  FOR SELECT USING (public.can_manage_store(store_id));
CREATE POLICY "restaurant_tables_insert_store" ON public.restaurant_tables
  FOR INSERT WITH CHECK (public.can_manage_store(store_id));
CREATE POLICY "restaurant_tables_update_store" ON public.restaurant_tables
  FOR UPDATE USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));
CREATE POLICY "restaurant_tables_delete_store" ON public.restaurant_tables
  FOR DELETE USING (public.can_manage_store(store_id));

-- stock_adjustments (derive store from product)
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
UPDATE public.stock_adjustments sa
   SET store_id = p.store_id
  FROM public.products p
 WHERE sa.product_id = p.id AND sa.store_id IS NULL;
UPDATE public.stock_adjustments SET store_id = (SELECT id FROM public.stores ORDER BY created_at LIMIT 1) WHERE store_id IS NULL;
ALTER TABLE public.stock_adjustments ALTER COLUMN store_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS stock_adjustments_store_id_idx ON public.stock_adjustments(store_id);

DROP POLICY IF EXISTS "stock_adjustments_select_role" ON public.stock_adjustments;
DROP POLICY IF EXISTS "manage adj" ON public.stock_adjustments;
CREATE POLICY "stock_adjustments_select_store" ON public.stock_adjustments
  FOR SELECT USING (public.can_manage_store(store_id));
CREATE POLICY "stock_adjustments_insert_store" ON public.stock_adjustments
  FOR INSERT WITH CHECK (public.can_manage_store(store_id));
CREATE POLICY "stock_adjustments_update_store" ON public.stock_adjustments
  FOR UPDATE USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));
CREATE POLICY "stock_adjustments_delete_store" ON public.stock_adjustments
  FOR DELETE USING (public.can_manage_store(store_id));

-- ===== Realtime: ensure publication membership =====
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['expenses','cash_sessions','restaurant_tables','stock_adjustments']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;
