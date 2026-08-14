ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cashier_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cashier_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cashier_shift_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS device_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_breakdown jsonb;