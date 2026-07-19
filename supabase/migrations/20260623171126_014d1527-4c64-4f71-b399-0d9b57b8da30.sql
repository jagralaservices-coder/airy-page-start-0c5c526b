
-- ============================================================================
-- POS Customers (CRIT-2 resolution)
-- Dedicated walk-in customer directory, scoped per store.
-- Completely separate from public.customers (merchant onboarding registry).
-- ============================================================================
CREATE TABLE public.pos_customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  merchant_id     uuid,
  name            text NOT NULL,
  phone           text,
  email           text,
  address         text,
  city            text,
  state           text,
  pincode         text,
  credit_limit    numeric NOT NULL DEFAULT 0,
  credit_balance  numeric NOT NULL DEFAULT 0,
  notes           text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_customers TO authenticated;
GRANT ALL ON public.pos_customers TO service_role;

ALTER TABLE public.pos_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_customers_select" ON public.pos_customers
  FOR SELECT TO authenticated
  USING (public.can_manage_store(store_id));

CREATE POLICY "pos_customers_insert" ON public.pos_customers
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "pos_customers_update" ON public.pos_customers
  FOR UPDATE TO authenticated
  USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "pos_customers_delete" ON public.pos_customers
  FOR DELETE TO authenticated
  USING (public.can_manage_store(store_id));

-- Indexes for search + sync
CREATE INDEX pos_customers_store_idx          ON public.pos_customers(store_id);
CREATE INDEX pos_customers_store_name_idx     ON public.pos_customers(store_id, lower(name));
CREATE INDEX pos_customers_store_phone_idx    ON public.pos_customers(store_id, phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX pos_customers_store_phone_uniq
  ON public.pos_customers(store_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX pos_customers_version_idx
  ON public.pos_customers ((metadata->>'version_number'));

-- Phase 2.5 metadata triggers + updated_at
CREATE TRIGGER pos_customers_meta_insert
  BEFORE INSERT ON public.pos_customers
  FOR EACH ROW EXECUTE FUNCTION public.stamp_metadata_on_insert();

CREATE TRIGGER pos_customers_meta_update
  BEFORE UPDATE ON public.pos_customers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_metadata_versioning();

CREATE TRIGGER pos_customers_set_updated_at
  BEFORE UPDATE ON public.pos_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Realtime
ALTER TABLE public.pos_customers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_customers;

-- ============================================================================
-- Credit Ledger (CRIT-1 resolution)
-- One row per outstanding credit balance for a POS customer.
-- ============================================================================
CREATE TABLE public.credit_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES public.pos_customers(id) ON DELETE RESTRICT,
  order_id      uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  due_amount    numeric NOT NULL,
  paid_amount   numeric NOT NULL DEFAULT 0,
  status        text    NOT NULL DEFAULT 'open',
  due_date      date,
  notes         text,
  metadata      jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_ledger_status_chk CHECK (status IN ('open','partial','paid','void'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_ledger_select" ON public.credit_ledger
  FOR SELECT TO authenticated
  USING (public.can_manage_store(store_id));

CREATE POLICY "credit_ledger_insert" ON public.credit_ledger
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "credit_ledger_update" ON public.credit_ledger
  FOR UPDATE TO authenticated
  USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "credit_ledger_delete" ON public.credit_ledger
  FOR DELETE TO authenticated
  USING (public.can_manage_store(store_id));

CREATE INDEX credit_ledger_store_customer_idx ON public.credit_ledger(store_id, customer_id);
CREATE INDEX credit_ledger_store_status_idx   ON public.credit_ledger(store_id, status);
CREATE INDEX credit_ledger_store_due_idx      ON public.credit_ledger(store_id, due_date);
CREATE INDEX credit_ledger_order_idx          ON public.credit_ledger(order_id);
CREATE INDEX credit_ledger_version_idx
  ON public.credit_ledger ((metadata->>'version_number'));

CREATE TRIGGER credit_ledger_meta_insert
  BEFORE INSERT ON public.credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.stamp_metadata_on_insert();

CREATE TRIGGER credit_ledger_meta_update
  BEFORE UPDATE ON public.credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.enforce_metadata_versioning();

CREATE TRIGGER credit_ledger_set_updated_at
  BEFORE UPDATE ON public.credit_ledger
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.credit_ledger REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_ledger;

-- ============================================================================
-- Credit Payments (CRIT-1 resolution)
-- One row per repayment against a credit_ledger entry.
-- ============================================================================
CREATE TABLE public.credit_payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  credit_ledger_id  uuid NOT NULL REFERENCES public.credit_ledger(id) ON DELETE CASCADE,
  amount            numeric NOT NULL,
  payment_method    text NOT NULL,
  reference         text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_payments TO authenticated;
GRANT ALL ON public.credit_payments TO service_role;

ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_payments_select" ON public.credit_payments
  FOR SELECT TO authenticated
  USING (public.can_manage_store(store_id));

CREATE POLICY "credit_payments_insert" ON public.credit_payments
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "credit_payments_update" ON public.credit_payments
  FOR UPDATE TO authenticated
  USING (public.can_manage_store(store_id))
  WITH CHECK (public.can_manage_store(store_id));

CREATE POLICY "credit_payments_delete" ON public.credit_payments
  FOR DELETE TO authenticated
  USING (public.can_manage_store(store_id));

CREATE INDEX credit_payments_ledger_idx    ON public.credit_payments(credit_ledger_id);
CREATE INDEX credit_payments_store_created ON public.credit_payments(store_id, created_at DESC);
CREATE INDEX credit_payments_version_idx
  ON public.credit_payments ((metadata->>'version_number'));

CREATE TRIGGER credit_payments_meta_insert
  BEFORE INSERT ON public.credit_payments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_metadata_on_insert();

CREATE TRIGGER credit_payments_meta_update
  BEFORE UPDATE ON public.credit_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_metadata_versioning();

CREATE TRIGGER credit_payments_set_updated_at
  BEFORE UPDATE ON public.credit_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.credit_payments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_payments;
