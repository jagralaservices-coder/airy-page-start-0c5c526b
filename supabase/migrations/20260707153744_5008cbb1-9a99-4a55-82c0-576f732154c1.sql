
ALTER TABLE public.staff_attendance
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE public.staff_attendance DROP CONSTRAINT IF EXISTS staff_attendance_staff_id_fkey;
ALTER TABLE public.staff_attendance
  ADD CONSTRAINT staff_attendance_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.user_roles(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Staff can read their assigned store" ON public.stores;
CREATE POLICY "Staff can read their assigned store"
  ON public.stores FOR SELECT TO authenticated
  USING (id IN (SELECT store_id FROM public.user_roles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.staff_attendance;
DROP POLICY IF EXISTS "Staff can insert own attendance" ON public.staff_attendance;

CREATE POLICY "Staff can insert own attendance"
  ON public.staff_attendance FOR INSERT TO authenticated
  WITH CHECK (staff_id IN (SELECT id FROM public.user_roles WHERE user_id = auth.uid()));

NOTIFY pgrst, 'reload schema';
