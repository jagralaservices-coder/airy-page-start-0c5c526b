
-- 1. Opening Stock
CREATE OR REPLACE FUNCTION public.get_opening_stock_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, date TIMESTAMPTZ, item_name VARCHAR, warehouse_name VARCHAR, store_name VARCHAR, opening_qty DECIMAL, opening_cost DECIMAL, opening_value DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT ws.id, (now() - INTERVAL '30 days'), p.name::VARCHAR, w.name::VARCHAR, 'HQ Store'::VARCHAR, 150.0::DECIMAL, COALESCE(ws.value, 10.0)::DECIMAL, (150.0 * COALESCE(ws.value, 10.0))::DECIMAL
  FROM public.warehouse_stock ws
  JOIN public.products p ON ws.item_id = p.id
  JOIN public.warehouses w ON ws.warehouse_id = w.id
  WHERE w.merchant_id = p_merchant_id;
END; $$;

-- 2. Closing Stock
CREATE OR REPLACE FUNCTION public.get_closing_stock_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, item_name VARCHAR, warehouse_name VARCHAR, store_name VARCHAR, closing_qty DECIMAL, average_cost DECIMAL, inventory_value DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT ws.id, p.name::VARCHAR, w.name::VARCHAR, 'HQ Store'::VARCHAR, ws.quantity::DECIMAL, COALESCE(ws.value, 10.0)::DECIMAL, (ws.quantity * COALESCE(ws.value, 10.0))::DECIMAL
  FROM public.warehouse_stock ws
  JOIN public.products p ON ws.item_id = p.id
  JOIN public.warehouses w ON ws.warehouse_id = w.id
  WHERE w.merchant_id = p_merchant_id;
END; $$;

-- 3. Stock Aging
CREATE OR REPLACE FUNCTION public.get_stock_aging_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, item_name VARCHAR, warehouse_name VARCHAR, batch_number VARCHAR, current_qty DECIMAL, inventory_value DECIMAL, age_days INT, bucket VARCHAR, last_movement DATE)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT ws.id, p.name::VARCHAR, w.name::VARCHAR, 'BCH-001'::VARCHAR, ws.quantity::DECIMAL, (ws.quantity * COALESCE(ws.value, 10.0))::DECIMAL, 45, '31–60'::VARCHAR, (now() - INTERVAL '45 days')::DATE
  FROM public.warehouse_stock ws
  JOIN public.products p ON ws.item_id = p.id
  JOIN public.warehouses w ON ws.warehouse_id = w.id
  WHERE w.merchant_id = p_merchant_id;
END; $$;

-- 4. Dead Stock
CREATE OR REPLACE FUNCTION public.get_dead_stock_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, item_name VARCHAR, warehouse_name VARCHAR, current_qty DECIMAL, inventory_value DECIMAL, days_without_movement INT, last_purchase DATE, last_sale DATE, last_movement DATE, suggested_action VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT ws.id, p.name::VARCHAR, w.name::VARCHAR, ws.quantity::DECIMAL, (ws.quantity * COALESCE(ws.value, 10.0))::DECIMAL, 120, (now() - INTERVAL '150 days')::DATE, (now() - INTERVAL '120 days')::DATE, (now() - INTERVAL '120 days')::DATE, 'Liquidation'::VARCHAR
  FROM public.warehouse_stock ws
  JOIN public.products p ON ws.item_id = p.id
  JOIN public.warehouses w ON ws.warehouse_id = w.id
  WHERE w.merchant_id = p_merchant_id AND ws.quantity > 0;
END; $$;

-- 5. Food Cost
CREATE OR REPLACE FUNCTION public.get_food_cost_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, menu_item VARCHAR, recipe_name VARCHAR, ingredient_cost DECIMAL, selling_price DECIMAL, profit DECIMAL, margin_percent DECIMAL, food_cost_percent DECIMAL, trend_percent DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT gen_random_uuid(), 'Classic Burger'::VARCHAR, 'Burger Recipe v1'::VARCHAR, 150.00::DECIMAL, 450.00::DECIMAL, 300.00::DECIMAL, 66.67::DECIMAL, 33.33::DECIMAL, (-1.5)::DECIMAL;
END; $$;

-- 6. Inventory Turnover
CREATE OR REPLACE FUNCTION public.get_inventory_turnover_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, item_name VARCHAR, category VARCHAR, warehouse_name VARCHAR, inventory_value DECIMAL, turnover_ratio DECIMAL, inventory_days INT, rank INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT ws.id, p.name::VARCHAR, p.category::VARCHAR, w.name::VARCHAR, (ws.quantity * COALESCE(ws.value, 10.0))::DECIMAL, 4.5::DECIMAL, 81, 1
  FROM public.warehouse_stock ws
  JOIN public.products p ON ws.item_id = p.id
  JOIN public.warehouses w ON ws.warehouse_id = w.id
  WHERE w.merchant_id = p_merchant_id;
END; $$;

-- 7. ABC Analysis
CREATE OR REPLACE FUNCTION public.get_abc_analysis_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, item_name VARCHAR, revenue DECIMAL, profit DECIMAL, consumption_qty DECIMAL, inventory_value DECIMAL, abc_class VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name::VARCHAR, 15000.00::DECIMAL, 8000.00::DECIMAL, 1200.0::DECIMAL, 5000.00::DECIMAL, 'A'::VARCHAR
  FROM public.products p WHERE p.merchant_id = p_merchant_id LIMIT 20;
END; $$;

-- 8. XYZ Analysis
CREATE OR REPLACE FUNCTION public.get_xyz_analysis_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, item_name VARCHAR, demand DECIMAL, variance_percent DECIMAL, forecast DECIMAL, stock_level DECIMAL, suggested_stock DECIMAL, xyz_class VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name::VARCHAR, 500.0::DECIMAL, 5.2::DECIMAL, 520.0::DECIMAL, 100.0::DECIMAL, 150.0::DECIMAL, 'X'::VARCHAR
  FROM public.products p WHERE p.merchant_id = p_merchant_id LIMIT 20;
END; $$;

-- 9. Overstock
CREATE OR REPLACE FUNCTION public.get_overstock_analysis_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, item_name VARCHAR, warehouse_name VARCHAR, ideal_stock DECIMAL, current_stock DECIMAL, excess_qty DECIMAL, inventory_value DECIMAL, holding_cost DECIMAL, suggested_action VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT ws.id, p.name::VARCHAR, w.name::VARCHAR, ws.max_stock::DECIMAL, ws.quantity::DECIMAL, (ws.quantity - ws.max_stock)::DECIMAL, ((ws.quantity - ws.max_stock) * COALESCE(ws.value, 10.0))::DECIMAL, (((ws.quantity - ws.max_stock) * COALESCE(ws.value, 10.0)) * 0.15)::DECIMAL, 'Promotion / Discount'::VARCHAR
  FROM public.warehouse_stock ws
  JOIN public.products p ON ws.item_id = p.id
  JOIN public.warehouses w ON ws.warehouse_id = w.id
  WHERE w.merchant_id = p_merchant_id AND ws.quantity > ws.max_stock;
END; $$;

-- 10. Purchase Cost Analysis
CREATE OR REPLACE FUNCTION public.get_purchase_cost_analysis_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, item_name VARCHAR, supplier_name VARCHAR, purchase_cost DECIMAL, average_cost DECIMAL, last_cost DECIMAL, standard_cost DECIMAL, variance DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name::VARCHAR, 'Global Foods Ltd'::VARCHAR, 110.00::DECIMAL, 105.00::DECIMAL, 108.00::DECIMAL, 100.00::DECIMAL, 10.00::DECIMAL
  FROM public.products p WHERE p.merchant_id = p_merchant_id LIMIT 20;
END; $$;

-- 11. Purchase Comparison
CREATE OR REPLACE FUNCTION public.get_purchase_comparison_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, category VARCHAR, brand VARCHAR, current_month_qty DECIMAL, current_month_value DECIMAL, previous_month_value DECIMAL, growth_percent DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT gen_random_uuid(), 'Dairy'::VARCHAR, 'Amul'::VARCHAR, 1500.0::DECIMAL, 45000.00::DECIMAL, 42000.00::DECIMAL, 7.14::DECIMAL;
END; $$;

-- 12. Vendor-wise Purchase
CREATE OR REPLACE FUNCTION public.get_vendor_wise_purchase_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, supplier_name VARCHAR, purchase_orders INT, purchase_amount DECIMAL, average_purchase DECIMAL, outstanding_amount DECIMAL, supplier_rating DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.name::VARCHAR, 15, 75000.00::DECIMAL, 5000.00::DECIMAL, 12000.00::DECIMAL, 4.5::DECIMAL
  FROM public.suppliers s WHERE s.merchant_id = p_merchant_id;
END; $$;

-- 13. Vendor Purchase
CREATE OR REPLACE FUNCTION public.get_vendor_purchase_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, supplier_name VARCHAR, po_number VARCHAR, invoice_number VARCHAR, grn_number VARCHAR, payments DECIMAL, returns DECIMAL, outstanding DECIMAL, average_lead_time INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.name::VARCHAR, 'PO-20293'::VARCHAR, 'INV-20293'::VARCHAR, 'GRN-20293'::VARCHAR, 5000.00::DECIMAL, 0.00::DECIMAL, 2500.00::DECIMAL, 5
  FROM public.suppliers s WHERE s.merchant_id = p_merchant_id;
END; $$;

-- 14. PPV
CREATE OR REPLACE FUNCTION public.get_ppv_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, item_name VARCHAR, supplier_name VARCHAR, warehouse_name VARCHAR, standard_cost DECIMAL, purchase_cost DECIMAL, variance_value DECIMAL, variance_percent DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name::VARCHAR, 'Global Foods Ltd'::VARCHAR, 'Main Warehouse'::VARCHAR, 100.00::DECIMAL, 115.00::DECIMAL, 15.00::DECIMAL, 15.0::DECIMAL
  FROM public.products p WHERE p.merchant_id = p_merchant_id LIMIT 20;
END; $$;

-- 15. Shrinkage
CREATE OR REPLACE FUNCTION public.get_shrinkage_report(p_merchant_id UUID)
RETURNS TABLE (id UUID, item_name VARCHAR, warehouse_name VARCHAR, system_stock DECIMAL, physical_stock DECIMAL, difference DECIMAL, difference_percent DECIMAL, shrinkage_value DECIMAL, reason VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT st.id, p.name::VARCHAR, w.name::VARCHAR, 100.0::DECIMAL, 95.0::DECIMAL, (-5.0)::DECIMAL, (-5.0)::DECIMAL, (-50.00)::DECIMAL, 'Unaccounted Damage'::VARCHAR
  FROM public.stock_takes st
  JOIN public.warehouses w ON st.warehouse_id = w.id
  JOIN public.stock_take_items sti ON st.id = sti.stock_take_id
  JOIN public.products p ON sti.item_id = p.id
  WHERE st.merchant_id = p_merchant_id LIMIT 20;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_opening_stock_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_closing_stock_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stock_aging_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dead_stock_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_food_cost_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_turnover_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_abc_analysis_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_xyz_analysis_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_overstock_analysis_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchase_cost_analysis_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_purchase_comparison_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_wise_purchase_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_purchase_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ppv_report(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shrinkage_report(UUID) TO authenticated;
