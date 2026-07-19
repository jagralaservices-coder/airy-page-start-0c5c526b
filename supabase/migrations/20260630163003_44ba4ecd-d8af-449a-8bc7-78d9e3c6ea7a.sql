
-- Extend sales_returns with return_type, exchange/credit linkage, refund threshold
ALTER TABLE public.sales_returns
  ADD COLUMN IF NOT EXISTS return_type text NOT NULL DEFAULT 'partial',
  ADD COLUMN IF NOT EXISTS exchange_diff numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_note_id uuid,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.sales_return_items
  ADD COLUMN IF NOT EXISTS restock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS damaged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_amount numeric NOT NULL DEFAULT 0;

-- Store-level config: refund threshold above which PIN approval required
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS return_refund_pin_threshold numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_allow_exchange boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS return_allow_credit_note boolean NOT NULL DEFAULT true;

-- Credit Notes
CREATE TABLE IF NOT EXISTS public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  merchant_id uuid,
  note_no text NOT NULL,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  original_return_id uuid,
  original_invoice_no text,
  issued_amount numeric NOT NULL DEFAULT 0,
  redeemed_amount numeric NOT NULL DEFAULT 0,
  balance_amount numeric NOT NULL DEFAULT 0,
  expiry_date timestamptz,
  status text NOT NULL DEFAULT 'active',
  issued_by uuid,
  issued_by_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_notes TO authenticated;
GRANT ALL ON public.credit_notes TO service_role;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_notes_select" ON public.credit_notes FOR SELECT TO authenticated
  USING (public.can_manage_store(store_id));
CREATE POLICY "credit_notes_insert" ON public.credit_notes FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_store(store_id));
CREATE POLICY "credit_notes_update" ON public.credit_notes FOR UPDATE TO authenticated
  USING (public.can_manage_store(store_id)) WITH CHECK (public.can_manage_store(store_id));
CREATE POLICY "credit_notes_delete" ON public.credit_notes FOR DELETE TO authenticated
  USING (public.can_manage_store(store_id));

CREATE TRIGGER trg_credit_notes_updated BEFORE UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_credit_notes_store ON public.credit_notes(store_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer ON public.credit_notes(customer_id);

-- Redemptions
CREATE TABLE IF NOT EXISTS public.credit_note_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  store_id uuid NOT NULL,
  order_id uuid,
  invoice_no text,
  amount numeric NOT NULL,
  redeemed_by uuid,
  redeemed_by_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_note_redemptions TO authenticated;
GRANT ALL ON public.credit_note_redemptions TO service_role;
ALTER TABLE public.credit_note_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_note_redemptions_select" ON public.credit_note_redemptions FOR SELECT TO authenticated
  USING (public.can_manage_store(store_id));
CREATE POLICY "credit_note_redemptions_insert" ON public.credit_note_redemptions FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_store(store_id));
CREATE INDEX IF NOT EXISTS idx_cnr_note ON public.credit_note_redemptions(credit_note_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_note_redemptions;
