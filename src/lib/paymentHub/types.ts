// Universal Payment Gateway Hub — shared types
export type GatewayId =
  | 'razorpay' | 'cashfree' | 'phonepe' | 'paytm' | 'payu'
  | 'ccavenue' | 'pinelabs' | 'stripe' | 'square';

export type PaymentStatus =
  | 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired'
  | 'refunded' | 'partially_refunded';

export interface GatewaySupport {
  dynamicQR: boolean;
  refunds: boolean;
  settlement: boolean;
  webhooks: boolean;
  staticQR: boolean;
}

export interface GatewayCredentials {
  apiKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  merchantAccountId?: string;
  environment: 'sandbox' | 'production';
  extra?: Record<string, any>;
}

export interface ChargeRequest {
  orderId: string;
  storeId: string;
  amount: number;
  currency?: string;
  customer?: { name?: string; phone?: string; email?: string };
  description?: string;
  expiresInSec?: number;
}

export interface ChargeResponse {
  gatewayTxnId: string;
  qrPayload?: string;     // UPI intent or QR data
  paymentUrl?: string;    // hosted checkout URL
  expiresAt?: string;
  raw?: any;
}

export interface VerifyResponse {
  status: PaymentStatus;
  gatewayTxnId: string;
  amount?: number;
  fees?: number;
  raw?: any;
}

export interface RefundRequest {
  transactionId: string;
  gatewayTxnId: string;
  amount: number;
  reason?: string;
}

export interface RefundResponse {
  gatewayRefundId: string;
  status: 'pending' | 'processed' | 'failed';
  raw?: any;
}

export interface WebhookEvent {
  type: string;
  gatewayTxnId?: string;
  status?: PaymentStatus;
  amount?: number;
  raw: any;
}

export interface PaymentAdapter {
  id: GatewayId;
  name: string;
  supports: GatewaySupport;
  testConnection(creds: GatewayCredentials): Promise<{ ok: boolean; message: string }>;
  createCharge(creds: GatewayCredentials, req: ChargeRequest): Promise<ChargeResponse>;
  verifyPayment(creds: GatewayCredentials, gatewayTxnId: string): Promise<VerifyResponse>;
  refund(creds: GatewayCredentials, req: RefundRequest): Promise<RefundResponse>;
  parseWebhook(payload: any, signature: string | null, secret: string): WebhookEvent | null;
}
