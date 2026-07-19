
-- =========================================================
-- Phase 3 Enterprise Inventory Module
-- =========================================================

-- ENUMS
DO $$ BEGIN
  CREATE TYPE public.warehouse_type AS ENUM ('RAW_MATERIAL','FINISHED_GOODS','KITCHEN','CENTRAL','STORE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.warehouse_transfer_status AS ENUM ('REQUESTED','APPROVED','DISPATCHED','RECEIVED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.batch_status AS ENUM ('ACTIVE','EXPIRED','QUARANTINE','DEPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.serial_status AS ENUM ('IN_STOCK','SOLD','RETURNED','DAMAGED','TRANSFERRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.stock_take_status AS ENUM ('DRAFT','IN_PROGRESS','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cycle_count_frequency AS ENUM ('DAILY','WEEKLY','MONTHLY','QUARTERLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wastage_reason AS ENUM ('DAMAGE','EXPIRED','SPILLAGE','THEFT','QUALITY','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reservation_type AS ENUM ('CUSTOMER_ORDER','KITCHEN_ORDER','ONLINE_ORDER','TRANSFER','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reservation_status AS ENUM ('ACTIVE','FULFILLED','RELEASED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.grn_status AS ENUM ('DRAFT','PARTIAL','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.purchase_return_status AS ENUM ('DRAFT','APPROVED','DISPATCHED','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.rfq_status AS ENUM ('DRAFT','SENT','RESPONDED','AWARDED','CLOSED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Helper: standard merchant-scoped RLS policy generator via inline predicate
-- We reuse public.user_in_merchant(_user_id, _merchant_id) and has_role().

-- =========================================================
-- 1. warehouses
-- =========================================================
CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT,
  type public.warehouse_type NOT NULL DEFAULT 'STORE',
  capacity NUMERIC,
  manager_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.warehouses(merchant_id);
CREATE INDEX ON public.warehouses(store_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouses_merchant_access" ON public.warehouses FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

-- =========================================================
-- 2. warehouse_stock
-- =========================================================
CREATE TABLE public.warehouse_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  value NUMERIC NOT NULL DEFAULT 0,
  min_stock NUMERIC NOT NULL DEFAULT 0,
  max_stock NUMERIC,
  safety_stock NUMERIC NOT NULL DEFAULT 0,
  bin_location_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, item_id)
);
CREATE INDEX ON public.warehouse_stock(item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_stock TO authenticated;
GRANT ALL ON public.warehouse_stock TO service_role;
ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouse_stock_via_warehouse" ON public.warehouse_stock FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = warehouse_id
    AND (public.user_in_merchant(auth.uid(), w.merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = warehouse_id
    AND (public.user_in_merchant(auth.uid(), w.merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))));

-- =========================================================
-- 3. warehouse_transfers
-- =========================================================
CREATE TABLE public.warehouse_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  transfer_number TEXT,
  source_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  dest_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status public.warehouse_transfer_status NOT NULL DEFAULT 'REQUESTED',
  requested_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  dispatched_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  received_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.warehouse_transfers(merchant_id);
CREATE INDEX ON public.warehouse_transfers(source_warehouse_id);
CREATE INDEX ON public.warehouse_transfers(dest_warehouse_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_transfers TO authenticated;
GRANT ALL ON public.warehouse_transfers TO service_role;
ALTER TABLE public.warehouse_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouse_transfers_merchant" ON public.warehouse_transfers FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

-- =========================================================
-- 4. warehouse_transfer_items
-- =========================================================
CREATE TABLE public.warehouse_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES public.warehouse_transfers(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  requested_qty NUMERIC NOT NULL DEFAULT 0,
  approved_qty NUMERIC NOT NULL DEFAULT 0,
  transferred_qty NUMERIC NOT NULL DEFAULT 0,
  received_qty NUMERIC NOT NULL DEFAULT 0,
  pending_qty NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.warehouse_transfer_items(transfer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_transfer_items TO authenticated;
GRANT ALL ON public.warehouse_transfer_items TO service_role;
ALTER TABLE public.warehouse_transfer_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wti_via_transfer" ON public.warehouse_transfer_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.warehouse_transfers t WHERE t.id = transfer_id
    AND (public.user_in_merchant(auth.uid(), t.merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.warehouse_transfers t WHERE t.id = transfer_id
    AND (public.user_in_merchant(auth.uid(), t.merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))));

-- =========================================================
-- 5. batch_master
-- =========================================================
CREATE TABLE public.batch_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  item_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_batch TEXT,
  mfg_date DATE,
  expiry_date DATE,
  cost NUMERIC NOT NULL DEFAULT 0,
  quantity NUMERIC NOT NULL DEFAULT 0,
  remaining_qty NUMERIC NOT NULL DEFAULT 0,
  status public.batch_status NOT NULL DEFAULT 'ACTIVE',
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, batch_number, item_id)
);
CREATE INDEX ON public.batch_master(merchant_id);
CREATE INDEX ON public.batch_master(item_id);
CREATE INDEX ON public.batch_master(expiry_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_master TO authenticated;
GRANT ALL ON public.batch_master TO service_role;
ALTER TABLE public.batch_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batch_master_merchant" ON public.batch_master FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

-- =========================================================
-- 6. serial_numbers
-- =========================================================
CREATE TABLE public.serial_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL,
  item_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.batch_master(id) ON DELETE SET NULL,
  status public.serial_status NOT NULL DEFAULT 'IN_STOCK',
  current_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  current_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  current_owner_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, serial_number)
);
CREATE INDEX ON public.serial_numbers(item_id);
CREATE INDEX ON public.serial_numbers(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.serial_numbers TO authenticated;
GRANT ALL ON public.serial_numbers TO service_role;
ALTER TABLE public.serial_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "serial_numbers_merchant" ON public.serial_numbers FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

-- =========================================================
-- 7. bin_locations
-- =========================================================
CREATE TABLE public.bin_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  zone TEXT,
  rack TEXT,
  shelf TEXT,
  bin TEXT NOT NULL,
  capacity NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, zone, rack, shelf, bin)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bin_locations TO authenticated;
GRANT ALL ON public.bin_locations TO service_role;
ALTER TABLE public.bin_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bin_locations_via_warehouse" ON public.bin_locations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = warehouse_id
    AND (public.user_in_merchant(auth.uid(), w.merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = warehouse_id
    AND (public.user_in_merchant(auth.uid(), w.merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))));

-- =========================================================
-- 8. stock_takes & stock_take_items
-- =========================================================
CREATE TABLE public.stock_takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  reference TEXT,
  status public.stock_take_status NOT NULL DEFAULT 'DRAFT',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  conducted_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_takes TO authenticated;
GRANT ALL ON public.stock_takes TO service_role;
ALTER TABLE public.stock_takes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_takes_merchant" ON public.stock_takes FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.stock_take_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_take_id UUID NOT NULL REFERENCES public.stock_takes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  system_qty NUMERIC NOT NULL DEFAULT 0,
  physical_qty NUMERIC NOT NULL DEFAULT 0,
  variance NUMERIC NOT NULL DEFAULT 0,
  variance_value NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.stock_take_items(stock_take_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_take_items TO authenticated;
GRANT ALL ON public.stock_take_items TO service_role;
ALTER TABLE public.stock_take_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_take_items_via_parent" ON public.stock_take_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stock_takes s WHERE s.id = stock_take_id
    AND (public.user_in_merchant(auth.uid(), s.merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stock_takes s WHERE s.id = stock_take_id
    AND (public.user_in_merchant(auth.uid(), s.merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))));

-- =========================================================
-- 9. cycle_counts
-- =========================================================
CREATE TABLE public.cycle_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  item_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  frequency public.cycle_count_frequency NOT NULL DEFAULT 'WEEKLY',
  scheduled_date DATE,
  counted_at TIMESTAMPTZ,
  counted_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  system_qty NUMERIC NOT NULL DEFAULT 0,
  counted_qty NUMERIC NOT NULL DEFAULT 0,
  variance NUMERIC NOT NULL DEFAULT 0,
  variance_value NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.cycle_counts(merchant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cycle_counts TO authenticated;
GRANT ALL ON public.cycle_counts TO service_role;
ALTER TABLE public.cycle_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cycle_counts_merchant" ON public.cycle_counts FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

-- =========================================================
-- 10. wastage
-- =========================================================
CREATE TABLE public.wastage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES public.batch_master(id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  value NUMERIC NOT NULL DEFAULT 0,
  reason public.wastage_reason NOT NULL DEFAULT 'DAMAGE',
  notes TEXT,
  reported_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.wastage(merchant_id);
CREATE INDEX ON public.wastage(item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wastage TO authenticated;
GRANT ALL ON public.wastage TO service_role;
ALTER TABLE public.wastage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wastage_merchant" ON public.wastage FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

-- =========================================================
-- 11. purchase_returns & items
-- =========================================================
CREATE TABLE public.purchase_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  return_number TEXT,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  status public.purchase_return_status NOT NULL DEFAULT 'DRAFT',
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.purchase_returns(merchant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_returns TO authenticated;
GRANT ALL ON public.purchase_returns TO service_role;
ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_returns_merchant" ON public.purchase_returns FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.purchase_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_return_id UUID NOT NULL REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES public.batch_master(id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.purchase_return_items(purchase_return_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_return_items TO authenticated;
GRANT ALL ON public.purchase_return_items TO service_role;
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pri_via_parent" ON public.purchase_return_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_returns p WHERE p.id = purchase_return_id
    AND (public.user_in_merchant(auth.uid(), p.merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_returns p WHERE p.id = purchase_return_id
    AND (public.user_in_merchant(auth.uid(), p.merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))));

-- =========================================================
-- 12. goods_received_notes & grn_items
-- =========================================================
CREATE TABLE public.goods_received_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  grn_number TEXT,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  status public.grn_status NOT NULL DEFAULT 'DRAFT',
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  invoice_number TEXT,
  invoice_date DATE,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.goods_received_notes(merchant_id);
CREATE INDEX ON public.goods_received_notes(purchase_order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_received_notes TO authenticated;
GRANT ALL ON public.goods_received_notes TO service_role;
ALTER TABLE public.goods_received_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grn_merchant" ON public.goods_received_notes FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.grn_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id UUID NOT NULL REFERENCES public.goods_received_notes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES public.batch_master(id) ON DELETE SET NULL,
  ordered_qty NUMERIC NOT NULL DEFAULT 0,
  received_qty NUMERIC NOT NULL DEFAULT 0,
  pending_qty NUMERIC NOT NULL DEFAULT 0,
  rejected_qty NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.grn_items(grn_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grn_items TO authenticated;
GRANT ALL ON public.grn_items TO service_role;
ALTER TABLE public.grn_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grn_items_via_parent" ON public.grn_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.goods_received_notes g WHERE g.id = grn_id
    AND (public.user_in_merchant(auth.uid(), g.merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.goods_received_notes g WHERE g.id = grn_id
    AND (public.user_in_merchant(auth.uid(), g.merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))));

-- =========================================================
-- 13. vendor_performance
-- =========================================================
CREATE TABLE public.vendor_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  period_start DATE,
  period_end DATE,
  total_orders INT NOT NULL DEFAULT 0,
  on_time_deliveries INT NOT NULL DEFAULT 0,
  late_deliveries INT NOT NULL DEFAULT 0,
  delivery_score NUMERIC NOT NULL DEFAULT 0,
  quality_score NUMERIC NOT NULL DEFAULT 0,
  rejection_percent NUMERIC NOT NULL DEFAULT 0,
  avg_lead_time_days NUMERIC NOT NULL DEFAULT 0,
  total_spend NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.vendor_performance(merchant_id);
CREATE INDEX ON public.vendor_performance(supplier_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_performance TO authenticated;
GRANT ALL ON public.vendor_performance TO service_role;
ALTER TABLE public.vendor_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendor_performance_merchant" ON public.vendor_performance FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

-- =========================================================
-- 14. rfq & rfq_items
-- =========================================================
CREATE TABLE public.rfq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  rfq_number TEXT,
  title TEXT,
  status public.rfq_status NOT NULL DEFAULT 'DRAFT',
  requested_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  issue_date DATE,
  response_deadline DATE,
  supplier_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  awarded_supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfq TO authenticated;
GRANT ALL ON public.rfq TO service_role;
ALTER TABLE public.rfq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rfq_merchant" ON public.rfq FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.rfq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES public.rfq(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL DEFAULT 0,
  target_price NUMERIC,
  quoted_prices JSONB NOT NULL DEFAULT '{}'::jsonb,
  awarded_price NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.rfq_items(rfq_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfq_items TO authenticated;
GRANT ALL ON public.rfq_items TO service_role;
ALTER TABLE public.rfq_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rfq_items_via_parent" ON public.rfq_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rfq r WHERE r.id = rfq_id
    AND (public.user_in_merchant(auth.uid(), r.merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rfq r WHERE r.id = rfq_id
    AND (public.user_in_merchant(auth.uid(), r.merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))));

-- =========================================================
-- 15. landed_costs
-- =========================================================
CREATE TABLE public.landed_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  grn_id UUID REFERENCES public.goods_received_notes(id) ON DELETE CASCADE,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  freight NUMERIC NOT NULL DEFAULT 0,
  insurance NUMERIC NOT NULL DEFAULT 0,
  custom_duty NUMERIC NOT NULL DEFAULT 0,
  handling NUMERIC NOT NULL DEFAULT 0,
  other_charges NUMERIC NOT NULL DEFAULT 0,
  total_landed NUMERIC NOT NULL DEFAULT 0,
  allocation_method TEXT NOT NULL DEFAULT 'BY_VALUE',
  allocation JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.landed_costs(merchant_id);
CREATE INDEX ON public.landed_costs(grn_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landed_costs TO authenticated;
GRANT ALL ON public.landed_costs TO service_role;
ALTER TABLE public.landed_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "landed_costs_merchant" ON public.landed_costs FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

-- =========================================================
-- 16. inventory_reservations
-- =========================================================
CREATE TABLE public.inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES public.batch_master(id) ON DELETE SET NULL,
  reservation_type public.reservation_type NOT NULL DEFAULT 'CUSTOMER_ORDER',
  reference_id UUID,
  reference_number TEXT,
  quantity NUMERIC NOT NULL DEFAULT 0,
  status public.reservation_status NOT NULL DEFAULT 'ACTIVE',
  reserved_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.inventory_reservations(merchant_id);
CREATE INDEX ON public.inventory_reservations(item_id);
CREATE INDEX ON public.inventory_reservations(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_reservations TO authenticated;
GRANT ALL ON public.inventory_reservations TO service_role;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_reservations_merchant" ON public.inventory_reservations FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));

-- =========================================================
-- updated_at triggers
-- =========================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'warehouses','warehouse_stock','warehouse_transfers','warehouse_transfer_items',
    'batch_master','serial_numbers','bin_locations','stock_takes','stock_take_items',
    'cycle_counts','wastage','purchase_returns','purchase_return_items',
    'goods_received_notes','grn_items','vendor_performance','rfq','rfq_items',
    'landed_costs','inventory_reservations'
  ]
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();', t, t);
  END LOOP;
END $$;

-- Link bin_locations FK on warehouse_stock (deferred because bin_locations created after)
ALTER TABLE public.warehouse_stock
  ADD CONSTRAINT warehouse_stock_bin_fk
  FOREIGN KEY (bin_location_id) REFERENCES public.bin_locations(id) ON DELETE SET NULL;
