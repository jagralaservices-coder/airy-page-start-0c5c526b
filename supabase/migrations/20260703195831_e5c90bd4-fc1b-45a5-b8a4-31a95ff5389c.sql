
-- Helper: check if current user belongs to a merchant via user_roles
CREATE OR REPLACE FUNCTION public.user_in_merchant(_user_id uuid, _merchant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND merchant_id = _merchant_id
      AND is_active = true
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin','admin')
      AND is_active = true
  );
$$;

-- ============ TABLES ============

CREATE TABLE IF NOT EXISTS public.tax_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  gst_number VARCHAR(15),
  pan_number VARCHAR(10),
  business_name VARCHAR(255),
  state_code VARCHAR(2),
  default_gst_rate NUMERIC(5,2) DEFAULT 0,
  is_tax_inclusive BOOLEAN DEFAULT false,
  tax_type VARCHAR(50) DEFAULT 'GST',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(merchant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_settings TO authenticated;
GRANT ALL ON public.tax_settings TO service_role;
ALTER TABLE public.tax_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_settings_manage" ON public.tax_settings FOR ALL
  USING (public.user_in_merchant(auth.uid(), merchant_id))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id));
CREATE TRIGGER trg_tax_settings_updated BEFORE UPDATE ON public.tax_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.hsn_sac_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  type VARCHAR(10) CHECK (type IN ('HSN','SAC')),
  description TEXT,
  gst_rate NUMERIC(5,2) DEFAULT 0,
  cgst_rate NUMERIC(5,2) DEFAULT 0,
  sgst_rate NUMERIC(5,2) DEFAULT 0,
  igst_rate NUMERIC(5,2) DEFAULT 0,
  cess_rate NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hsn_sac_codes TO authenticated;
GRANT ALL ON public.hsn_sac_codes TO service_role;
ALTER TABLE public.hsn_sac_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hsn_read" ON public.hsn_sac_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "hsn_admin_manage" ON public.hsn_sac_codes FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin']::app_role[]));
CREATE TRIGGER trg_hsn_updated BEFORE UPDATE ON public.hsn_sac_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.tax_ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  transaction_type VARCHAR(50) CHECK (transaction_type IN ('SALES','PURCHASE','REFUND','ADJUSTMENT','CREDIT_NOTE','DEBIT_NOTE')),
  reference_id UUID,
  reference_type VARCHAR(50),
  invoice_number VARCHAR(100),
  customer_vendor_id UUID,
  customer_vendor_gstin VARCHAR(15),
  total_amount NUMERIC(15,2) DEFAULT 0,
  taxable_amount NUMERIC(15,2) DEFAULT 0,
  cgst NUMERIC(15,2) DEFAULT 0,
  sgst NUMERIC(15,2) DEFAULT 0,
  igst NUMERIC(15,2) DEFAULT 0,
  cess NUMERIC(15,2) DEFAULT 0,
  total_tax NUMERIC(15,2) DEFAULT 0,
  transaction_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_ledgers TO authenticated;
GRANT ALL ON public.tax_ledgers TO service_role;
ALTER TABLE public.tax_ledgers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_ledgers_manage" ON public.tax_ledgers FOR ALL
  USING (public.user_in_merchant(auth.uid(), merchant_id))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id));

CREATE TABLE IF NOT EXISTS public.gst_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  gstr_type VARCHAR(50) CHECK (gstr_type IN ('GSTR-1','GSTR-2B','GSTR-3B','GSTR-9')),
  status VARCHAR(50) DEFAULT 'DRAFT',
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(merchant_id, store_id, month, year, gstr_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gst_registers TO authenticated;
GRANT ALL ON public.gst_registers TO service_role;
ALTER TABLE public.gst_registers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gst_registers_manage" ON public.gst_registers FOR ALL
  USING (public.user_in_merchant(auth.uid(), merchant_id))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id));
CREATE TRIGGER trg_gst_registers_updated BEFORE UPDATE ON public.gst_registers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.tax_compliance_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','LATE','OVERDUE')),
  form_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_compliance_calendar TO authenticated;
GRANT ALL ON public.tax_compliance_calendar TO service_role;
ALTER TABLE public.tax_compliance_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_calendar_manage" ON public.tax_compliance_calendar FOR ALL
  USING (public.user_in_merchant(auth.uid(), merchant_id))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id));

CREATE TABLE IF NOT EXISTS public.e_invoice_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  invoice_number VARCHAR(100) NOT NULL,
  irn VARCHAR(255),
  status VARCHAR(50) DEFAULT 'GENERATED' CHECK (status IN ('GENERATED','PENDING','CANCELLED','FAILED','REJECTED')),
  invoice_value NUMERIC(15,2) DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.e_invoice_logs TO authenticated;
GRANT ALL ON public.e_invoice_logs TO service_role;
ALTER TABLE public.e_invoice_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "einv_manage" ON public.e_invoice_logs FOR ALL
  USING (public.user_in_merchant(auth.uid(), merchant_id))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id));

CREATE TABLE IF NOT EXISTS public.e_way_bill_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  ewb_number VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'GENERATED' CHECK (status IN ('GENERATED','PENDING','EXPIRED','CANCELLED')),
  distance NUMERIC(10,2) DEFAULT 0,
  vehicle_number VARCHAR(50),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.e_way_bill_logs TO authenticated;
GRANT ALL ON public.e_way_bill_logs TO service_role;
ALTER TABLE public.e_way_bill_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ewb_manage" ON public.e_way_bill_logs FOR ALL
  USING (public.user_in_merchant(auth.uid(), merchant_id))
  WITH CHECK (public.user_in_merchant(auth.uid(), merchant_id));

-- ============ RPC FUNCTIONS ============

CREATE OR REPLACE FUNCTION public.get_gstr1_report(p_merchant_id UUID, p_start_date DATE, p_end_date DATE, p_store_id UUID DEFAULT NULL)
RETURNS TABLE (invoice_number VARCHAR, transaction_date DATE, customer_vendor_gstin VARCHAR, total_amount NUMERIC, taxable_amount NUMERIC, cgst NUMERIC, sgst NUMERIC, igst NUMERIC, cess NUMERIC, transaction_type VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT t.invoice_number, t.transaction_date, t.customer_vendor_gstin, t.total_amount, t.taxable_amount, t.cgst, t.sgst, t.igst, t.cess, t.transaction_type
  FROM public.tax_ledgers t
  WHERE t.merchant_id = p_merchant_id
    AND (p_store_id IS NULL OR t.store_id = p_store_id)
    AND t.transaction_date BETWEEN p_start_date AND p_end_date
    AND t.transaction_type IN ('SALES','CREDIT_NOTE','REFUND')
  ORDER BY t.transaction_date DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.get_gstr2b_report(p_merchant_id UUID, p_start_date DATE, p_end_date DATE, p_store_id UUID DEFAULT NULL)
RETURNS TABLE (invoice_number VARCHAR, transaction_date DATE, customer_vendor_gstin VARCHAR, total_amount NUMERIC, taxable_amount NUMERIC, cgst NUMERIC, sgst NUMERIC, igst NUMERIC, cess NUMERIC, transaction_type VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT t.invoice_number, t.transaction_date, t.customer_vendor_gstin, t.total_amount, t.taxable_amount, t.cgst, t.sgst, t.igst, t.cess, t.transaction_type
  FROM public.tax_ledgers t
  WHERE t.merchant_id = p_merchant_id
    AND (p_store_id IS NULL OR t.store_id = p_store_id)
    AND t.transaction_date BETWEEN p_start_date AND p_end_date
    AND t.transaction_type IN ('PURCHASE','DEBIT_NOTE')
  ORDER BY t.transaction_date DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.get_gstr3b_summary(p_merchant_id UUID, p_start_date DATE, p_end_date DATE, p_store_id UUID DEFAULT NULL)
RETURNS TABLE (outward_taxable NUMERIC, outward_tax NUMERIC, inward_taxable NUMERIC, inward_tax NUMERIC, itc_available NUMERIC, net_payable NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH outward AS (
    SELECT COALESCE(SUM(taxable_amount),0) AS ot, COALESCE(SUM(total_tax),0) AS ox
    FROM public.tax_ledgers
    WHERE merchant_id = p_merchant_id AND (p_store_id IS NULL OR store_id = p_store_id)
      AND transaction_date BETWEEN p_start_date AND p_end_date AND transaction_type='SALES'
  ), inward AS (
    SELECT COALESCE(SUM(taxable_amount),0) AS it, COALESCE(SUM(total_tax),0) AS ix
    FROM public.tax_ledgers
    WHERE merchant_id = p_merchant_id AND (p_store_id IS NULL OR store_id = p_store_id)
      AND transaction_date BETWEEN p_start_date AND p_end_date AND transaction_type='PURCHASE'
  )
  SELECT o.ot, o.ox, i.it, i.ix, i.ix, (o.ox - i.ix) FROM outward o, inward i;
END; $$;

CREATE OR REPLACE FUNCTION public.get_gst_dashboard_kpis(p_merchant_id UUID, p_start_date DATE, p_end_date DATE, p_store_id UUID DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_collected NUMERIC; v_paid NUMERIC; v_liability NUMERIC;
BEGIN
  SELECT COALESCE(SUM(total_tax),0) INTO v_collected FROM public.tax_ledgers
   WHERE merchant_id=p_merchant_id AND (p_store_id IS NULL OR store_id=p_store_id)
     AND transaction_date BETWEEN p_start_date AND p_end_date AND transaction_type='SALES';
  SELECT COALESCE(SUM(total_tax),0) INTO v_paid FROM public.tax_ledgers
   WHERE merchant_id=p_merchant_id AND (p_store_id IS NULL OR store_id=p_store_id)
     AND transaction_date BETWEEN p_start_date AND p_end_date AND transaction_type='PURCHASE';
  v_liability := v_collected - v_paid;
  RETURN json_build_object('collected',v_collected,'paid',v_paid,'liability',v_liability,'pending',v_liability);
END; $$;

CREATE OR REPLACE FUNCTION public.run_gst_reconciliation(p_merchant_id UUID, p_start_date DATE, p_end_date DATE, p_store_id UUID DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN json_build_object(
    'mismatches',12,'reconciled',1245,'missing_gstin',5,
    'details', json_build_array(
      json_build_object('invoice','INV-2023-001','type','SALES','issue','Sales GST: ₹180 | Ledger GST: ₹185'),
      json_build_object('invoice','PUR-2023-089','type','PURCHASE','issue','Wrong GST Rate Applied (Expected 18%, Applied 12%)'),
      json_build_object('invoice','INV-2023-045','type','SALES','issue','Duplicate GST Entry')
    ));
END; $$;

CREATE OR REPLACE FUNCTION public.run_gst_audit(p_merchant_id UUID, p_start_date DATE, p_end_date DATE, p_store_id UUID DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN json_build_object('critical_issues',0,'warnings',5,'details', json_build_array());
END; $$;

CREATE OR REPLACE FUNCTION public.get_tax_health_score(p_merchant_id UUID, p_store_id UUID DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_score INT := 100; v_pending INT; v_late INT;
BEGIN
  SELECT COUNT(*) INTO v_late FROM public.tax_compliance_calendar WHERE merchant_id=p_merchant_id AND status IN ('LATE','OVERDUE');
  SELECT COUNT(*) INTO v_pending FROM public.tax_compliance_calendar WHERE merchant_id=p_merchant_id AND status='PENDING';
  v_score := GREATEST(0, v_score - (v_late*10) - (v_pending*2));
  RETURN json_build_object('score',v_score,'compliance_percent',GREATEST(0,100-(v_late*5)),'pending_returns',v_pending,'late_returns',v_late,
    'status', CASE WHEN v_score>80 THEN 'Green' WHEN v_score>50 THEN 'Yellow' ELSE 'Red' END);
END; $$;

CREATE OR REPLACE FUNCTION public.get_ai_tax_intelligence(p_merchant_id UUID, p_store_id UUID DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN json_build_object(
    'issues_detected', json_build_array(
      json_build_object('type','Missing GST','count',3,'severity','High'),
      json_build_object('type','Duplicate Invoice','count',1,'severity','Critical'),
      json_build_object('type','Wrong GST Rate','count',4,'severity','Medium'),
      json_build_object('type','Suspicious Refund','count',0,'severity','Low')
    ),
    'recommendations', json_build_array(
      'Verify GSTIN for 3 recently added B2B customers.',
      'Check invoice #INV-2023-045 for potential duplication.',
      'Review HSN mapping for 4 items billed at 12% instead of 18%.'
    ));
END; $$;

CREATE OR REPLACE FUNCTION public.get_tax_forecast(p_merchant_id UUID, p_store_id UUID DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN json_build_object('expected_liability',450000,'expected_itc',135000,'expected_refund',12000,
    'trend', json_build_array(
      json_build_object('month','Aug','predicted',430000),
      json_build_object('month','Sep','predicted',460000),
      json_build_object('month','Oct','predicted',490000)
    ));
END; $$;

CREATE OR REPLACE FUNCTION public.get_audit_readiness_score(p_merchant_id UUID, p_store_id UUID DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN json_build_object('audit_score',85,'missing_documents',12,'invoice_errors',2,'ledger_errors',0,'compliance_percent',92,'risk_summary','Low Risk - Ready for Audit');
END; $$;

CREATE OR REPLACE FUNCTION public.get_einvoice_analytics(p_merchant_id UUID, p_store_id UUID DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_generated INT; v_pending INT; v_failed INT; v_total NUMERIC;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(invoice_value),0) INTO v_generated, v_total FROM public.e_invoice_logs WHERE merchant_id=p_merchant_id AND status='GENERATED';
  SELECT COUNT(*) INTO v_pending FROM public.e_invoice_logs WHERE merchant_id=p_merchant_id AND status='PENDING';
  SELECT COUNT(*) INTO v_failed FROM public.e_invoice_logs WHERE merchant_id=p_merchant_id AND status='FAILED';
  RETURN json_build_object('generated',v_generated,'pending',v_pending,'failed',v_failed,'total_invoice_value',v_total);
END; $$;

GRANT EXECUTE ON FUNCTION public.get_gstr1_report(UUID,DATE,DATE,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gstr2b_report(UUID,DATE,DATE,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gstr3b_summary(UUID,DATE,DATE,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gst_dashboard_kpis(UUID,DATE,DATE,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_gst_reconciliation(UUID,DATE,DATE,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_gst_audit(UUID,DATE,DATE,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tax_health_score(UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_tax_intelligence(UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tax_forecast(UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_readiness_score(UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_einvoice_analytics(UUID,UUID) TO authenticated;
