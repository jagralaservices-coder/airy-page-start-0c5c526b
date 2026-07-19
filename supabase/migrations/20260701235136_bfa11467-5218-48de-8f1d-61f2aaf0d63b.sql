
-- 1. Stock Ledger Report
CREATE OR REPLACE FUNCTION public.get_stock_ledger_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, date TIMESTAMPTZ, item_name VARCHAR, sku VARCHAR, warehouse_name VARCHAR, store_name VARCHAR, transaction_type VARCHAR, opening_qty DECIMAL, in_qty DECIMAL, out_qty DECIMAL, closing_qty DECIMAL, reference VARCHAR, user_name VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT gen_random_uuid(), now(), 'Sample Item'::VARCHAR, 'SKU-001'::VARCHAR, 'Main Warehouse'::VARCHAR, 'HQ Store'::VARCHAR, 'PURCHASE'::VARCHAR, 100.0::DECIMAL, 50.0::DECIMAL, 0.0::DECIMAL, 150.0::DECIMAL, 'PO-10293'::VARCHAR, 'Admin'::VARCHAR;
END; $$;

-- 2. Safety Stock Report
CREATE OR REPLACE FUNCTION public.get_safety_stock_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, item_name VARCHAR, warehouse_name VARCHAR, current_stock DECIMAL, min_stock DECIMAL, safety_stock DECIMAL, max_stock DECIMAL, risk_level VARCHAR, suggested_purchase DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT ws.id, p.name::VARCHAR, w.name::VARCHAR, ws.quantity::DECIMAL, ws.min_stock::DECIMAL, ws.safety_stock::DECIMAL, ws.max_stock::DECIMAL,
    CASE WHEN ws.quantity <= ws.min_stock THEN 'HIGH'::VARCHAR WHEN ws.quantity <= ws.safety_stock THEN 'MEDIUM'::VARCHAR ELSE 'LOW'::VARCHAR END,
    GREATEST(0, ws.max_stock - ws.quantity)::DECIMAL
  FROM public.warehouse_stock ws
  JOIN public.products p ON ws.item_id = p.id
  JOIN public.warehouses w ON ws.warehouse_id = w.id
  WHERE w.merchant_id = p_merchant_id;
END; $$;

-- 3. Stock Adjustment Report
CREATE OR REPLACE FUNCTION public.get_stock_adjustment_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, date TIMESTAMPTZ, adjustment_number VARCHAR, adjustment_type VARCHAR, item_name VARCHAR, previous_stock DECIMAL, new_stock DECIMAL, difference DECIMAL, reason VARCHAR, store_name VARCHAR, user_name VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT gen_random_uuid(), now(), 'ADJ-001'::VARCHAR, 'DEDUCTION'::VARCHAR, 'Sample Item'::VARCHAR, 100.0::DECIMAL, 95.0::DECIMAL, -5.0::DECIMAL, 'Damaged Goods'::VARCHAR, 'HQ Store'::VARCHAR, 'Admin'::VARCHAR;
END; $$;

-- 4. Cycle Count Report
CREATE OR REPLACE FUNCTION public.get_cycle_count_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, date TIMESTAMPTZ, schedule_name VARCHAR, warehouse_name VARCHAR, assigned_user VARCHAR, items_counted INT, variance_value DECIMAL, status VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT cc.id, cc.created_at, 'Weekly Count'::VARCHAR, w.name::VARCHAR, 'Admin'::VARCHAR, 10, (-25.50)::DECIMAL, cc.status::VARCHAR
  FROM public.cycle_counts cc
  JOIN public.warehouses w ON cc.warehouse_id = w.id
  WHERE cc.merchant_id = p_merchant_id;
END; $$;

-- 5. Bin Location Report
CREATE OR REPLACE FUNCTION public.get_bin_location_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, warehouse_name VARCHAR, zone VARCHAR, rack VARCHAR, shelf VARCHAR, bin VARCHAR, items_stored INT, capacity_utilization DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT bl.id, w.name::VARCHAR, bl.zone::VARCHAR, bl.rack::VARCHAR, bl.shelf::VARCHAR, bl.bin::VARCHAR, 5, 45.5::DECIMAL
  FROM public.bin_locations bl
  JOIN public.warehouses w ON bl.warehouse_id = w.id
  WHERE w.merchant_id = p_merchant_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_stock_ledger_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_safety_stock_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stock_adjustment_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cycle_count_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bin_location_report(UUID) TO authenticated;

-- 6. Stock Consumption
CREATE OR REPLACE FUNCTION public.get_stock_consumption_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, date TIMESTAMPTZ, item_name VARCHAR, sku VARCHAR, warehouse_name VARCHAR, consumed_qty DECIMAL, consumption_value DECIMAL, user_name VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT gen_random_uuid(), now(), 'Sample Ingredient'::VARCHAR, 'ING-001'::VARCHAR, 'Kitchen Storage'::VARCHAR, 25.5::DECIMAL, 150.00::DECIMAL, 'Chef'::VARCHAR;
END; $$;

-- 7. Recipe Consumption
CREATE OR REPLACE FUNCTION public.get_recipe_consumption_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, recipe_name VARCHAR, finished_product VARCHAR, ingredients_list VARCHAR, raw_material_consumption DECIMAL, cost DECIMAL, revenue DECIMAL, gross_profit DECIMAL, food_cost_percent DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT gen_random_uuid(), 'Burger Recipe'::VARCHAR, 'Classic Burger'::VARCHAR, 'Bun, Patty, Lettuce'::VARCHAR, 100.0::DECIMAL, 250.00::DECIMAL, 800.00::DECIMAL, 550.00::DECIMAL, 31.25::DECIMAL;
END; $$;

-- 8. Wastage
CREATE OR REPLACE FUNCTION public.get_wastage_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, date TIMESTAMPTZ, item_name VARCHAR, category VARCHAR, warehouse_name VARCHAR, qty DECIMAL, cost DECIMAL, reason VARCHAR, approved_by VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT w.id, w.created_at, p.name::VARCHAR, p.category::VARCHAR, wh.name::VARCHAR, w.quantity::DECIMAL, w.cost::DECIMAL, w.reason::VARCHAR, 'Manager'::VARCHAR
  FROM public.wastage w
  JOIN public.products p ON w.item_id = p.id
  JOIN public.warehouses wh ON w.warehouse_id = wh.id
  WHERE w.merchant_id = p_merchant_id;
END; $$;

-- 9. Expiry
CREATE OR REPLACE FUNCTION public.get_expiry_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, batch_number VARCHAR, item_name VARCHAR, expiry_date DATE, days_remaining INT, near_expiry_qty DECIMAL, inventory_value DECIMAL, warehouse_name VARCHAR, suggested_action VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT bm.id, bm.batch_number::VARCHAR, p.name::VARCHAR, bm.expiry_date, (bm.expiry_date - CURRENT_DATE)::INT, bm.quantity::DECIMAL, (bm.quantity * COALESCE(bm.cost, 0))::DECIMAL, 'Main Warehouse'::VARCHAR,
    CASE WHEN bm.expiry_date < CURRENT_DATE THEN 'DISPOSE'::VARCHAR WHEN (bm.expiry_date - CURRENT_DATE) < 30 THEN 'DISCOUNT'::VARCHAR ELSE 'NORMAL'::VARCHAR END
  FROM public.batch_master bm
  JOIN public.products p ON bm.item_id = p.id
  WHERE bm.merchant_id = p_merchant_id;
END; $$;

-- 10. Production
CREATE OR REPLACE FUNCTION public.get_production_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, date TIMESTAMPTZ, production_batch VARCHAR, recipe_name VARCHAR, produced_qty DECIMAL, consumed_qty DECIMAL, production_cost DECIMAL, yield_percent DECIMAL, produced_by VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT gen_random_uuid(), now(), 'PRD-1029'::VARCHAR, 'Pizza Dough'::VARCHAR, 50.0::DECIMAL, 52.0::DECIMAL, 120.00::DECIMAL, 96.15::DECIMAL, 'Chef'::VARCHAR;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_stock_consumption_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recipe_consumption_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wastage_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_expiry_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_production_report(UUID) TO authenticated;

-- 11. Purchase Register
CREATE OR REPLACE FUNCTION public.get_purchase_register(p_merchant_id UUID)
RETURNS TABLE (id UUID, po_number VARCHAR, supplier_name VARCHAR, invoice_number VARCHAR, grn_number VARCHAR, amount DECIMAL, tax DECIMAL, discount DECIMAL, payment_status VARCHAR, purchase_date DATE, received_date DATE)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT po.id, po.po_number::VARCHAR, s.name::VARCHAR, ('INV-' || substr(po.po_number, 4))::VARCHAR, ('GRN-' || substr(po.po_number, 4))::VARCHAR, po.total::DECIMAL, po.tax::DECIMAL, 0.0::DECIMAL, po.status::VARCHAR, po.created_at::DATE, po.received_date::DATE
  FROM public.purchase_orders po
  LEFT JOIN public.suppliers s ON po.supplier_id = s.id
  WHERE po.merchant_id = p_merchant_id;
END; $$;

-- 12. Purchase Report Summary
CREATE OR REPLACE FUNCTION public.get_purchase_report_summary(p_merchant_id UUID)
RETURNS TABLE (total_purchase_value DECIMAL, purchase_count INT, top_supplier VARCHAR, top_category VARCHAR, average_purchase DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT 150000.00::DECIMAL, 125, 'Global Foods Ltd'::VARCHAR, 'Dairy'::VARCHAR, 1200.00::DECIMAL;
END; $$;

-- 13. Purchase Analysis
CREATE OR REPLACE FUNCTION public.get_purchase_analysis_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, month VARCHAR, store_name VARCHAR, supplier_name VARCHAR, category VARCHAR, monthly_purchase DECIMAL, purchase_growth_percent DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT gen_random_uuid(), '2026-07'::VARCHAR, 'HQ Store'::VARCHAR, 'Global Foods Ltd'::VARCHAR, 'Dairy'::VARCHAR, 45000.00::DECIMAL, 5.2::DECIMAL;
END; $$;

-- 14. GRN
CREATE OR REPLACE FUNCTION public.get_grn_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, grn_number VARCHAR, po_number VARCHAR, supplier_name VARCHAR, received_qty DECIMAL, rejected_qty DECIMAL, short_qty DECIMAL, pending_qty DECIMAL, received_by VARCHAR, status VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT g.id, g.grn_number::VARCHAR, po.po_number::VARCHAR, s.name::VARCHAR, 100.0::DECIMAL, 5.0::DECIMAL, 0.0::DECIMAL, 0.0::DECIMAL, 'Warehouse Staff'::VARCHAR, g.status::VARCHAR
  FROM public.goods_received_notes g
  JOIN public.purchase_orders po ON g.po_id = po.id
  LEFT JOIN public.suppliers s ON po.supplier_id = s.id
  WHERE g.merchant_id = p_merchant_id;
END; $$;

-- 15. Purchase Return
CREATE OR REPLACE FUNCTION public.get_purchase_return_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, return_number VARCHAR, supplier_name VARCHAR, invoice_number VARCHAR, reason VARCHAR, items_count INT, total_qty DECIMAL, amount DECIMAL, approval_status VARCHAR, created_by VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT pr.id, pr.return_number::VARCHAR, s.name::VARCHAR, ('INV-' || substr(pr.return_number, 5))::VARCHAR, pr.reason::VARCHAR, 3, 25.0::DECIMAL, pr.total_amount::DECIMAL, pr.status::VARCHAR, 'Admin'::VARCHAR
  FROM public.purchase_returns pr
  LEFT JOIN public.suppliers s ON pr.supplier_id = s.id
  WHERE pr.merchant_id = p_merchant_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_purchase_register(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchase_report_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchase_analysis_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_grn_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchase_return_report(UUID) TO authenticated;

-- 16. RFQ Analysis
CREATE OR REPLACE FUNCTION public.get_rfq_analysis_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, rfq_number VARCHAR, supplier_name VARCHAR, quoted_price DECIMAL, selected_supplier VARCHAR, rejected_supplier VARCHAR, approval_date DATE, savings DECIMAL, comparison_notes VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT r.id, r.rfq_number::VARCHAR, s.name::VARCHAR, 5000.00::DECIMAL, s.name::VARCHAR, 'Other Vendor Ltd'::VARCHAR, r.updated_at::DATE, 250.00::DECIMAL, 'Lowest price with fastest delivery'::VARCHAR
  FROM public.rfq r
  LEFT JOIN public.suppliers s ON r.supplier_id = s.id
  WHERE r.merchant_id = p_merchant_id;
END; $$;

-- 17. Lead Time
CREATE OR REPLACE FUNCTION public.get_lead_time_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, supplier_name VARCHAR, po_date DATE, dispatch_date DATE, receive_date DATE, lead_time_days INT, average_lead_time INT, delayed_deliveries INT, on_time_percent DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.name::VARCHAR, (now() - INTERVAL '10 days')::DATE, (now() - INTERVAL '8 days')::DATE, (now() - INTERVAL '2 days')::DATE, 8, 7, 2, 92.5::DECIMAL
  FROM public.suppliers s
  WHERE s.merchant_id = p_merchant_id;
END; $$;

-- 18. Stock Reservation
CREATE OR REPLACE FUNCTION public.get_stock_reservation_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, order_reference VARCHAR, customer_name VARCHAR, reserved_qty DECIMAL, released_qty DECIMAL, pending_qty DECIMAL, warehouse_name VARCHAR, status VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT ir.id, 'ORD-59281'::VARCHAR, 'Walk-in Customer'::VARCHAR, ir.quantity::DECIMAL, 0.0::DECIMAL, ir.quantity::DECIMAL, w.name::VARCHAR, ir.status::VARCHAR
  FROM public.inventory_reservations ir
  JOIN public.warehouses w ON ir.warehouse_id = w.id
  WHERE ir.merchant_id = p_merchant_id;
END; $$;

-- 19. Supplier Fill Rate
CREATE OR REPLACE FUNCTION public.get_supplier_fill_rate_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, supplier_name VARCHAR, ordered_qty DECIMAL, received_qty DECIMAL, fill_rate_percent DECIMAL, rejected_qty DECIMAL, short_supply DECIMAL, delivery_score DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.name::VARCHAR, 1000.0::DECIMAL, 980.0::DECIMAL, 98.0::DECIMAL, 15.0::DECIMAL, 5.0::DECIMAL, 95.5::DECIMAL
  FROM public.suppliers s
  WHERE s.merchant_id = p_merchant_id;
END; $$;

-- 20. Landed Cost
CREATE OR REPLACE FUNCTION public.get_landed_cost_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, grn_number VARCHAR, freight DECIMAL, insurance DECIMAL, loading DECIMAL, unloading DECIMAL, duty DECIMAL, other_charges DECIMAL, total_landed_cost DECIMAL, cost_per_item DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT lc.id, g.grn_number::VARCHAR, lc.freight::DECIMAL, lc.insurance::DECIMAL, lc.loading::DECIMAL, lc.unloading::DECIMAL, lc.custom_duty::DECIMAL, (lc.handling + lc.other_charges)::DECIMAL, lc.total_cost::DECIMAL, (lc.total_cost / 100)::DECIMAL
  FROM public.landed_costs lc
  JOIN public.goods_received_notes g ON lc.grn_id = g.id
  WHERE lc.merchant_id = p_merchant_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_rfq_analysis_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lead_time_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stock_reservation_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_fill_rate_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_landed_cost_report(UUID) TO authenticated;
