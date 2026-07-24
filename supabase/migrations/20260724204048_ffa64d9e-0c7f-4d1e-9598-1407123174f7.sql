
-- Add ref_code columns (idempotent)
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS ref_code text;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS ref_code text;

-- Unique indexes (partial to allow NULLs before backfill)
CREATE UNIQUE INDEX IF NOT EXISTS stores_ref_code_key ON public.stores(ref_code) WHERE ref_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_ref_code_key ON public.user_roles(ref_code) WHERE ref_code IS NOT NULL;

-- Store ref_code generator
CREATE OR REPLACE FUNCTION public.generate_store_ref_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := 'STR' || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0');
    SELECT EXISTS(SELECT 1 FROM public.stores WHERE ref_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  NEW.ref_code := new_code;
  RETURN NEW;
END;
$$;

-- User role ref_code generator (prefix depends on role)
CREATE OR REPLACE FUNCTION public.generate_user_role_ref_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
  prefix TEXT;
BEGIN
  prefix := CASE NEW.role::text
    WHEN 'owner' THEN 'OWN'
    WHEN 'merchant' THEN 'OWN'
    WHEN 'admin' THEN 'ADM'
    WHEN 'super_admin' THEN 'ADM'
    WHEN 'store_manager' THEN 'MGR'
    WHEN 'cashier' THEN 'CSH'
    WHEN 'staff' THEN 'STF'
    ELSE 'USR'
  END;
  LOOP
    new_code := prefix || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0');
    SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE ref_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  NEW.ref_code := new_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_store_ref_code ON public.stores;
CREATE TRIGGER set_store_ref_code
  BEFORE INSERT ON public.stores
  FOR EACH ROW
  WHEN (NEW.ref_code IS NULL)
  EXECUTE FUNCTION public.generate_store_ref_code();

DROP TRIGGER IF EXISTS set_user_role_ref_code ON public.user_roles;
CREATE TRIGGER set_user_role_ref_code
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW
  WHEN (NEW.ref_code IS NULL)
  EXECUTE FUNCTION public.generate_user_role_ref_code();

-- Backfill existing rows
DO $$
DECLARE
  r RECORD;
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  FOR r IN SELECT id FROM public.stores WHERE ref_code IS NULL LOOP
    LOOP
      new_code := 'STR' || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0');
      SELECT EXISTS(SELECT 1 FROM public.stores WHERE ref_code = new_code) INTO code_exists;
      EXIT WHEN NOT code_exists;
    END LOOP;
    UPDATE public.stores SET ref_code = new_code WHERE id = r.id;
  END LOOP;

  FOR r IN SELECT id, role::text as role FROM public.user_roles WHERE ref_code IS NULL LOOP
    LOOP
      new_code := CASE r.role
        WHEN 'owner' THEN 'OWN'
        WHEN 'merchant' THEN 'OWN'
        WHEN 'admin' THEN 'ADM'
        WHEN 'super_admin' THEN 'ADM'
        WHEN 'store_manager' THEN 'MGR'
        WHEN 'cashier' THEN 'CSH'
        WHEN 'staff' THEN 'STF'
        ELSE 'USR'
      END || LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0');
      SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE ref_code = new_code) INTO code_exists;
      EXIT WHEN NOT code_exists;
    END LOOP;
    UPDATE public.user_roles SET ref_code = new_code WHERE id = r.id;
  END LOOP;
END $$;
