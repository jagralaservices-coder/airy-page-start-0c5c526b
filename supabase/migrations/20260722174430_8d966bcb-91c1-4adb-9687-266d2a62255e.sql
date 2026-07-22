
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL,
  store_id UUID,
  merchant_id UUID,
  order_id UUID,
  source TEXT NOT NULL CHECK (source IN ('sale','purchase','adjustment','return','waste','transfer','opening','recount')),
  qty_delta NUMERIC NOT NULL,
  qty_before NUMERIC,
  qty_after NUMERIC,
  unit TEXT,
  reference TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_item ON public.inventory_transactions(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_store ON public.inventory_transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_merchant ON public.inventory_transactions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_order ON public.inventory_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_created ON public.inventory_transactions(created_at DESC);

GRANT SELECT, INSERT ON public.inventory_transactions TO authenticated;
GRANT ALL ON public.inventory_transactions TO service_role;

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

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
          (ur.merchant_id IS NOT NULL AND ur.merchant_id = inventory_transactions.merchant_id)
          OR (ur.customer_id IS NOT NULL AND ur.customer_id = inventory_transactions.merchant_id)
          OR (ur.store_id IS NOT NULL AND ur.store_id = inventory_transactions.store_id)
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
          (ur.merchant_id IS NOT NULL AND ur.merchant_id = inventory_transactions.merchant_id)
          OR (ur.customer_id IS NOT NULL AND ur.customer_id = inventory_transactions.merchant_id)
          OR (ur.store_id IS NOT NULL AND ur.store_id = inventory_transactions.store_id)
        )
    )
  );
