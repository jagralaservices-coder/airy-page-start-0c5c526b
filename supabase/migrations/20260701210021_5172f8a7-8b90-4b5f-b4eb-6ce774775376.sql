
-- Phase 2 Accounting: A/P invoices & payments, bank reconciliation, depreciation

-- Supplier Invoices (AP)
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  store_id uuid,
  supplier_id uuid NOT NULL,
  purchase_order_id uuid,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid',
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_invoices TO authenticated;
GRANT ALL ON public.supplier_invoices TO service_role;
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "si_merchant_read" ON public.supplier_invoices FOR SELECT TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id));
CREATE POLICY "si_merchant_write" ON public.supplier_invoices FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id));
CREATE INDEX IF NOT EXISTS idx_si_merchant ON public.supplier_invoices(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_si_supplier ON public.supplier_invoices(supplier_id);

-- Supplier Payments
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  store_id uuid,
  supplier_id uuid NOT NULL,
  invoice_id uuid,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL,
  method text NOT NULL DEFAULT 'cash',
  reference text,
  bank_account_id uuid,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_merchant_read" ON public.supplier_payments FOR SELECT TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id));
CREATE POLICY "sp_merchant_write" ON public.supplier_payments FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id));

-- Bank Transactions (imported statement lines)
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  store_id uuid,
  bank_account_id uuid NOT NULL,
  txn_date date NOT NULL,
  description text,
  reference text,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  balance numeric,
  match_status text NOT NULL DEFAULT 'unmatched',
  matched_journal_id uuid,
  matched_payment_id uuid,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bt_merchant_read" ON public.bank_transactions FOR SELECT TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id));
CREATE POLICY "bt_merchant_write" ON public.bank_transactions FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id));
CREATE INDEX IF NOT EXISTS idx_bt_bank ON public.bank_transactions(bank_account_id, txn_date);

-- Depreciation entries
CREATE TABLE IF NOT EXISTS public.depreciation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  period_date date NOT NULL,
  amount numeric NOT NULL,
  method text NOT NULL DEFAULT 'straight_line',
  book_value_before numeric NOT NULL DEFAULT 0,
  book_value_after numeric NOT NULL DEFAULT 0,
  journal_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.depreciation_entries TO authenticated;
GRANT ALL ON public.depreciation_entries TO service_role;
ALTER TABLE public.depreciation_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "de_merchant_read" ON public.depreciation_entries FOR SELECT TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id));
CREATE POLICY "de_merchant_write" ON public.depreciation_entries FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id));

-- Updated_at triggers
CREATE TRIGGER set_updated_at_si BEFORE UPDATE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_sp BEFORE UPDATE ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_bt BEFORE UPDATE ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
