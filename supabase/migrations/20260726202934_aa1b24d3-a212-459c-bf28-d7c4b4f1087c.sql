DROP POLICY IF EXISTS user_roles_select_self_or_admin ON public.user_roles;

CREATE POLICY user_roles_select_self_or_admin ON public.user_roles
FOR SELECT
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    has_role(auth.uid(), 'owner'::app_role)
    AND (
      (merchant_id IS NOT NULL AND merchant_id = get_user_merchant_id(auth.uid()))
      OR (customer_id IS NOT NULL AND customer_id = get_user_customer_id(auth.uid()))
    )
  )
);