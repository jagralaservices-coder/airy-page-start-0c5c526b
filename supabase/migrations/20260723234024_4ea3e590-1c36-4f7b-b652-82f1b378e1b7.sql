-- Backfill store ownership fields from the merchant record so owner store selection works consistently.
UPDATE public.stores s
SET
  owner_id = COALESCE(s.owner_id, m.owner_user_id),
  customer_id = COALESCE(s.customer_id, s.merchant_id),
  updated_at = now()
FROM public.merchants m
WHERE s.merchant_id = m.id
  AND (s.owner_id IS NULL OR s.customer_id IS NULL);

-- Make owner store reads robust across both legacy customer_id and current merchant_id linkage.
DROP POLICY IF EXISTS "Owners manage own stores" ON public.stores;
CREATE POLICY "Owners manage own stores"
ON public.stores
FOR ALL
TO authenticated
USING (
  owner_id = auth.uid()
  OR customer_id = public.get_user_customer_id(auth.uid())
  OR merchant_id = public.get_user_merchant_id(auth.uid())
  OR customer_id = public.get_user_merchant_id(auth.uid())
  OR merchant_id = public.get_user_customer_id(auth.uid())
  OR public.has_any_role(auth.uid(), ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])
)
WITH CHECK (
  owner_id = auth.uid()
  OR customer_id = public.get_user_customer_id(auth.uid())
  OR merchant_id = public.get_user_merchant_id(auth.uid())
  OR customer_id = public.get_user_merchant_id(auth.uid())
  OR merchant_id = public.get_user_customer_id(auth.uid())
  OR public.has_any_role(auth.uid(), ARRAY['admin'::public.app_role, 'super_admin'::public.app_role])
);

DROP POLICY IF EXISTS "stores_assigned_members_select" ON public.stores;
CREATE POLICY "stores_assigned_members_select"
ON public.stores
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.is_active = true
      AND (
        ur.store_id = stores.id
        OR (ur.merchant_id IS NOT NULL AND (ur.merchant_id = stores.merchant_id OR ur.merchant_id = stores.customer_id))
        OR (ur.customer_id IS NOT NULL AND (ur.customer_id = stores.customer_id OR ur.customer_id = stores.merchant_id))
      )
  )
);