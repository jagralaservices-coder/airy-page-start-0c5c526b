GRANT SELECT, INSERT ON public.inventory_transactions TO authenticated;
GRANT ALL ON public.inventory_transactions TO service_role;

DROP POLICY IF EXISTS "inv_tx_select_scoped" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inv_tx_insert_scoped" ON public.inventory_transactions;

CREATE POLICY "inv_tx_select_scoped"
  ON public.inventory_transactions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND (
          (ur.store_id IS NOT NULL AND ur.store_id = inventory_transactions.store_id)
          OR (ur.merchant_id IS NOT NULL AND ur.merchant_id = inventory_transactions.merchant_id)
          OR (ur.customer_id IS NOT NULL AND ur.customer_id = inventory_transactions.merchant_id)
          OR EXISTS (
            SELECT 1 FROM public.stores s
            WHERE s.id = inventory_transactions.store_id
              AND (
                (ur.merchant_id IS NOT NULL AND (s.merchant_id = ur.merchant_id OR s.customer_id = ur.merchant_id))
                OR (ur.customer_id IS NOT NULL AND (s.merchant_id = ur.customer_id OR s.customer_id = ur.customer_id))
              )
          )
        )
    )
  );

CREATE POLICY "inv_tx_insert_scoped"
  ON public.inventory_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND (
          (ur.store_id IS NOT NULL AND ur.store_id = inventory_transactions.store_id)
          OR (ur.merchant_id IS NOT NULL AND ur.merchant_id = inventory_transactions.merchant_id)
          OR (ur.customer_id IS NOT NULL AND ur.customer_id = inventory_transactions.merchant_id)
          OR EXISTS (
            SELECT 1 FROM public.stores s
            WHERE s.id = inventory_transactions.store_id
              AND (
                (ur.merchant_id IS NOT NULL AND (s.merchant_id = ur.merchant_id OR s.customer_id = ur.merchant_id))
                OR (ur.customer_id IS NOT NULL AND (s.merchant_id = ur.customer_id OR s.customer_id = ur.customer_id))
              )
          )
        )
    )
  );