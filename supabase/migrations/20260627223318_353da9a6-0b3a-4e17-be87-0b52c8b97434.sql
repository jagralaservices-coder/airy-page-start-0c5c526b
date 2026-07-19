
-- Align feature_catalog with brochure tiers
UPDATE public.feature_catalog SET included_in = ARRAY['basic','gold','platinum']::text[]
  WHERE feature_key IN ('kot_system','kot_print','kot_search','kot_listing','rpt_customers','rpt_payment');

UPDATE public.feature_catalog SET included_in = ARRAY['gold','platinum']::text[]
  WHERE feature_key = 'purchase_orders';

-- Normalize stale outlet/staff overrides so plan-based limits take effect
UPDATE public.merchant_subscription SET outlet_limit = CASE plan_name::text
  WHEN 'basic' THEN 1 WHEN 'gold' THEN 1 WHEN 'platinum' THEN 2 ELSE 1 END
  WHERE outlet_limit > 100 OR outlet_limit IS NULL;

UPDATE public.merchant_subscription SET staff_limit = CASE plan_name::text
  WHEN 'basic' THEN 2 WHEN 'gold' THEN 10 WHEN 'platinum' THEN 25 ELSE 2 END
  WHERE staff_limit > 100 OR staff_limit IS NULL;
