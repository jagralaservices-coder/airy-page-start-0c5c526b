-- Alter existing cashiers table to match new requirements
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS mobile text;
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active';
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS role text DEFAULT 'CASHIER';
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS last_login timestamptz;
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Copy data if needed
UPDATE public.cashiers SET full_name = name WHERE full_name IS NULL;

-- Unique constraint on username (skip if some are null for old rows)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cashiers_username_key') THEN
    ALTER TABLE public.cashiers ADD CONSTRAINT cashiers_username_key UNIQUE (username);
  END IF;
END $$;

-- Function to handle custom login logic by username or cashier_code
CREATE OR REPLACE FUNCTION public.get_cashier_auth_email(identifier text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM public.cashiers WHERE (username = identifier OR cashier_code = identifier) AND is_active = true LIMIT 1;
  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cashier_auth_email(text) TO anon, authenticated;
