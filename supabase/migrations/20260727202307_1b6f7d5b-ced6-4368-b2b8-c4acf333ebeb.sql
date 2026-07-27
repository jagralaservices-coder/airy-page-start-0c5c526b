CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_account_type text := lower(coalesce(NEW.raw_user_meta_data->>'account_type', ''));
  v_skip_default_role boolean := coalesce((NEW.raw_user_meta_data->>'skip_default_role')::boolean, false);
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, public.profiles.email);

  -- Staff/cashier/store-manager users are scoped by create-staff after auth user creation.
  -- Do not auto-create a tenant-less cashier role for them; that orphan row causes
  -- invalid login routing and broken delete behavior.
  IF v_skip_default_role OR v_account_type IN ('staff', 'cashier', 'store_manager') THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') THEN
      INSERT INTO public.user_roles (user_id, role, is_active) VALUES (NEW.id, 'super_admin', true);
    ELSIF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
      INSERT INTO public.user_roles (user_id, role, is_active) VALUES (NEW.id, 'owner', true);
    ELSE
      INSERT INTO public.user_roles (user_id, role, is_active) VALUES (NEW.id, 'cashier', true);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DELETE FROM public.user_roles ur
WHERE ur.role IN ('staff', 'store_manager', 'cashier')
  AND (ur.store_id IS NULL OR coalesce(ur.merchant_id, ur.customer_id) IS NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.user_id = ur.user_id
       OR s.profile_id = ur.user_id
  );

UPDATE public.staff s
SET active = false,
    approval_status = 'inactive',
    updated_at = now()
FROM public.user_roles ur
WHERE ur.user_id = s.user_id
  AND ur.role IN ('staff', 'store_manager', 'cashier')
  AND ur.is_active = false
  AND s.active = true;