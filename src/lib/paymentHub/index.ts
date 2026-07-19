/**
 * Payment Hub — Universal entry point.
 * Billing code never touches a specific gateway; it goes through this hub.
 * All real network calls happen in edge functions; the client only orchestrates.
 */
import { supabase } from '@/integrations/supabase/client';
import { GATEWAY_CATALOG, getCatalogEntry } from './registry';
import type {
  ChargeRequest, ChargeResponse, VerifyResponse, RefundRequest, RefundResponse,
} from './types';

export * from './types';
export * from './registry';

export const paymentHub = {
  catalog: GATEWAY_CATALOG,
  getCatalogEntry,

  async testConnection(connectionId: string) {
    const { data, error } = await supabase.functions.invoke('payment-hub-test-connection', {
      body: { connectionId },
    });
    if (error) throw error;
    return data as { ok: boolean; message: string };
  },

  async createCharge(connectionId: string, req: ChargeRequest): Promise<ChargeResponse & { transactionId: string }> {
    const { data, error } = await supabase.functions.invoke('payment-hub-create-charge', {
      body: { connectionId, request: req },
    });
    if (error) throw error;
    return data;
  },

  async verifyPayment(transactionId: string): Promise<VerifyResponse> {
    const { data, error } = await supabase.functions.invoke('payment-hub-verify', {
      body: { transactionId },
    });
    if (error) throw error;
    return data;
  },

  async refund(req: RefundRequest): Promise<RefundResponse> {
    const { data, error } = await supabase.functions.invoke('payment-hub-refund', {
      body: req,
    });
    if (error) throw error;
    return data;
  },

  webhookUrlFor(gatewayId: string, connectionId: string) {
    const base = (import.meta as any).env?.VITE_SUPABASE_URL || '';
    return `${base}/functions/v1/payment-webhook-receiver/${gatewayId}/${connectionId}`;
  },
};
