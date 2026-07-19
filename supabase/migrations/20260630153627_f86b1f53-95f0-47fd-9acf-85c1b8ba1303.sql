
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS outlet_code TEXT,
  ADD COLUMN IF NOT EXISTS branch_name TEXT,
  ADD COLUMN IF NOT EXISTS branch_code TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS manager_user_id UUID,
  ADD COLUMN IF NOT EXISTS manager_name TEXT;

CREATE INDEX IF NOT EXISTS stores_merchant_idx ON public.stores(merchant_id);
CREATE INDEX IF NOT EXISTS stores_region_idx ON public.stores(region);
CREATE INDEX IF NOT EXISTS stores_branch_idx ON public.stores(branch_name);
CREATE INDEX IF NOT EXISTS stores_city_idx ON public.stores(city);
CREATE INDEX IF NOT EXISTS stores_state_idx ON public.stores(state);
