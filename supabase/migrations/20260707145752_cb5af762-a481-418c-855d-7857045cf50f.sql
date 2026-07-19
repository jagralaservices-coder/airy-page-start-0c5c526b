DROP POLICY IF EXISTS "Staff can read their assigned store" ON public.stores;
CREATE POLICY "Staff can read their assigned store"
ON public.stores FOR SELECT TO authenticated
USING (id IN (SELECT store_id FROM public.user_roles WHERE user_id = auth.uid()));