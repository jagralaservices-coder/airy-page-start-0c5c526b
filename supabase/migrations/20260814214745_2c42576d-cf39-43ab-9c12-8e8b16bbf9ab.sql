ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS store_code text;

UPDATE public.stores
SET store_code = UPPER(SUBSTRING(id::text, 1, 8))
WHERE store_code IS NULL OR store_code = '';

CREATE INDEX IF NOT EXISTS idx_stores_store_code ON public.stores(store_code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'store_login_can_read_own_orders'
  ) THEN
    CREATE POLICY "store_login_can_read_own_orders"
    ON public.orders
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.is_active = true
          AND (
            ur.store_id = orders.store_id
            OR ur.role IN ('super_admin','admin')
            OR ur.merchant_id = (SELECT s.merchant_id FROM public.stores s WHERE s.id = orders.store_id)
          )
      )
    );
  END IF;
END $$;