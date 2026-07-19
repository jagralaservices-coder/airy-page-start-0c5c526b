
CREATE TABLE IF NOT EXISTS public.store_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL DEFAULT 'true'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, setting_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='store_settings'
      AND policyname='Allow authenticated on store_settings'
  ) THEN
    CREATE POLICY "Allow authenticated on store_settings"
      ON public.store_settings FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END$$;

ALTER TABLE public.staff_attendance
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_in_latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS check_in_longitude NUMERIC,
  ADD COLUMN IF NOT EXISTS check_in_distance INTEGER,
  ADD COLUMN IF NOT EXISTS check_out_latitude NUMERIC,
  ADD COLUMN IF NOT EXISTS check_out_longitude NUMERIC,
  ADD COLUMN IF NOT EXISTS check_out_distance INTEGER,
  ADD COLUMN IF NOT EXISTS verification_method TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff_attendance' AND column_name='latitude') THEN
    UPDATE public.staff_attendance SET check_in_latitude = latitude WHERE check_in_latitude IS NULL AND latitude IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff_attendance' AND column_name='longitude') THEN
    UPDATE public.staff_attendance SET check_in_longitude = longitude WHERE check_in_longitude IS NULL AND longitude IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff_attendance' AND column_name='verification_type') THEN
    UPDATE public.staff_attendance SET verification_method = verification_type WHERE verification_method IS NULL AND verification_type IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff_attendance' AND column_name='check_in') THEN
    UPDATE public.staff_attendance SET check_in_time = check_in WHERE check_in_time IS NULL AND check_in IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff_attendance' AND column_name='check_out') THEN
    UPDATE public.staff_attendance SET check_out_time = check_out WHERE check_out_time IS NULL AND check_out IS NOT NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff_attendance' AND column_name='staff_id') THEN
    UPDATE public.staff_attendance sa
    SET user_id = ur.user_id
    FROM public.user_roles ur
    WHERE sa.user_id IS NULL AND sa.staff_id = ur.id;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_app_staff_attendance_user_id ON public.staff_attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_app_staff_attendance_check_in_time ON public.staff_attendance(check_in_time);

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='staff_attendance'
      AND policyname='Allow authenticated on staff_attendance'
  ) THEN
    CREATE POLICY "Allow authenticated on staff_attendance"
      ON public.staff_attendance FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';
