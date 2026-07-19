CREATE TABLE IF NOT EXISTS public.inventory_items (
  id text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'pcs',
  min_stock numeric NOT NULL DEFAULT 0,
  cost_per_unit numeric NOT NULL DEFAULT 0,
  cost_unit text DEFAULT 'pcs',
  production_yield numeric,
  production_yield_unit text,
  barcode text,
  batch_number text,
  expiry_date date,
  hsn_code text,
  gst_percentage numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, store_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.held_bills (
  id text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  table_number integer,
  customer_name text,
  held_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, store_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.held_bills TO authenticated;
GRANT ALL ON public.held_bills TO service_role;
ALTER TABLE public.held_bills ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.qr_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  table_number text,
  customer_name text,
  customer_phone text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.qr_orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qr_orders TO authenticated;
GRANT ALL ON public.qr_orders TO service_role;
ALTER TABLE public.qr_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.store_whatsapp_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  whatsapp_number text NOT NULL DEFAULT '',
  instance_id text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_whatsapp_config TO authenticated;
GRANT ALL ON public.store_whatsapp_config TO service_role;
ALTER TABLE public.store_whatsapp_config ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='inventory_items' AND policyname='inventory_items_store_access') THEN
    CREATE POLICY "inventory_items_store_access" ON public.inventory_items
    FOR ALL TO authenticated
    USING (public.can_manage_store(store_id))
    WITH CHECK (public.can_manage_store(store_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='held_bills' AND policyname='held_bills_store_access') THEN
    CREATE POLICY "held_bills_store_access" ON public.held_bills
    FOR ALL TO authenticated
    USING (public.can_manage_store(store_id))
    WITH CHECK (public.can_manage_store(store_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='qr_orders' AND policyname='anyone_can_place_qr_orders') THEN
    CREATE POLICY "anyone_can_place_qr_orders" ON public.qr_orders
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='qr_orders' AND policyname='anyone_can_track_qr_orders') THEN
    CREATE POLICY "anyone_can_track_qr_orders" ON public.qr_orders
    FOR SELECT TO anon
    USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='qr_orders' AND policyname='qr_orders_store_select') THEN
    CREATE POLICY "qr_orders_store_select" ON public.qr_orders
    FOR SELECT TO authenticated
    USING (public.can_manage_store(store_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='qr_orders' AND policyname='qr_orders_store_update') THEN
    CREATE POLICY "qr_orders_store_update" ON public.qr_orders
    FOR UPDATE TO authenticated
    USING (public.can_manage_store(store_id))
    WITH CHECK (public.can_manage_store(store_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='store_whatsapp_config' AND policyname='store_whatsapp_config_store_access') THEN
    CREATE POLICY "store_whatsapp_config_store_access" ON public.store_whatsapp_config
    FOR ALL TO authenticated
    USING (public.can_manage_store(store_id))
    WITH CHECK (public.can_manage_store(store_id));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_items_store_id ON public.inventory_items(store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_barcode ON public.inventory_items(barcode);
CREATE INDEX IF NOT EXISTS idx_held_bills_store_id ON public.held_bills(store_id);
CREATE INDEX IF NOT EXISTS idx_qr_orders_store_id ON public.qr_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_qr_orders_status ON public.qr_orders(status);
CREATE INDEX IF NOT EXISTS idx_qr_orders_created_at ON public.qr_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_store_whatsapp_config_store_id ON public.store_whatsapp_config(store_id);

DROP TRIGGER IF EXISTS update_inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER update_inventory_items_updated_at
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_held_bills_updated_at ON public.held_bills;
CREATE TRIGGER update_held_bills_updated_at
BEFORE UPDATE ON public.held_bills
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_qr_orders_updated_at ON public.qr_orders;
CREATE TRIGGER update_qr_orders_updated_at
BEFORE UPDATE ON public.qr_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_store_whatsapp_config_updated_at ON public.store_whatsapp_config;
CREATE TRIGGER update_store_whatsapp_config_updated_at
BEFORE UPDATE ON public.store_whatsapp_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'qr_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.qr_orders;
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;