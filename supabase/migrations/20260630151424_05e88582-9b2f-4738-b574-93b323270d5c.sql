-- Normalize/merge duplicate POS customers before enforcing uniqueness.
-- Pass 1: phone-based duplicates (ignores spaces, country code symbols, dashes, etc.).
WITH keyed AS (
  SELECT
    id,
    store_id,
    NULLIF(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '') AS phone_key,
    created_at
  FROM public.pos_customers
), ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (PARTITION BY store_id, phone_key ORDER BY created_at ASC NULLS LAST, id ASC) AS keep_id,
    ROW_NUMBER() OVER (PARTITION BY store_id, phone_key ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
  FROM keyed
  WHERE phone_key IS NOT NULL
), aliases AS (
  SELECT id AS old_id, keep_id AS new_id
  FROM ranked
  WHERE rn > 1 AND id <> keep_id
)
UPDATE public.orders o
SET customer_id = a.new_id
FROM aliases a
WHERE o.customer_id = a.old_id;

WITH keyed AS (
  SELECT
    id,
    store_id,
    NULLIF(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '') AS phone_key,
    created_at
  FROM public.pos_customers
), ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (PARTITION BY store_id, phone_key ORDER BY created_at ASC NULLS LAST, id ASC) AS keep_id,
    ROW_NUMBER() OVER (PARTITION BY store_id, phone_key ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
  FROM keyed
  WHERE phone_key IS NOT NULL
), aliases AS (
  SELECT id AS old_id, keep_id AS new_id
  FROM ranked
  WHERE rn > 1 AND id <> keep_id
)
UPDATE public.credit_ledger cl
SET customer_id = a.new_id
FROM aliases a
WHERE cl.customer_id = a.old_id;

WITH keyed AS (
  SELECT
    id,
    store_id,
    NULLIF(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '') AS phone_key,
    created_at
  FROM public.pos_customers
), ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY store_id, phone_key ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
  FROM keyed
  WHERE phone_key IS NOT NULL
)
DELETE FROM public.pos_customers pc
USING ranked r
WHERE pc.id = r.id AND r.rn > 1;

-- Pass 2: name-based duplicates for real customer names only.
WITH keyed AS (
  SELECT
    id,
    store_id,
    lower(regexp_replace(btrim(COALESCE(name, '')), '\s+', ' ', 'g')) AS name_key,
    created_at
  FROM public.pos_customers
), ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (PARTITION BY store_id, name_key ORDER BY created_at ASC NULLS LAST, id ASC) AS keep_id,
    ROW_NUMBER() OVER (PARTITION BY store_id, name_key ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
  FROM keyed
  WHERE length(name_key) >= 3
    AND name_key NOT IN ('walk-in customer', 'walk in customer', 'valued guest', 'guest', 'customer')
), aliases AS (
  SELECT id AS old_id, keep_id AS new_id
  FROM ranked
  WHERE rn > 1 AND id <> keep_id
)
UPDATE public.orders o
SET customer_id = a.new_id
FROM aliases a
WHERE o.customer_id = a.old_id;

WITH keyed AS (
  SELECT
    id,
    store_id,
    lower(regexp_replace(btrim(COALESCE(name, '')), '\s+', ' ', 'g')) AS name_key,
    created_at
  FROM public.pos_customers
), ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (PARTITION BY store_id, name_key ORDER BY created_at ASC NULLS LAST, id ASC) AS keep_id,
    ROW_NUMBER() OVER (PARTITION BY store_id, name_key ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
  FROM keyed
  WHERE length(name_key) >= 3
    AND name_key NOT IN ('walk-in customer', 'walk in customer', 'valued guest', 'guest', 'customer')
), aliases AS (
  SELECT id AS old_id, keep_id AS new_id
  FROM ranked
  WHERE rn > 1 AND id <> keep_id
)
UPDATE public.credit_ledger cl
SET customer_id = a.new_id
FROM aliases a
WHERE cl.customer_id = a.old_id;

WITH keyed AS (
  SELECT
    id,
    store_id,
    lower(regexp_replace(btrim(COALESCE(name, '')), '\s+', ' ', 'g')) AS name_key,
    created_at
  FROM public.pos_customers
), ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY store_id, name_key ORDER BY created_at ASC NULLS LAST, id ASC) AS rn
  FROM keyed
  WHERE length(name_key) >= 3
    AND name_key NOT IN ('walk-in customer', 'walk in customer', 'valued guest', 'guest', 'customer')
)
DELETE FROM public.pos_customers pc
USING ranked r
WHERE pc.id = r.id AND r.rn > 1;

DROP INDEX IF EXISTS public.pos_customers_store_phone_normalized_uniq;
DROP INDEX IF EXISTS public.pos_customers_store_name_normalized_uniq;

CREATE UNIQUE INDEX pos_customers_store_phone_normalized_uniq
ON public.pos_customers (
  store_id,
  (NULLIF(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), ''))
)
WHERE NULLIF(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '') IS NOT NULL;

CREATE UNIQUE INDEX pos_customers_store_name_normalized_uniq
ON public.pos_customers (
  store_id,
  (lower(regexp_replace(btrim(COALESCE(name, '')), '\s+', ' ', 'g')))
)
WHERE length(lower(regexp_replace(btrim(COALESCE(name, '')), '\s+', ' ', 'g'))) >= 3
  AND lower(regexp_replace(btrim(COALESCE(name, '')), '\s+', ' ', 'g')) NOT IN ('walk-in customer', 'walk in customer', 'valued guest', 'guest', 'customer');