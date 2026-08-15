-- ============ STORE BUSINESS-DAY CONFIG ============
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS business_day_start_time time NOT NULL DEFAULT '06:00:00';

-- ============ ORDERS: integrity + ownership + business date ============
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS business_date date,
  ADD COLUMN IF NOT EXISTS client_transaction_id text,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS created_by_role text,
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- ============ CANONICAL BUSINESS-DATE FUNCTION ============
CREATE OR REPLACE FUNCTION public.compute_business_date(_ts timestamptz, _store_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tz text := 'Asia/Kolkata';
  _start time := '06:00:00';
  _local timestamp;
BEGIN
  IF _store_id IS NOT NULL THEN
    SELECT COALESCE(s.timezone, 'Asia/Kolkata'), COALESCE(s.business_day_start_time, '06:00:00')
      INTO _tz, _start
    FROM public.stores s WHERE s.id = _store_id;
    IF NOT FOUND THEN
      _tz := 'Asia/Kolkata'; _start := '06:00:00';
    END IF;
  END IF;

  _local := (COALESCE(_ts, now()) AT TIME ZONE _tz);

  IF _local::time < _start THEN
    RETURN (_local::date - 1);
  END IF;
  RETURN _local::date;
END;
$$;

-- ============ TRIGGER: stamp business_date + version ============
CREATE OR REPLACE FUNCTION public.orders_stamp_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.business_date IS NULL THEN
      NEW.business_date := public.compute_business_date(COALESCE(NEW.created_at, now()), NEW.store_id);
    END IF;
    NEW.version := COALESCE(NEW.version, 1);
    RETURN NEW;
  END IF;

  -- UPDATE: business_date is immutable once set (history never silently moves)
  NEW.business_date := COALESCE(OLD.business_date, public.compute_business_date(COALESCE(NEW.created_at, now()), NEW.store_id));
  NEW.version := COALESCE(OLD.version, 1) + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_stamp_integrity ON public.orders;
CREATE TRIGGER trg_orders_stamp_integrity
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_stamp_integrity();

-- ============ BACKFILL EXISTING SALES ============
UPDATE public.orders o
SET business_date = public.compute_business_date(o.created_at, o.store_id)
WHERE o.business_date IS NULL;

-- ============ IDEMPOTENCY + INDEXES ============
CREATE UNIQUE INDEX IF NOT EXISTS orders_store_client_txn_uidx
  ON public.orders (store_id, client_transaction_id)
  WHERE client_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_store_business_date_idx ON public.orders (store_id, business_date);
CREATE INDEX IF NOT EXISTS orders_store_created_at_idx ON public.orders (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_store_status_idx ON public.orders (store_id, status);
CREATE INDEX IF NOT EXISTS orders_cashier_idx ON public.orders (cashier_id);