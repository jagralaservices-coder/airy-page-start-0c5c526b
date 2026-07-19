
CREATE POLICY "stores_assigned_members_select"
ON public.stores FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.is_active = true
      AND (
        ur.store_id = stores.id
        OR (ur.merchant_id IS NOT NULL AND ur.merchant_id = stores.merchant_id)
      )
  )
);

CREATE POLICY "merchants_assigned_members_select"
ON public.merchants FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.is_active = true
      AND ur.merchant_id = merchants.id
  )
);
