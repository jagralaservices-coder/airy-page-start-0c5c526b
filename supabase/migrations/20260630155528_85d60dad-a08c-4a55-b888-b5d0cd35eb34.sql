
-- ==========================================================
-- CASHIER BILLING MODULE (OPTIONAL) — Additive, no impact on existing Staff module
-- ==========================================================

-- 1. cashiers table
CREATE TABLE IF NOT EXISTS public.cashiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  merchant_id uuid,
  cashier_code text NOT NULL,
  name text NOT NULL,
  pin_hash text NOT NULL,
  photo_url text,
  is_active boolean NOT NULL DEFAULT true,
  permissions jsonb NOT NULL DEFAULT '{
    "manualDiscount": true,
    "billVoid": false,
    "billReturn": false,
    "reprintBill": true,
    "priceEdit": false,
    "itemDelete": true,
    "cashDrawer": true,
    "customerCreation": true
  }'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (store_id, cashier_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cashiers TO authenticated;
GRANT ALL ON public.cashiers TO service_role;

ALTER TABLE public.cashiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners/managers manage cashiers in their store"
ON public.cashiers
FOR ALL
TO authenticated
USING (public.can_manage_store(store_id))
WITH CHECK (public.can_manage_store(store_id));

CREATE TRIGGER trg_cashiers_updated_at
BEFORE UPDATE ON public.cashiers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. cashier_shifts
CREATE TABLE IF NOT EXISTS public.cashier_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id uuid NOT NULL REFERENCES public.cashiers(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  device_name text,
  bills_created int NOT NULL DEFAULT 0,
  sales_amount numeric NOT NULL DEFAULT 0,
  cash_collected numeric NOT NULL DEFAULT 0,
  upi_collected numeric NOT NULL DEFAULT 0,
  card_collected numeric NOT NULL DEFAULT 0,
  credit_sales numeric NOT NULL DEFAULT 0,
  refunds numeric NOT NULL DEFAULT 0,
  discount_given numeric NOT NULL DEFAULT 0,
  cancelled_bills int NOT NULL DEFAULT 0,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cashier_shifts TO authenticated;
GRANT ALL ON public.cashier_shifts TO service_role;

ALTER TABLE public.cashier_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners/managers view shifts in their store"
ON public.cashier_shifts
FOR ALL
TO authenticated
USING (public.can_manage_store(store_id))
WITH CHECK (public.can_manage_store(store_id));

CREATE TRIGGER trg_cashier_shifts_updated_at
BEFORE UPDATE ON public.cashier_shifts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_cashier_shifts_store_open ON public.cashier_shifts(store_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_cashier ON public.cashier_shifts(cashier_id, opened_at DESC);

-- 3. cashier_audit_log
CREATE TABLE IF NOT EXISTS public.cashier_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id uuid REFERENCES public.cashiers(id) ON DELETE SET NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.cashier_shifts(id) ON DELETE SET NULL,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.cashier_audit_log TO authenticated;
GRANT ALL ON public.cashier_audit_log TO service_role;

ALTER TABLE public.cashier_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners/managers view audit in their store"
ON public.cashier_audit_log
FOR SELECT
TO authenticated
USING (public.can_manage_store(store_id));

CREATE POLICY "Service-role/managers insert audit"
ON public.cashier_audit_log
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_store(store_id));

CREATE INDEX IF NOT EXISTS idx_cashier_audit_store ON public.cashier_audit_log(store_id, created_at DESC);

-- 4. Bill tracking columns on orders (additive, nullable)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cashier_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cashier_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cashier_shift_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS device_name text;

-- 5. Cashier billing mode flag on stores
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS cashier_billing_mode boolean NOT NULL DEFAULT false;

-- 6. PIN verify RPC (SECURITY DEFINER, returns cashier row without pin_hash)
CREATE OR REPLACE FUNCTION public.cashier_verify_pin(_store_id uuid, _identifier text, _pin text)
RETURNS TABLE(id uuid, store_id uuid, cashier_code text, name text, photo_url text, permissions jsonb, is_active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row public.cashiers%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.cashiers
   WHERE store_id = _store_id
     AND is_active = true
     AND (lower(cashier_code) = lower(_identifier) OR lower(name) = lower(_identifier))
   LIMIT 1;

  IF v_row.id IS NULL THEN RETURN; END IF;
  IF v_row.pin_hash <> encode(extensions.digest(_pin || '::' || v_row.id::text, 'sha256'), 'hex') THEN RETURN; END IF;

  RETURN QUERY SELECT v_row.id, v_row.store_id, v_row.cashier_code, v_row.name, v_row.photo_url, v_row.permissions, v_row.is_active;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashier_verify_pin(uuid, text, text) TO authenticated, anon;

-- 7. Helper to hash a PIN consistently with verify (client uses RPC to set)
CREATE OR REPLACE FUNCTION public.cashier_set_pin(_cashier_id uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_store uuid;
BEGIN
  SELECT store_id INTO v_store FROM public.cashiers WHERE id = _cashier_id;
  IF v_store IS NULL THEN RAISE EXCEPTION 'cashier_not_found'; END IF;
  IF NOT public.can_manage_store(v_store) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF length(_pin) < 4 THEN RAISE EXCEPTION 'pin_too_short'; END IF;

  UPDATE public.cashiers
     SET pin_hash = encode(extensions.digest(_pin || '::' || _cashier_id::text, 'sha256'), 'hex'),
         updated_at = now()
   WHERE id = _cashier_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashier_set_pin(uuid, text) TO authenticated;

-- 8. RPC to create cashier with PIN in one shot
CREATE OR REPLACE FUNCTION public.cashier_create(
  _store_id uuid,
  _cashier_code text,
  _name text,
  _pin text,
  _photo_url text DEFAULT NULL,
  _permissions jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_merchant uuid;
BEGIN
  IF NOT public.can_manage_store(_store_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF length(_pin) < 4 THEN RAISE EXCEPTION 'pin_too_short'; END IF;

  SELECT merchant_id INTO v_merchant FROM public.stores WHERE id = _store_id;
  v_id := gen_random_uuid();

  INSERT INTO public.cashiers (id, store_id, merchant_id, cashier_code, name, pin_hash, photo_url, permissions, created_by)
  VALUES (
    v_id, _store_id, v_merchant, _cashier_code, _name,
    encode(extensions.digest(_pin || '::' || v_id::text, 'sha256'), 'hex'),
    _photo_url,
    COALESCE(_permissions, '{
      "manualDiscount": true, "billVoid": false, "billReturn": false,
      "reprintBill": true, "priceEdit": false, "itemDelete": true,
      "cashDrawer": true, "customerCreation": true
    }'::jsonb),
    auth.uid()
  );
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashier_create(uuid, text, text, text, text, jsonb) TO authenticated;

-- 9. Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.cashiers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cashier_shifts;
