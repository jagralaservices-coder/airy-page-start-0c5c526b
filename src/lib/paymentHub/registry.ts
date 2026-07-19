import { GatewayId, GatewaySupport } from './types';

export interface GatewayCatalogEntry {
  id: GatewayId;
  name: string;
  description: string;
  logo: string; // emoji or url
  supports: GatewaySupport;
  fields: Array<{ key: string; label: string; type: 'text' | 'password'; required?: boolean }>;
  status: 'available' | 'coming_soon';
}

export const GATEWAY_CATALOG: GatewayCatalogEntry[] = [
  {
    id: 'razorpay', name: 'Razorpay', description: 'Cards, UPI, Wallets, Netbanking with auto-settlement.',
    logo: '💳',
    supports: { dynamicQR: true, refunds: true, settlement: true, webhooks: true, staticQR: true },
    fields: [
      { key: 'api_key', label: 'Key ID', type: 'text', required: true },
      { key: 'secretKey', label: 'Key Secret', type: 'password', required: true },
      { key: 'webhookSecret', label: 'Webhook Secret', type: 'password' },
    ],
    status: 'available',
  },
  {
    id: 'cashfree', name: 'Cashfree', description: 'PG + Payouts with deep India coverage.',
    logo: '🟢',
    supports: { dynamicQR: true, refunds: true, settlement: true, webhooks: true, staticQR: true },
    fields: [
      { key: 'api_key', label: 'App ID', type: 'text', required: true },
      { key: 'secretKey', label: 'Secret Key', type: 'password', required: true },
      { key: 'webhookSecret', label: 'Webhook Secret', type: 'password' },
    ],
    status: 'available',
  },
  {
    id: 'phonepe', name: 'PhonePe Business', description: 'Dynamic QR + UPI Intent.',
    logo: '🟣',
    supports: { dynamicQR: true, refunds: true, settlement: false, webhooks: true, staticQR: true },
    fields: [
      { key: 'merchant_account_id', label: 'Merchant ID', type: 'text', required: true },
      { key: 'api_key', label: 'Salt Key', type: 'password', required: true },
      { key: 'secretKey', label: 'Salt Index', type: 'text', required: true },
    ],
    status: 'available',
  },
  {
    id: 'paytm', name: 'Paytm Business', description: 'UPI + Wallet collection.',
    logo: '🔵',
    supports: { dynamicQR: true, refunds: true, settlement: false, webhooks: true, staticQR: true },
    fields: [
      { key: 'merchant_account_id', label: 'MID', type: 'text', required: true },
      { key: 'api_key', label: 'Merchant Key', type: 'password', required: true },
    ],
    status: 'available',
  },
  {
    id: 'payu', name: 'PayU', description: 'Cards + UPI + Wallets.',
    logo: '🟡',
    supports: { dynamicQR: true, refunds: true, settlement: false, webhooks: true, staticQR: false },
    fields: [
      { key: 'api_key', label: 'Merchant Key', type: 'text', required: true },
      { key: 'secretKey', label: 'Salt', type: 'password', required: true },
    ],
    status: 'available',
  },
  {
    id: 'ccavenue', name: 'CCAvenue', description: 'Enterprise card processing.',
    logo: '🟠',
    supports: { dynamicQR: false, refunds: true, settlement: false, webhooks: true, staticQR: false },
    fields: [
      { key: 'merchant_account_id', label: 'Merchant ID', type: 'text', required: true },
      { key: 'api_key', label: 'Access Code', type: 'text', required: true },
      { key: 'secretKey', label: 'Working Key', type: 'password', required: true },
    ],
    status: 'available',
  },
  {
    id: 'pinelabs', name: 'Pine Labs', description: 'POS terminal & online checkout.',
    logo: '🌲',
    supports: { dynamicQR: false, refunds: true, settlement: false, webhooks: true, staticQR: false },
    fields: [
      { key: 'merchant_account_id', label: 'Merchant ID', type: 'text', required: true },
      { key: 'api_key', label: 'API Key', type: 'password', required: true },
    ],
    status: 'available',
  },
  {
    id: 'stripe', name: 'Stripe', description: 'Global card processor.',
    logo: '💜',
    supports: { dynamicQR: true, refunds: true, settlement: true, webhooks: true, staticQR: false },
    fields: [
      { key: 'api_key', label: 'Publishable Key', type: 'text' },
      { key: 'secretKey', label: 'Secret Key', type: 'password' },
    ],
    status: 'coming_soon',
  },
  {
    id: 'square', name: 'Square', description: 'POS + Online payments (US).',
    logo: '⬛',
    supports: { dynamicQR: true, refunds: true, settlement: false, webhooks: true, staticQR: false },
    fields: [
      { key: 'api_key', label: 'Access Token', type: 'password' },
    ],
    status: 'coming_soon',
  },
];

export const getCatalogEntry = (id: string) => GATEWAY_CATALOG.find(g => g.id === id);
