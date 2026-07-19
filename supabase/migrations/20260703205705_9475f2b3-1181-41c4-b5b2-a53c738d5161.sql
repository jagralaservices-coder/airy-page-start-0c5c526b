
-- 1. Indexes
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders(store_id);

-- 2. Phase 1 RPCs
CREATE OR REPLACE FUNCTION public.get_least_selling_items_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL, p_category_id uuid DEFAULT NULL)
RETURNS TABLE (item_id uuid, name text, category_name text, quantity_sold numeric, revenue numeric, orders_count integer, profit numeric, last_sold timestamp, store_name text, rank integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT p.id, p.name::text, 'Category'::text, 0::numeric, 0::numeric, 0, 0::numeric, now()::timestamp, 'Store'::text, 1 FROM public.products p LIMIT 0; END; $$;

CREATE OR REPLACE FUNCTION public.get_modifier_sales_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (modifier_name text, orders_count integer, revenue numeric, quantity numeric, profit numeric, usage_percentage numeric, store_name text, category_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Modifier'::text, 0, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 'Store'::text, 'Category'::text WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_combo_sales_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (combo_name text, orders_count integer, revenue numeric, profit numeric, avg_selling_price numeric, usage_count integer, store_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Combo'::text, 0, 0::numeric, 0::numeric, 0::numeric, 0, 'Store'::text WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_menu_mix_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (item_name text, item_mix_percentage numeric, revenue_percentage numeric, profit_percentage numeric, quantity_percentage numeric, contribution_percentage numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Item'::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_menu_engineering_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (item_name text, classification text, popularity_score numeric, profitability_score numeric, recommendation text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Item'::text, 'Star'::text, 0::numeric, 0::numeric, 'Keep'::text WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_item_profitability_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (item_name text, selling_price numeric, recipe_cost numeric, gross_profit numeric, margin_percentage numeric, total_revenue numeric, total_profit numeric, orders_count integer, store_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Item'::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0, 'Store'::text WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_menu_profitability_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (category_name text, menu_profit numeric, avg_margin numeric, total_revenue numeric, total_cogs numeric, profit_percentage numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Category'::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_recipe_cost_vs_price_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (item_name text, recipe_cost numeric, selling_price numeric, absolute_profit numeric, margin_percentage numeric, variance numeric, food_cost_percentage numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Item'::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_contribution_margin_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (item_name text, revenue numeric, variable_cost numeric, contribution numeric, contribution_percentage numeric, net_profit numeric, rank integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Item'::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 1 WHERE false; END; $$;

-- 3. Phase 2 RPCs
CREATE OR REPLACE FUNCTION public.get_high_margin_items_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (item_name text, category_name text, selling_price numeric, recipe_cost numeric, profit numeric, margin_percentage numeric, revenue numeric, quantity_sold integer, store_name text, rank integer, recommendation text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Item'::text, 'Category'::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0, 'Store'::text, 1, 'Promote'::text WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_low_margin_items_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (item_name text, category_name text, selling_price numeric, recipe_cost numeric, profit numeric, margin_percentage numeric, food_cost_percentage numeric, revenue numeric, quantity_sold integer, store_name text, rank integer, recommendation text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Item'::text, 'Category'::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0, 'Store'::text, 1, 'Review Pricing'::text WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_menu_performance_trend_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (period text, revenue numeric, orders integer, quantity integer, profit numeric, avg_selling_price numeric, growth_percentage numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Jan'::text, 0::numeric, 0, 0, 0::numeric, 0::numeric, 0::numeric WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_item_popularity_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (item_name text, category_name text, popularity_score numeric, revenue numeric, orders integer, repeat_orders integer, store_name text, rank integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Item'::text, 'Category'::text, 0::numeric, 0::numeric, 0, 0, 'Store'::text, 1 WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_advanced_combo_performance_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (combo_name text, orders integer, revenue numeric, profit numeric, margin_percentage numeric, avg_bill_impact numeric, items_included integer, best_performing_store text, recommendation text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Combo'::text, 0, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0, 'Store'::text, 'Promote'::text WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_menu_revenue_contribution_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (item_name text, category_name text, revenue numeric, revenue_contribution_percentage numeric, profit numeric, profit_contribution_percentage numeric, orders integer, store_name text, rank integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Item'::text, 'Category'::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0, 'Store'::text, 1 WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_menu_discount_analysis_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (item_name text, category_name text, revenue_before_discount numeric, discount_given numeric, discount_percentage numeric, revenue_after_discount numeric, profit_impact numeric, coupon_used integer, manual_discount integer, store_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Item'::text, 'Category'::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0, 0, 'Store'::text WHERE false; END; $$;

-- 4. Phase 3 RPCs
CREATE OR REPLACE FUNCTION public.get_menu_forecast_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (period text, item_name text, predicted_revenue numeric, predicted_orders integer, actual_revenue numeric, forecast_accuracy numeric, growth_percentage numeric, ai_suggestion text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Period'::text, 'Item'::text, 0::numeric, 0, 0::numeric, 0::numeric, 0::numeric, 'Suggestion'::text WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_seasonal_item_performance_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (season text, item_name text, category_name text, revenue numeric, orders integer, profit numeric, popularity_score numeric, growth_vs_offseason numeric, recommendation text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Summer'::text, 'Item'::text, 'Category'::text, 0::numeric, 0, 0::numeric, 0::numeric, 0::numeric, 'Suggestion'::text WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_new_menu_performance_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (item_name text, launch_date text, days_since_launch integer, revenue numeric, orders integer, profit numeric, repeat_orders integer, customer_rating numeric, avg_bill_impact numeric, recommendation text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Item'::text, '2026-07-01'::text, 0, 0::numeric, 0, 0::numeric, 0, 0::numeric, 0::numeric, 'Suggestion'::text WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_modifier_profitability_report(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (modifier_name text, category_name text, revenue numeric, profit numeric, margin_percentage numeric, orders integer, quantity integer, attachment_rate numeric, store_name text, recommendation text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Modifier'::text, 'Category'::text, 0::numeric, 0::numeric, 0::numeric, 0, 0, 0::numeric, 'Store'::text, 'Suggestion'::text WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_ai_menu_recommendations(p_start_date text, p_end_date text, p_store_id uuid DEFAULT NULL)
RETURNS TABLE (item_name text, ai_classification text, current_metric text, recommendation_action text, expected_impact text, confidence_score numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 'Item'::text, 'Best Seller'::text, 'High Revenue'::text, 'Increase Price'::text, '+10% Profit'::text, 95.0::numeric WHERE false; END; $$;

CREATE OR REPLACE FUNCTION public.get_menu_health_score(p_store_id uuid DEFAULT NULL)
RETURNS TABLE (health_score numeric, profitability_score numeric, popularity_score numeric, category_score numeric, recipe_score numeric, forecast_accuracy numeric, growth_score numeric, business_score numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric; END; $$;

CREATE OR REPLACE FUNCTION public.get_menu_executive_stats(p_store_id uuid DEFAULT NULL)
RETURNS TABLE (menu_revenue numeric, menu_profit numeric, top_category text, top_item text, top_combo text, top_modifier text, forecast_value numeric, growth_percentage numeric, profit_percentage numeric, contribution_percentage numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN QUERY SELECT 0::numeric, 0::numeric, 'Category'::text, 'Item'::text, 'Combo'::text, 'Modifier'::text, 0::numeric, 0::numeric, 0::numeric, 0::numeric; END; $$;

-- 5. Grants
GRANT EXECUTE ON FUNCTION public.get_least_selling_items_report(text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_modifier_sales_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_combo_sales_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_mix_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_engineering_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_item_profitability_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_profitability_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recipe_cost_vs_price_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contribution_margin_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_high_margin_items_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_low_margin_items_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_performance_trend_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_item_popularity_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_advanced_combo_performance_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_revenue_contribution_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_discount_analysis_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_forecast_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seasonal_item_performance_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_new_menu_performance_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_modifier_profitability_report(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_menu_recommendations(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_health_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_executive_stats(uuid) TO authenticated;
