
-- =========================================================
-- ACCOUNTING MODULE — PHASE 1 FOUNDATION
-- =========================================================

-- Add 'accountant' role
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';
EXCEPTION WHEN others THEN NULL; END $$;

-- ---------- Chart of Accounts ----------
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense')),
  subtype text,
  parent_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_coa_merchant ON public.chart_of_accounts(merchant_id);
CREATE INDEX IF NOT EXISTS idx_coa_type ON public.chart_of_accounts(merchant_id, account_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_of_accounts TO authenticated;
GRANT ALL ON public.chart_of_accounts TO service_role;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coa_select" ON public.chart_of_accounts FOR SELECT TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "coa_insert" ON public.chart_of_accounts FOR INSERT TO authenticated
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "coa_update" ON public.chart_of_accounts FOR UPDATE TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "coa_delete" ON public.chart_of_accounts FOR DELETE TO authenticated
  USING ((public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin')) AND is_system = false);

CREATE TRIGGER trg_coa_updated BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Cost Centers ----------
CREATE TABLE IF NOT EXISTS public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  store_id uuid,
  name text NOT NULL,
  code text,
  center_type text NOT NULL DEFAULT 'department' CHECK (center_type IN ('department','store','project','kitchen','warehouse','other')),
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cc_merchant ON public.cost_centers(merchant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT ALL ON public.cost_centers TO service_role;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cc_all" ON public.cost_centers FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'));

-- ---------- Accounting Periods ----------
CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  fiscal_year int NOT NULL,
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','locked')),
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, fiscal_year, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_periods TO authenticated;
GRANT ALL ON public.accounting_periods TO service_role;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ap_all" ON public.accounting_periods FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'));

-- ---------- Journal Entries ----------
CREATE SEQUENCE IF NOT EXISTS public.journal_entry_seq;

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  store_id uuid,
  entry_no text NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  source_type text NOT NULL DEFAULT 'manual',
  source_id uuid,
  idempotency_key text,
  narration text,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','pending_approval','posted','reversed','voided')),
  total_debit numeric(18,2) NOT NULL DEFAULT 0,
  total_credit numeric(18,2) NOT NULL DEFAULT 0,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  reversed_by_entry uuid REFERENCES public.journal_entries(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_je_merchant_date ON public.journal_entries(merchant_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_je_store_date ON public.journal_entries(store_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_je_source ON public.journal_entries(source_type, source_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "je_select" ON public.journal_entries FOR SELECT TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "je_insert" ON public.journal_entries FOR INSERT TO authenticated
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "je_update" ON public.journal_entries FOR UPDATE TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "je_delete" ON public.journal_entries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER trg_je_updated BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Journal Lines ----------
CREATE TABLE IF NOT EXISTS public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL,
  store_id uuid,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  cost_center_id uuid REFERENCES public.cost_centers(id),
  debit numeric(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  party_type text,
  party_id uuid,
  tax_code text,
  line_no int NOT NULL DEFAULT 1,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (debit > 0 AND credit > 0))
);
CREATE INDEX IF NOT EXISTS idx_jl_entry ON public.journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_jl_account ON public.journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_jl_merchant_account ON public.journal_lines(merchant_id, account_id);
CREATE INDEX IF NOT EXISTS idx_jl_store ON public.journal_lines(store_id);
CREATE INDEX IF NOT EXISTS idx_jl_party ON public.journal_lines(party_type, party_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_lines TO authenticated;
GRANT ALL ON public.journal_lines TO service_role;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jl_select" ON public.journal_lines FOR SELECT TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "jl_insert" ON public.journal_lines FOR INSERT TO authenticated
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "jl_update" ON public.journal_lines FOR UPDATE TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "jl_delete" ON public.journal_lines FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

-- ---------- Balance validation trigger ----------
CREATE OR REPLACE FUNCTION public.validate_journal_balance()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE d numeric; c numeric;
BEGIN
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO d, c
    FROM public.journal_lines WHERE entry_id = NEW.id;
  IF NEW.status = 'posted' AND d <> c THEN
    RAISE EXCEPTION 'unbalanced_journal_entry: debit=% credit=%', d, c;
  END IF;
  NEW.total_debit := d;
  NEW.total_credit := c;
  RETURN NEW;
END $$;

-- ---------- Bank Accounts ----------
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  store_id uuid,
  account_id uuid REFERENCES public.chart_of_accounts(id),
  bank_name text NOT NULL,
  account_name text NOT NULL,
  account_number text,
  ifsc_code text,
  branch text,
  account_type text DEFAULT 'current' CHECK (account_type IN ('current','savings','od','cc','other')),
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ba_all" ON public.bank_accounts FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'));

-- ---------- Fixed Assets ----------
CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  store_id uuid,
  asset_code text,
  name text NOT NULL,
  category text,
  purchase_date date NOT NULL,
  purchase_cost numeric(18,2) NOT NULL,
  salvage_value numeric(18,2) NOT NULL DEFAULT 0,
  useful_life_months int NOT NULL DEFAULT 60,
  depreciation_method text NOT NULL DEFAULT 'SLM' CHECK (depreciation_method IN ('SLM','WDV')),
  wdv_rate numeric(6,3),
  accumulated_depreciation numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disposed','transferred')),
  disposal_date date,
  disposal_value numeric(18,2),
  asset_account_id uuid REFERENCES public.chart_of_accounts(id),
  depreciation_account_id uuid REFERENCES public.chart_of_accounts(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_assets TO authenticated;
GRANT ALL ON public.fixed_assets TO service_role;
ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fa_all" ON public.fixed_assets FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'));

-- ---------- Budgets ----------
CREATE TABLE IF NOT EXISTS public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  store_id uuid,
  cost_center_id uuid REFERENCES public.cost_centers(id),
  account_id uuid REFERENCES public.chart_of_accounts(id),
  fiscal_year int NOT NULL,
  period_month int,
  budget_amount numeric(18,2) NOT NULL DEFAULT 0,
  alert_threshold_pct int DEFAULT 90,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;
GRANT ALL ON public.budgets TO service_role;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bud_all" ON public.budgets FOR ALL TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'));

-- ---------- Accounting Audit Log ----------
CREATE TABLE IF NOT EXISTS public.accounting_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  actor_id uuid,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aal_merchant_entity ON public.accounting_audit_log(merchant_id, entity_type, entity_id);
GRANT SELECT, INSERT ON public.accounting_audit_log TO authenticated;
GRANT ALL ON public.accounting_audit_log TO service_role;
ALTER TABLE public.accounting_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aal_select" ON public.accounting_audit_log FOR SELECT TO authenticated
  USING (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "aal_insert" ON public.accounting_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id) OR public.has_role(auth.uid(),'super_admin'));

-- ---------- Seed default Chart of Accounts ----------
CREATE OR REPLACE FUNCTION public.seed_default_coa(_merchant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE merchant_id = _merchant_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.chart_of_accounts (merchant_id, code, name, account_type, subtype, is_system) VALUES
  -- Assets
  (_merchant_id,'1000','Cash in Hand','asset','cash',true),
  (_merchant_id,'1010','Petty Cash','asset','cash',true),
  (_merchant_id,'1100','Bank Accounts','asset','bank',true),
  (_merchant_id,'1200','Accounts Receivable','asset','receivable',true),
  (_merchant_id,'1300','Inventory','asset','inventory',true),
  (_merchant_id,'1400','Input CGST','asset','tax_receivable',true),
  (_merchant_id,'1410','Input SGST','asset','tax_receivable',true),
  (_merchant_id,'1420','Input IGST','asset','tax_receivable',true),
  (_merchant_id,'1500','Payment Gateway Clearing','asset','clearing',true),
  (_merchant_id,'1600','Fixed Assets','asset','fixed_asset',true),
  (_merchant_id,'1610','Accumulated Depreciation','asset','contra_asset',true),
  (_merchant_id,'1700','Prepaid Expenses','asset','current_asset',true),
  -- Liabilities
  (_merchant_id,'2000','Accounts Payable','liability','payable',true),
  (_merchant_id,'2100','Output CGST','liability','tax_payable',true),
  (_merchant_id,'2110','Output SGST','liability','tax_payable',true),
  (_merchant_id,'2120','Output IGST','liability','tax_payable',true),
  (_merchant_id,'2200','TDS Payable','liability','tax_payable',true),
  (_merchant_id,'2300','Customer Credit Liability','liability','current_liability',true),
  (_merchant_id,'2400','Salary Payable','liability','current_liability',true),
  (_merchant_id,'2500','Loans Payable','liability','long_term',true),
  -- Equity
  (_merchant_id,'3000','Owner Capital','equity','capital',true),
  (_merchant_id,'3100','Retained Earnings','equity','retained',true),
  (_merchant_id,'3200','Opening Balance Equity','equity','opening',true),
  -- Income
  (_merchant_id,'4000','Sales','income','operating',true),
  (_merchant_id,'4010','Sales Returns','income','contra_income',true),
  (_merchant_id,'4020','Discounts Given','income','contra_income',true),
  (_merchant_id,'4100','Other Income','income','other',true),
  (_merchant_id,'4200','Round-Off','income','other',true),
  -- Expense
  (_merchant_id,'5000','Cost of Goods Sold','expense','cogs',true),
  (_merchant_id,'5100','Purchases','expense','cogs',true),
  (_merchant_id,'6000','Salary & Wages','expense','operating',true),
  (_merchant_id,'6010','Rent','expense','operating',true),
  (_merchant_id,'6020','Electricity','expense','operating',true),
  (_merchant_id,'6030','Marketing','expense','operating',true),
  (_merchant_id,'6040','Payment Gateway Fees','expense','operating',true),
  (_merchant_id,'6050','Bank Charges','expense','operating',true),
  (_merchant_id,'6060','Repairs & Maintenance','expense','operating',true),
  (_merchant_id,'6070','Telephone & Internet','expense','operating',true),
  (_merchant_id,'6080','Travel','expense','operating',true),
  (_merchant_id,'6090','Office Supplies','expense','operating',true),
  (_merchant_id,'6100','Depreciation','expense','operating',true),
  (_merchant_id,'6110','Inventory Loss / Adjustment','expense','operating',true),
  (_merchant_id,'6900','Other Expenses','expense','operating',true);
END $$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_lines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chart_of_accounts;
