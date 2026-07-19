DO $$
BEGIN
  WITH ranked_roles AS (
    SELECT
      ur.id AS role_id,
      ur.user_id,
      ur.store_id,
      COALESCE(ur.customer_id, ur.merchant_id, st.customer_id, st.merchant_id) AS customer_id,
      ur.staff_code,
      ur.role::text AS role_name,
      row_number() OVER (
        PARTITION BY ur.user_id
        ORDER BY (ur.store_id IS NOT NULL) DESC, ur.created_at DESC NULLS LAST, ur.id
      ) AS rn
    FROM public.user_roles ur
    LEFT JOIN public.stores st ON st.id = ur.store_id
    WHERE ur.user_id IS NOT NULL
      AND ur.is_active = true
      AND ur.role IN ('staff', 'store_manager', 'cashier')
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ur.user_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.profile_id = ur.user_id OR s.user_id = ur.user_id
      )
  )
  INSERT INTO public.staff (profile_id, user_id, employee_code, position, store_id, customer_id, active, approval_status)
  SELECT
    user_id,
    user_id,
    COALESCE(staff_code, 'EMP-' || substr(role_id::text, 1, 8)),
    role_name,
    store_id,
    customer_id,
    true,
    'approved'
  FROM ranked_roles
  WHERE rn = 1
  ON CONFLICT (profile_id) DO NOTHING;
END $$;

ALTER TABLE public.staff_attendance DROP CONSTRAINT IF EXISTS staff_attendance_staff_id_fkey;

UPDATE public.staff_attendance sa
SET
  staff_id = s.id,
  user_id = COALESCE(sa.user_id, ur.user_id),
  merchant_id = COALESCE(sa.merchant_id, ur.customer_id, ur.merchant_id, s.customer_id),
  organization_id = COALESCE(sa.organization_id, sa.merchant_id, ur.customer_id, ur.merchant_id, s.customer_id)
FROM public.user_roles ur
JOIN public.staff s
  ON (s.user_id = ur.user_id OR s.profile_id = ur.user_id)
WHERE sa.staff_id = ur.id;

ALTER TABLE public.staff_attendance
  ADD CONSTRAINT staff_attendance_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_staff_user_store ON public.staff(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_lookup ON public.staff_attendance(merchant_id, store_id, staff_id, attendance_date, check_in DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_attendance TO authenticated;
GRANT ALL ON public.staff_attendance TO service_role;

DROP POLICY IF EXISTS "Staff can insert own attendance" ON public.staff_attendance;
CREATE POLICY "Staff can insert own attendance"
ON public.staff_attendance
FOR INSERT
TO authenticated
WITH CHECK (
  staff_id IN (
    SELECT s.id
    FROM public.staff s
    WHERE s.user_id = auth.uid() OR s.profile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Staff can manage own attendance" ON public.staff_attendance;
CREATE POLICY "Staff can manage own attendance"
ON public.staff_attendance
FOR ALL
TO authenticated
USING (
  staff_id IN (
    SELECT s.id
    FROM public.staff s
    WHERE s.user_id = auth.uid() OR s.profile_id = auth.uid()
  )
)
WITH CHECK (
  staff_id IN (
    SELECT s.id
    FROM public.staff s
    WHERE s.user_id = auth.uid() OR s.profile_id = auth.uid()
  )
);