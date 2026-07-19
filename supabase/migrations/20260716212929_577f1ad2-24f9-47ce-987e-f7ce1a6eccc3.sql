CREATE OR REPLACE FUNCTION public.ensure_staff_employee_for_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_customer_id uuid;
BEGIN
  IF NEW.role IN ('staff', 'store_manager', 'cashier')
     AND NEW.is_active = true
     AND NEW.store_id IS NOT NULL THEN
    SELECT COALESCE(NEW.customer_id, s.customer_id, s.merchant_id, NEW.merchant_id)
      INTO resolved_customer_id
    FROM public.stores s
    WHERE s.id = NEW.store_id;

    IF resolved_customer_id IS NOT NULL THEN
      INSERT INTO public.staff (
        profile_id,
        user_id,
        store_id,
        customer_id,
        position,
        active,
        approval_status
      )
      VALUES (
        NEW.user_id,
        NEW.user_id,
        NEW.store_id,
        resolved_customer_id,
        NEW.role::text,
        true,
        'approved'
      )
      ON CONFLICT DO NOTHING;

      UPDATE public.staff
      SET
        user_id = NEW.user_id,
        profile_id = NEW.user_id,
        store_id = NEW.store_id,
        customer_id = COALESCE(public.staff.customer_id, resolved_customer_id),
        position = COALESCE(public.staff.position, NEW.role::text),
        active = true,
        approval_status = COALESCE(public.staff.approval_status, 'approved')
      WHERE (public.staff.user_id = NEW.user_id OR public.staff.profile_id = NEW.user_id)
        AND public.staff.store_id = NEW.store_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_staff_employee_for_role_trigger ON public.user_roles;
CREATE TRIGGER ensure_staff_employee_for_role_trigger
AFTER INSERT OR UPDATE OF user_id, role, store_id, customer_id, merchant_id, is_active
ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_staff_employee_for_role();

INSERT INTO public.staff (
  profile_id,
  user_id,
  store_id,
  customer_id,
  position,
  active,
  approval_status
)
SELECT
  ur.user_id,
  ur.user_id,
  ur.store_id,
  COALESCE(ur.customer_id, st.customer_id, st.merchant_id, ur.merchant_id),
  ur.role::text,
  true,
  'approved'
FROM public.user_roles ur
JOIN public.stores st ON st.id = ur.store_id
WHERE ur.role IN ('staff', 'store_manager', 'cashier')
  AND ur.is_active = true
  AND ur.store_id IS NOT NULL
  AND COALESCE(ur.customer_id, st.customer_id, st.merchant_id, ur.merchant_id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE (s.user_id = ur.user_id OR s.profile_id = ur.user_id)
      AND s.store_id = ur.store_id
  );

UPDATE public.staff s
SET
  user_id = COALESCE(s.user_id, ur.user_id),
  profile_id = COALESCE(s.profile_id, ur.user_id),
  customer_id = COALESCE(s.customer_id, ur.customer_id, st.customer_id, st.merchant_id, ur.merchant_id),
  position = COALESCE(s.position, ur.role::text),
  active = true,
  approval_status = COALESCE(s.approval_status, 'approved')
FROM public.user_roles ur
JOIN public.stores st ON st.id = ur.store_id
WHERE ur.role IN ('staff', 'store_manager', 'cashier')
  AND ur.is_active = true
  AND ur.store_id IS NOT NULL
  AND (s.user_id = ur.user_id OR s.profile_id = ur.user_id)
  AND s.store_id = ur.store_id;