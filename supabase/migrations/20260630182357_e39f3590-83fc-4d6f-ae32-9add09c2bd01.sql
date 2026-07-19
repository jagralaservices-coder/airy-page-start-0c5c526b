
-- ============ Catalog ============
CREATE TABLE public.payment_gateways (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  logo_url text,
  docs_url text,
  supports_dynamic_qr boolean NOT NULL DEFAULT false,
  supports_refunds boolean NOT NULL DEFAULT false,
  supports_settlement boolean NOT NULL DEFAULT false,
  supports_webhooks boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'available',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_gateways TO authenticated, anon;
GRANT ALL ON public.payment_gateways TO service_role;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog readable" ON public.payment_gateways FOR SELECT USING (true);

INSERT INTO public.payment_gateways (id,name,supports_dynamic_qr,supports_refunds,supports_settlement,supports_webhooks,sort_order) VALUES
  ('razorpay','Razorpay',true,true,true,true,1),
  ('cashfree','Cashfree',true,true,true,true,2),
  ('phonepe','PhonePe Business',true,true,false,true,3),
  ('paytm','Paytm Business',true,true,false,true,4),
  ('payu','PayU',true,true,false,true,5),
  ('ccavenue','CCAvenue',false,true,false,true,6),
  ('pinelabs','Pine Labs',false,true,false,true,7),
  ('stripe','Stripe',true,true,true,true,8),
  ('square','Square',true,true,false,true,9);

-- ============ Connections ============
CREATE TABLE public.merchant_gateway_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  merchant_id uuid,
  gateway_id text NOT NULL REFERENCES public.payment_gateways(id),
  display_name text,
  merchant_account_id text,
  api_key text,
  secret_key_encrypted text,
  webhook_secret text,
  webhook_url text,
  environment text NOT NULL DEFAULT 'sandbox',
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'disconnected',
  last_test_at timestamptz,
  last_test_result jsonb,
  last_sync_at timestamptz,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, gateway_id, environment)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_gateway_connections TO authenticated;
GRANT ALL ON public.merchant_gateway_connections TO service_role;
ALTER TABLE public.merchant_gateway_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conn manage" ON public.merchant_gateway_connections FOR ALL TO authenticated
  USING (public.can_manage_store(store_id)) WITH CHECK (public.can_manage_store(store_id));
CREATE TRIGGER trg_mgc_updated BEFORE UPDATE ON public.merchant_gateway_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Transactions ============
CREATE TABLE public.gateway_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid,
  connection_id uuid REFERENCES public.merchant_gateway_connections(id) ON DELETE SET NULL,
  gateway_id text NOT NULL,
  gateway_txn_id text,
  gateway_reference text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'pending',
  payment_method text,
  fees numeric(12,2) DEFAULT 0,
  gst_on_fees numeric(12,2) DEFAULT 0,
  net_amount numeric(12,2),
  settlement_id text,
  settlement_status text,
  settlement_date timestamptz,
  qr_payload text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gw_txn_store_idx ON public.gateway_transactions(store_id, created_at DESC);
CREATE INDEX gw_txn_order_idx ON public.gateway_transactions(order_id);
GRANT SELECT, INSERT, UPDATE ON public.gateway_transactions TO authenticated;
GRANT ALL ON public.gateway_transactions TO service_role;
ALTER TABLE public.gateway_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gtxn manage" ON public.gateway_transactions FOR ALL TO authenticated
  USING (public.can_manage_store(store_id)) WITH CHECK (public.can_manage_store(store_id));
CREATE TRIGGER trg_gtxn_updated BEFORE UPDATE ON public.gateway_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Refunds ============
CREATE TABLE public.gateway_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.gateway_transactions(id) ON DELETE SET NULL,
  gateway_id text NOT NULL,
  gateway_refund_id text,
  amount numeric(12,2) NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  refund_date timestamptz,
  raw jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.gateway_refunds TO authenticated;
GRANT ALL ON public.gateway_refunds TO service_role;
ALTER TABLE public.gateway_refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gref manage" ON public.gateway_refunds FOR ALL TO authenticated
  USING (public.can_manage_store(store_id)) WITH CHECK (public.can_manage_store(store_id));

-- ============ Settlements ============
CREATE TABLE public.gateway_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.merchant_gateway_connections(id) ON DELETE SET NULL,
  gateway_id text NOT NULL,
  gateway_settlement_id text,
  collected numeric(12,2) DEFAULT 0,
  settled numeric(12,2) DEFAULT 0,
  pending numeric(12,2) DEFAULT 0,
  fees numeric(12,2) DEFAULT 0,
  settlement_date timestamptz,
  status text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.gateway_settlements TO authenticated;
GRANT ALL ON public.gateway_settlements TO service_role;
ALTER TABLE public.gateway_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gset read" ON public.gateway_settlements FOR SELECT TO authenticated
  USING (public.can_manage_store(store_id));

-- ============ Webhook events (service role only) ============
CREATE TABLE public.gateway_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id text NOT NULL,
  connection_id uuid,
  event_type text,
  signature text,
  signature_valid boolean,
  payload jsonb,
  processed_at timestamptz,
  retry_count int NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.gateway_webhook_events TO service_role;
ALTER TABLE public.gateway_webhook_events ENABLE ROW LEVEL SECURITY;

-- ============ Static QR assets ============
CREATE TABLE public.static_qr_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  gateway_id text REFERENCES public.payment_gateways(id),
  merchant_name text,
  upi_id text,
  qr_image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.static_qr_assets TO authenticated;
GRANT ALL ON public.static_qr_assets TO service_role;
ALTER TABLE public.static_qr_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qr manage" ON public.static_qr_assets FOR ALL TO authenticated
  USING (public.can_manage_store(store_id)) WITH CHECK (public.can_manage_store(store_id));
CREATE TRIGGER trg_qr_updated BEFORE UPDATE ON public.static_qr_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.merchant_gateway_connections;
