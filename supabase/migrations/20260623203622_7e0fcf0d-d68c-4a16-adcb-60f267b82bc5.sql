
-- Migration A: Additive widening of public.orders for legacy denormalized client payload

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS bill_number text,
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tax numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_details jsonb,
  ADD COLUMN IF NOT EXISTS payment_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS table_number text,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Order_number is NOT NULL with no default. Backfill any NULLs (none expected) and add default.
ALTER TABLE public.orders ALTER COLUMN order_number SET DEFAULT public.generate_order_number();

-- Subtotal/total etc. already default 0 per schema; ensure status default exists.
-- (status is USER-DEFINED enum NOT NULL; client always sends one. Leave as-is.)

-- Indexes for the new query patterns
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_created_at ON public.orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_bill_number ON public.orders(store_id, bill_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders(store_id, customer_phone);

-- Grants (idempotent)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

-- Realtime: ensure orders publishes full row + is included in realtime
ALTER TABLE public.orders REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders';
  END IF;
END $$;
