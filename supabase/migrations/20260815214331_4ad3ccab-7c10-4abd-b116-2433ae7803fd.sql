REVOKE ALL ON FUNCTION public.compute_business_date(timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_business_date(timestamptz, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_store(_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND COALESCE(ur.is_active, true)
      AND (
        ur.role IN ('super_admin', 'admin')
        OR (
          ur.role IN ('owner', 'merchant', 'accountant')
          AND ur.merchant_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.stores s
            WHERE s.id = _store_id AND s.merchant_id = ur.merchant_id
          )
        )
        OR ur.store_id = _store_id
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = _store_id AND s.owner_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_store(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_store(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS orders_select_store ON public.orders;
DROP POLICY IF EXISTS store_login_can_read_own_orders ON public.orders;
DROP POLICY IF EXISTS orders_insert_store ON public.orders;
DROP POLICY IF EXISTS orders_update_store ON public.orders;
DROP POLICY IF EXISTS orders_delete_store ON public.orders;
DROP POLICY IF EXISTS orders_select_scoped ON public.orders;
DROP POLICY IF EXISTS orders_insert_scoped ON public.orders;
DROP POLICY IF EXISTS orders_update_scoped ON public.orders;

CREATE POLICY orders_select_scoped ON public.orders
  FOR SELECT TO authenticated
  USING (public.can_access_store(store_id));

CREATE POLICY orders_insert_scoped ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_store(store_id));

CREATE POLICY orders_update_scoped ON public.orders
  FOR UPDATE TO authenticated
  USING (public.can_access_store(store_id))
  WITH CHECK (public.can_access_store(store_id));

REVOKE DELETE ON public.orders FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_sale(_order_id uuid, _reason text, _expected_version integer DEFAULT NULL)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _before public.orders;
  _after  public.orders;
BEGIN
  SELECT * INTO _before FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF NOT public.can_access_store(_before.store_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF _expected_version IS NOT NULL AND _expected_version <> _before.version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: expected % but current is %', _expected_version, _before.version;
  END IF;

  IF _before.status = 'cancelled' THEN
    RETURN _before;
  END IF;

  UPDATE public.orders
     SET status = 'cancelled',
         cancel_reason = _reason,
         cancelled_at = now(),
         cancelled_by_user_id = auth.uid(),
         updated_by_user_id = auth.uid()
   WHERE id = _order_id
  RETURNING * INTO _after;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (auth.uid(), 'BILL_CANCELLED', 'orders', _order_id,
          to_jsonb(_before), to_jsonb(_after),
          jsonb_build_object('reason', _reason, 'store_id', _before.store_id));

  RETURN _after;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_sale(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_sale(uuid, text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.edit_sale(
  _order_id uuid,
  _expected_version integer,
  _items jsonb DEFAULT NULL,
  _discount numeric DEFAULT NULL,
  _tax numeric DEFAULT NULL,
  _payment_method text DEFAULT NULL,
  _customer_name text DEFAULT NULL,
  _customer_phone text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _before public.orders;
  _after  public.orders;
  _new_items jsonb;
  _subtotal numeric;
  _disc numeric;
  _tx numeric;
BEGIN
  SELECT * INTO _before FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF NOT public.can_access_store(_before.store_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF _before.status = 'cancelled' THEN
    RAISE EXCEPTION 'ORDER_CANCELLED';
  END IF;

  IF _expected_version IS NOT NULL AND _expected_version <> _before.version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT: expected % but current is %', _expected_version, _before.version;
  END IF;

  _new_items := COALESCE(_items, _before.items, '[]'::jsonb);

  SELECT COALESCE(SUM(
           COALESCE((i->>'price')::numeric, 0) * COALESCE((i->>'quantity')::numeric, 1)
         ), 0)
    INTO _subtotal
  FROM jsonb_array_elements(_new_items) i;

  _disc := COALESCE(_discount, _before.discount, 0);
  _tx   := COALESCE(_tax, _before.tax, 0);

  UPDATE public.orders
     SET items = _new_items,
         subtotal = _subtotal,
         discount = _disc,
         tax = _tx,
         total = GREATEST(_subtotal - _disc + _tx, 0),
         payment_method = COALESCE(_payment_method, payment_method),
         customer_name = COALESCE(_customer_name, customer_name),
         customer_phone = COALESCE(_customer_phone, customer_phone),
         notes = COALESCE(_notes, notes),
         updated_by_user_id = auth.uid()
   WHERE id = _order_id
  RETURNING * INTO _after;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data, metadata)
  VALUES (auth.uid(), 'BILL_EDITED', 'orders', _order_id,
          to_jsonb(_before), to_jsonb(_after),
          jsonb_build_object('store_id', _before.store_id));

  RETURN _after;
END;
$$;

REVOKE ALL ON FUNCTION public.edit_sale(uuid, integer, jsonb, numeric, numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_sale(uuid, integer, jsonb, numeric, numeric, text, text, text, text) TO authenticated, service_role;