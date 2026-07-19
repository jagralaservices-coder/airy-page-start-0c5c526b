CREATE OR REPLACE FUNCTION public.ensure_staff_employee_for_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_customer_id uuid;
  existing_staff_id uuid;
BEGIN
  IF NEW.role IN ('staff', 'store_manager', 'cashier')
     AND NEW.is_active = true
     AND NEW.store_id IS NOT NULL THEN
    SELECT COALESCE(NEW.customer_id, s.customer_id, s.merchant_id, NEW.merchant_id)
      INTO resolved_customer_id
    FROM public.stores s
    WHERE s.id = NEW.store_id;

    IF resolved_customer_id IS NOT NULL THEN
      SELECT s.id
        INTO existing_staff_id
      FROM public.staff s
      WHERE (s.user_id = NEW.user_id OR s.profile_id = NEW.user_id)
        AND s.store_id = NEW.store_id
      ORDER BY s.created_at DESC
      LIMIT 1;

      IF existing_staff_id IS NULL THEN
        SELECT s.id
          INTO existing_staff_id
        FROM public.staff s
        WHERE s.user_id = NEW.user_id OR s.profile_id = NEW.user_id
        ORDER BY s.created_at DESC
        LIMIT 1;
      END IF;

      IF existing_staff_id IS NULL THEN
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
        RETURNING id INTO existing_staff_id;
      END IF;

      UPDATE public.staff
      SET
        user_id = NEW.user_id,
        profile_id = NEW.user_id,
        store_id = NEW.store_id,
        customer_id = resolved_customer_id,
        position = NEW.role::text,
        active = true,
        approval_status = 'approved'
      WHERE public.staff.id = existing_staff_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_staff_employee_for_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_staff_employee_for_role() FROM anon;
REVOKE ALL ON FUNCTION public.ensure_staff_employee_for_role() FROM authenticated;