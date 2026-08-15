CREATE OR REPLACE FUNCTION public.create_sale_tx(
  _store_id uuid,
  _payload jsonb,
  _actor_user_id uuid DEFAULT NULL,
  _actor_role text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing public.orders;
  _order    public.orders;
  _ctid     text := NULLIF(_payload->>'client_transaction_id', '');
  _items    jsonb := COALESCE(_payload->'items', '[]'::jsonb);
  _subtotal numeric := 0;
  _discount numeric := COALESCE((_payload->>'discount')::numeric, 0);
  _tax      numeric := COALESCE((_payload->>'tax')::numeric, 0);
  _total    numeric;
  _order_id uuid := COALESCE(NULLIF(_payload->>'id','')::uuid, gen_random_uuid());
  _created  timestamptz := COALESCE(NULLIF(_payload->>'created_at','')::timestamptz, now());
  _merchant uuid;
  it        jsonb;
  ing       record;
  _before   numeric;
BEGIN
  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'STORE_REQUIRED';
  END IF;

  -- Idempotency: same client transaction never creates two bills.
  IF _ctid IS NOT NULL THEN
    SELECT * INTO _existing FROM public.orders
     WHERE store_id = _store_id AND client_transaction_id = _ctid;
    IF FOUND THEN
      RETURN _existing;
    END IF;
  END IF;

  SELECT merchant_id INTO _merchant FROM public.stores WHERE id = _store_id;

  -- Server-side money recalculation. Client totals are ignored.
  SELECT COALESCE(SUM(
           COALESCE((i->>'price')::numeric, 0) * COALESCE((i->>'quantity')::numeric, 1)
         ), 0)
    INTO _subtotal
  FROM jsonb_array_elements(_items) i;

  _total := GREATEST(_subtotal - _discount + _tax, 0);

  INSERT INTO public.orders (
    id, store_id, bill_number, items, subtotal, tax, discount, total,
    order_type, table_number, customer_id, customer_name, customer_phone,
    payment_method, payment_details, payment_breakdown, status,
    cashier_id, cashier_name, cashier_shift_id, device_name,
    client_transaction_id, created_by_user_id, created_by_role,
    created_at, updated_at
  ) VALUES (
    _order_id,
    _store_id,
    COALESCE(NULLIF(_payload->>'bill_number',''), 'B' || to_char(now(), 'YYMMDDHH24MISS')),
    _items,
    _subtotal, _tax, _discount, _total,
    COALESCE(NULLIF(replace(_payload->>'order_type', '-', '_'), ''), 'dine_in')::order_type,
    NULLIF(_payload->>'table_number',''),
    NULLIF(_payload->>'customer_id','')::uuid,
    NULLIF(_payload->>'customer_name',''),
    NULLIF(_payload->>'customer_phone',''),
    COALESCE(NULLIF(_payload->>'payment_method',''), 'cash'),
    _payload->'payment_details',
    _payload->'payment_breakdown',
    COALESCE(NULLIF(_payload->>'status',''), 'completed')::order_status,
    NULLIF(_payload->>'cashier_id','')::uuid,
    NULLIF(_payload->>'cashier_name',''),
    NULLIF(_payload->>'cashier_shift_id','')::uuid,
    NULLIF(_payload->>'device_name',''),
    _ctid,
    _actor_user_id,
    _actor_role,
    _created,
    now()
  )
  RETURNING * INTO _order;

  -- Line items (normalized)
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.order_items (
      order_id, product_id, name_snapshot, quantity, unit_price, tax_rate, discount, line_total
    ) VALUES (
      _order.id,
      NULLIF(it->>'product_id','')::uuid,
      COALESCE(it->>'name', 'Item'),
      COALESCE((it->>'quantity')::numeric, 1),
      COALESCE((it->>'price')::numeric, 0),
      COALESCE((it->>'tax_rate')::numeric, 0),
      COALESCE((it->>'discount')::numeric, 0),
      COALESCE((it->>'price')::numeric, 0) * COALESCE((it->>'quantity')::numeric, 1)
    );
  END LOOP;

  -- Payment record
  IF _order.status <> 'cancelled' THEN
    INSERT INTO public.payments (order_id, method, amount, reference)
    VALUES (
      _order.id,
      COALESCE(NULLIF(_payload->>'payment_method',''), 'cash')::payment_method,
      _total,
      NULLIF(_payload->>'payment_reference','')
    );
  END IF;

  -- Inventory deduction from recipes, atomic with the sale
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF NULLIF(it->>'menu_item_id','') IS NULL THEN
      CONTINUE;
    END IF;
    FOR ing IN
      SELECT mi.inventory_item_id, mi.quantity_required, mi.unit
        FROM public.menu_item_ingredients mi
       WHERE mi.menu_item_id = (it->>'menu_item_id')::uuid
    LOOP
      SELECT quantity INTO _before FROM public.inventory_items
       WHERE id = ing.inventory_item_id AND store_id = _store_id FOR UPDATE;
      IF NOT FOUND THEN CONTINUE; END IF;

      UPDATE public.inventory_items
         SET quantity = quantity - (ing.quantity_required * COALESCE((it->>'quantity')::numeric, 1)),
             updated_at = now()
       WHERE id = ing.inventory_item_id;

      INSERT INTO public.inventory_transactions (
        inventory_item_id, store_id, merchant_id, order_id, source,
        qty_delta, qty_before, qty_after, unit, reference, created_by
      ) VALUES (
        ing.inventory_item_id, _store_id, _merchant, _order.id, 'SALE',
        -(ing.quantity_required * COALESCE((it->>'quantity')::numeric, 1)),
        _before,
        _before - (ing.quantity_required * COALESCE((it->>'quantity')::numeric, 1)),
        ing.unit,
        _order.bill_number,
        _actor_user_id
      );
    END LOOP;
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data, metadata)
  VALUES (_actor_user_id, 'BILL_CREATED', 'orders', _order.id, to_jsonb(_order),
          jsonb_build_object('store_id', _store_id, 'role', _actor_role,
                             'business_date', _order.business_date));

  RETURN _order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_tx(uuid, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_tx(uuid, jsonb, uuid, text) TO service_role;

-- Authenticated-user entrypoint: identity comes from the session, never the client.
CREATE OR REPLACE FUNCTION public.create_sale(_store_id uuid, _payload jsonb)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  IF NOT public.can_access_store(_store_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT ur.role::text INTO _role
    FROM public.user_roles ur
   WHERE ur.user_id = auth.uid() AND COALESCE(ur.is_active, true)
   ORDER BY (ur.store_id = _store_id) DESC
   LIMIT 1;

  RETURN public.create_sale_tx(_store_id, _payload, auth.uid(), _role);
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, jsonb) TO authenticated, service_role;