CREATE OR REPLACE FUNCTION public.verify_staff_pin(p_staff_code text, p_pin text)
RETURNS TABLE(user_id uuid, role text, store_id uuid, customer_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ur.user_id,
    ur.role::text,
    ur.store_id,
    ur.customer_id
  FROM public.user_roles ur
  WHERE (ur.staff_code = p_staff_code OR ur.ref_code = p_staff_code)
    AND (ur.is_active = true OR ur.is_active IS NULL)
    AND ur.pin IS NOT NULL
    AND (
      ur.pin = p_pin
      OR ur.pin = crypt(p_pin, ur.pin)
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.verify_staff_pin(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_staff_pin(text, text) TO service_role;