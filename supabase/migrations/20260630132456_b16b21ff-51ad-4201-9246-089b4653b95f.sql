
-- 1) brands table
CREATE TABLE IF NOT EXISTS public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE SET NULL,
  name text NOT NULL,
  brand_type text NOT NULL DEFAULT 'external' CHECK (brand_type IN ('internal','external')),
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS brands_store_name_uidx ON public.brands(store_id, lower(name));
CREATE INDEX IF NOT EXISTS brands_store_idx ON public.brands(store_id);
CREATE INDEX IF NOT EXISTS brands_merchant_idx ON public.brands(merchant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brands_select" ON public.brands FOR SELECT TO authenticated
  USING (public.can_manage_store(store_id));
CREATE POLICY "brands_insert" ON public.brands FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_store(store_id));
CREATE POLICY "brands_update" ON public.brands FOR UPDATE TO authenticated
  USING (public.can_manage_store(store_id)) WITH CHECK (public.can_manage_store(store_id));
CREATE POLICY "brands_delete" ON public.brands FOR DELETE TO authenticated
  USING (public.can_manage_store(store_id));

DROP TRIGGER IF EXISTS trg_brands_updated_at ON public.brands;
CREATE TRIGGER trg_brands_updated_at BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_brands_meta_ins ON public.brands;
CREATE TRIGGER trg_brands_meta_ins BEFORE INSERT ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.stamp_metadata_on_insert();

DROP TRIGGER IF EXISTS trg_brands_meta_upd ON public.brands;
CREATE TRIGGER trg_brands_meta_upd BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.enforce_metadata_versioning();

ALTER PUBLICATION supabase_realtime ADD TABLE public.brands;

-- 2) products columns (additive, optional)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brand_type text CHECK (brand_type IN ('internal','external'));

CREATE INDEX IF NOT EXISTS products_brand_idx ON public.products(store_id, brand_id);

CREATE OR REPLACE FUNCTION public.products_apply_brand_defaults()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.brand_id IS NULL THEN
    NEW.brand_type := 'internal';
  ELSIF NEW.brand_type IS NULL THEN
    NEW.brand_type := 'external';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_products_brand_defaults ON public.products;
CREATE TRIGGER trg_products_brand_defaults BEFORE INSERT OR UPDATE OF brand_id, brand_type ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_apply_brand_defaults();

-- 3) stores settings
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS default_internal_brand text,
  ADD COLUMN IF NOT EXISTS brand_type_default text NOT NULL DEFAULT 'internal'
    CHECK (brand_type_default IN ('internal','external'));
