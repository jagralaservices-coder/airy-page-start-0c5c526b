DROP POLICY IF EXISTS "anyone_can_place_qr_orders" ON public.qr_orders;
DROP POLICY IF EXISTS "Anyone can place QR orders" ON public.qr_orders;

CREATE POLICY "anyone_can_place_qr_orders"
ON public.qr_orders
FOR INSERT TO anon, authenticated
WITH CHECK (
  store_id IS NOT NULL
  AND jsonb_typeof(items) = 'array'
  AND jsonb_array_length(items) > 0
  AND status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id = qr_orders.store_id
      AND s.is_active = true
  )
);