
-- Fix 1: remove NULL merchant_id branch
DROP POLICY IF EXISTS categories_select_scoped ON public.categories;
CREATE POLICY categories_select_scoped ON public.categories FOR SELECT TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role]) OR user_in_merchant(auth.uid(), merchant_id));

DROP POLICY IF EXISTS suppliers_select_scoped ON public.suppliers;
CREATE POLICY suppliers_select_scoped ON public.suppliers FOR SELECT TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role]) OR user_in_merchant(auth.uid(), merchant_id));

DROP POLICY IF EXISTS po_select_scoped ON public.purchase_orders;
CREATE POLICY po_select_scoped ON public.purchase_orders FOR SELECT TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'super_admin'::app_role]) OR user_in_merchant(auth.uid(), merchant_id));

-- Fix 2: scope public-role policies to authenticated
DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOR t IN SELECT unnest(ARRAY['orders','cash_sessions','expenses','products','stock_adjustments','restaurant_tables']) LOOP
    FOR p IN SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- Recreate for each table scoped to authenticated
CREATE POLICY orders_select_store ON public.orders FOR SELECT TO authenticated USING (can_manage_store(store_id));
CREATE POLICY orders_insert_store ON public.orders FOR INSERT TO authenticated WITH CHECK (can_manage_store(store_id));
CREATE POLICY orders_update_store ON public.orders FOR UPDATE TO authenticated USING (can_manage_store(store_id)) WITH CHECK (can_manage_store(store_id));
CREATE POLICY orders_delete_store ON public.orders FOR DELETE TO authenticated USING (can_manage_store(store_id));

CREATE POLICY cash_sessions_select_store ON public.cash_sessions FOR SELECT TO authenticated USING (can_manage_store(store_id));
CREATE POLICY cash_sessions_insert_store ON public.cash_sessions FOR INSERT TO authenticated WITH CHECK (can_manage_store(store_id));
CREATE POLICY cash_sessions_update_store ON public.cash_sessions FOR UPDATE TO authenticated USING (can_manage_store(store_id)) WITH CHECK (can_manage_store(store_id));
CREATE POLICY cash_sessions_delete_store ON public.cash_sessions FOR DELETE TO authenticated USING (can_manage_store(store_id));

CREATE POLICY expenses_select_store ON public.expenses FOR SELECT TO authenticated USING (can_manage_store(store_id));
CREATE POLICY expenses_insert_store ON public.expenses FOR INSERT TO authenticated WITH CHECK (can_manage_store(store_id));
CREATE POLICY expenses_update_store ON public.expenses FOR UPDATE TO authenticated USING (can_manage_store(store_id)) WITH CHECK (can_manage_store(store_id));
CREATE POLICY expenses_delete_store ON public.expenses FOR DELETE TO authenticated USING (can_manage_store(store_id));

CREATE POLICY products_select_store ON public.products FOR SELECT TO authenticated USING (can_manage_store(store_id));
CREATE POLICY products_insert_store ON public.products FOR INSERT TO authenticated WITH CHECK (can_manage_store(store_id));
CREATE POLICY products_update_store ON public.products FOR UPDATE TO authenticated USING (can_manage_store(store_id)) WITH CHECK (can_manage_store(store_id));
CREATE POLICY products_delete_store ON public.products FOR DELETE TO authenticated USING (can_manage_store(store_id));

CREATE POLICY stock_adjustments_select_store ON public.stock_adjustments FOR SELECT TO authenticated USING (can_manage_store(store_id));
CREATE POLICY stock_adjustments_insert_store ON public.stock_adjustments FOR INSERT TO authenticated WITH CHECK (can_manage_store(store_id));
CREATE POLICY stock_adjustments_update_store ON public.stock_adjustments FOR UPDATE TO authenticated USING (can_manage_store(store_id)) WITH CHECK (can_manage_store(store_id));
CREATE POLICY stock_adjustments_delete_store ON public.stock_adjustments FOR DELETE TO authenticated USING (can_manage_store(store_id));

CREATE POLICY restaurant_tables_select_store ON public.restaurant_tables FOR SELECT TO authenticated USING (can_manage_store(store_id));
CREATE POLICY restaurant_tables_insert_store ON public.restaurant_tables FOR INSERT TO authenticated WITH CHECK (can_manage_store(store_id));
CREATE POLICY restaurant_tables_update_store ON public.restaurant_tables FOR UPDATE TO authenticated USING (can_manage_store(store_id)) WITH CHECK (can_manage_store(store_id));
CREATE POLICY restaurant_tables_delete_store ON public.restaurant_tables FOR DELETE TO authenticated USING (can_manage_store(store_id));

-- Fix 3: staff self-select policy
CREATE POLICY staff_select_self ON public.staff FOR SELECT TO authenticated
USING (profile_id = auth.uid() OR user_id = auth.uid());
