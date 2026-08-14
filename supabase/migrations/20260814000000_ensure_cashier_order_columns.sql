-- Ensure cashier-related columns exist on orders table (safe, idempotent)
-- These columns are needed for the Cashier Billing Module to tag bills with cashier info.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cashier_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cashier_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cashier_shift_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS device_name text;

-- Also ensure payment_breakdown column exists (used for part-payment tracking)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_breakdown jsonb;
