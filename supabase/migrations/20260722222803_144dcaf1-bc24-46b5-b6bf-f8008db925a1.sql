
-- Step 1: Backfill from staff table
UPDATE public.user_roles ur
SET
  store_id    = COALESCE(ur.store_id, s.store_id),
  customer_id = COALESCE(ur.customer_id, s.customer_id, st.merchant_id),
  merchant_id = COALESCE(ur.merchant_id, st.merchant_id, s.customer_id)
FROM public.staff s
LEFT JOIN public.stores st ON st.id = s.store_id
WHERE ur.role = 'cashier'
  AND ur.user_id = s.user_id
  AND (ur.store_id IS NULL OR ur.merchant_id IS NULL OR ur.customer_id IS NULL);

-- Step 2: Backfill merchant_id from sibling role rows for the same user
UPDATE public.user_roles ur
SET
  merchant_id = COALESCE(ur.merchant_id, sib.merchant_id, sib.customer_id),
  customer_id = COALESCE(ur.customer_id, sib.customer_id, sib.merchant_id)
FROM public.user_roles sib
WHERE ur.role = 'cashier'
  AND sib.user_id = ur.user_id
  AND sib.id <> ur.id
  AND sib.merchant_id IS NOT NULL
  AND ur.merchant_id IS NULL;

-- Step 3: If merchant has exactly one active store, assign it
UPDATE public.user_roles ur
SET store_id = only_store.store_id
FROM (
  SELECT merchant_id, (array_agg(id))[1] AS store_id
  FROM public.stores
  WHERE is_active = true
  GROUP BY merchant_id
  HAVING COUNT(*) = 1
) only_store
WHERE ur.role = 'cashier'
  AND ur.store_id IS NULL
  AND ur.merchant_id IS NOT NULL
  AND ur.merchant_id = only_store.merchant_id;

-- Step 4: Deactivate cashiers still missing store_id (manual reassignment required)
UPDATE public.user_roles
SET is_active = false
WHERE role = 'cashier'
  AND store_id IS NULL
  AND is_active = true;
