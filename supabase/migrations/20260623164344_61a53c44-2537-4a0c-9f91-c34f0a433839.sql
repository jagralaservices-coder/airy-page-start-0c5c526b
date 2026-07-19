
-- Phase 2.5: Server-side metadata layer for offline-first conflict detection.
-- Single JSONB column per core business table, no schema rewrite.
-- Shape: { organization_id, session_id, version_number, updated_by, updated_at, device_id? }

-- 1. Add metadata column to core tables (idempotent)
ALTER TABLE public.orders     ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.customers  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.products   ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Expression indexes on version_number for fast conflict checks
CREATE INDEX IF NOT EXISTS orders_metadata_version_idx     ON public.orders     ((metadata->>'version_number'));
CREATE INDEX IF NOT EXISTS customers_metadata_version_idx  ON public.customers  ((metadata->>'version_number'));
CREATE INDEX IF NOT EXISTS menu_items_metadata_version_idx ON public.menu_items ((metadata->>'version_number'));
CREATE INDEX IF NOT EXISTS products_metadata_version_idx   ON public.products   ((metadata->>'version_number'));

-- 3. Backfill existing rows with version_number = 1 and stamp updated_at
UPDATE public.orders SET metadata = jsonb_build_object(
  'version_number', 1,
  'updated_at', COALESCE(updated_at, created_at, now())::text,
  'backfilled', true
) WHERE metadata = '{}'::jsonb OR metadata IS NULL;

UPDATE public.customers SET metadata = jsonb_build_object(
  'version_number', 1,
  'updated_at', COALESCE(updated_at, created_at, now())::text,
  'backfilled', true
) WHERE metadata = '{}'::jsonb OR metadata IS NULL;

UPDATE public.menu_items SET metadata = jsonb_build_object(
  'version_number', 1,
  'updated_at', COALESCE(updated_at, created_at, now())::text,
  'backfilled', true
) WHERE metadata = '{}'::jsonb OR metadata IS NULL;

UPDATE public.products SET metadata = jsonb_build_object(
  'version_number', 1,
  'updated_at', COALESCE(updated_at, created_at, now())::text,
  'backfilled', true
) WHERE metadata = '{}'::jsonb OR metadata IS NULL;

-- 4. Generic trigger: optimistic concurrency + auto-stamp.
--    * If incoming metadata.version_number < existing → raise '40001' (conflict).
--    * If incoming metadata is missing/blank → carry over previous + bump (legacy client safe).
--    * Always set metadata.updated_at = now() server-side.
CREATE OR REPLACE FUNCTION public.enforce_metadata_versioning()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_v int;
  new_v int;
  merged jsonb;
BEGIN
  old_v := COALESCE((OLD.metadata->>'version_number')::int, 0);
  new_v := COALESCE((NEW.metadata->>'version_number')::int, 0);

  -- Legacy client: no metadata sent → preserve old + bump.
  IF NEW.metadata IS NULL OR NEW.metadata = '{}'::jsonb OR new_v = 0 THEN
    merged := COALESCE(OLD.metadata, '{}'::jsonb)
              || jsonb_build_object(
                'version_number', old_v + 1,
                'updated_at', now()::text
              );
    NEW.metadata := merged;
    RETURN NEW;
  END IF;

  -- Conflict: incoming version is stale.
  IF new_v < old_v THEN
    RAISE EXCEPTION 'metadata_version_conflict: incoming=% stored=%', new_v, old_v
      USING ERRCODE = '40001',
            HINT = 'pull latest then retry';
  END IF;

  -- Accepted: stamp server-side updated_at, keep client fields.
  NEW.metadata := NEW.metadata || jsonb_build_object('updated_at', now()::text);
  RETURN NEW;
END;
$$;

-- 5. Attach trigger to each core table (drop+create for idempotency)
DROP TRIGGER IF EXISTS trg_orders_metadata_versioning     ON public.orders;
DROP TRIGGER IF EXISTS trg_customers_metadata_versioning  ON public.customers;
DROP TRIGGER IF EXISTS trg_menu_items_metadata_versioning ON public.menu_items;
DROP TRIGGER IF EXISTS trg_products_metadata_versioning   ON public.products;

CREATE TRIGGER trg_orders_metadata_versioning
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_metadata_versioning();

CREATE TRIGGER trg_customers_metadata_versioning
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_metadata_versioning();

CREATE TRIGGER trg_menu_items_metadata_versioning
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_metadata_versioning();

CREATE TRIGGER trg_products_metadata_versioning
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_metadata_versioning();

-- 6. INSERT-side: stamp v=1 on rows that arrive with no metadata
CREATE OR REPLACE FUNCTION public.stamp_metadata_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.metadata IS NULL OR NEW.metadata = '{}'::jsonb OR (NEW.metadata->>'version_number') IS NULL THEN
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
                    || jsonb_build_object(
                      'version_number', 1,
                      'updated_at', now()::text
                    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_metadata_insert     ON public.orders;
DROP TRIGGER IF EXISTS trg_customers_metadata_insert  ON public.customers;
DROP TRIGGER IF EXISTS trg_menu_items_metadata_insert ON public.menu_items;
DROP TRIGGER IF EXISTS trg_products_metadata_insert   ON public.products;

CREATE TRIGGER trg_orders_metadata_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_metadata_on_insert();

CREATE TRIGGER trg_customers_metadata_insert
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.stamp_metadata_on_insert();

CREATE TRIGGER trg_menu_items_metadata_insert
  BEFORE INSERT ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.stamp_metadata_on_insert();

CREATE TRIGGER trg_products_metadata_insert
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.stamp_metadata_on_insert();
