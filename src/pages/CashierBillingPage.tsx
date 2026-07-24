import { lazy, Suspense, useEffect, useState } from 'react';
import { usePOSSafe } from '@/contexts/POSContext';
import { CashierPinLogin } from '@/components/pos/CashierPinLogin';
import {
  CashierSession,
  getCashierSession,
  isCashierBillingModeOn,
  loadCashierBillingMode,
  logoutCashier,
} from '@/lib/cashier';
import { Button } from '@/components/ui/button';
import { LogOut, User } from 'lucide-react';

import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const POSBillingPage = lazy(() => import('./POSBillingPage'));

/**
 * Wrapper around POS Billing that enforces the optional Cashier PIN login.
 *
 * - If Cashier Billing Mode is OFF for the active store → renders billing as-is.
 * - If ON and no cashier session → shows the PIN login.
 * - If ON and a cashier session exists → renders billing with a top-right
 *   cashier badge + Logout (Logout closes the shift).
 *
 * The existing Staff login flow is untouched.
 */
export default function CashierBillingPage() {
  const { isCashier } = useSupabaseAuth();
  const pos = usePOSSafe();
  const storeId = pos?.activeStore?.id || '';
  const storeName = pos?.activeStore?.name || '';
  const isStoreLogin = !!pos?.isStoreLogin || (typeof window !== 'undefined' && localStorage.getItem('pos_is_store_login') === 'true');
  const [mode, setMode] = useState<boolean | null>(null);
  const [session, setSession] = useState<CashierSession | null>(getCashierSession());

  useEffect(() => {
    if (!storeId) { setMode(false); return; }
    setMode(isCashierBillingModeOn(storeId));
    loadCashierBillingMode(storeId).then(setMode).catch(() => setMode(isCashierBillingModeOn(storeId)));
  }, [storeId]);

  useEffect(() => {
    const onChange = (e: any) => setSession(e?.detail ?? null);
    window.addEventListener('cashier:session-changed', onChange as any);
    return () => window.removeEventListener('cashier:session-changed', onChange as any);
  }, []);

  // Direct Store ID login should open billing directly. The optional cashier
  // PIN gate is only for owner/manager sessions when they explicitly enable it.
  if (isStoreLogin) {
    return (
      <Suspense fallback={<div className="p-6">Loading billing…</div>}>
        <POSBillingPage />
      </Suspense>
    );
  }

  // Mode loading — show billing optimistically (cached value already applied).
  if (mode === null) {
    return (
      <Suspense fallback={<div className="p-6">Loading…</div>}>
        <POSBillingPage />
      </Suspense>
    );
  }

  // Cashier mode OFF → original behaviour
  if (!mode && !isCashier()) {
    return (
      <Suspense fallback={<div className="p-6">Loading…</div>}>
        <POSBillingPage />
      </Suspense>
    );
  }

  // If natively logged in as a Cashier via AuthPage — render billing without a
  // second header bar (AppHeader already shows name + Cashier role).
  if (isCashier()) {
    return (
      <Suspense fallback={<div className="p-6">Loading billing…</div>}>
        <POSBillingPage />
      </Suspense>
    );
  }

  // Cashier mode ON, no session → require PIN
  if (!session || session.storeId !== storeId) {
    return (
      <CashierPinLogin
        storeId={storeId}
        storeName={storeName}
        onSuccess={() => setSession(getCashierSession())}
      />
    );
  }

  // Authenticated cashier → render billing + slim badge
  return (
    <div className="relative">
      <div className="sticky top-0 z-40 flex items-center justify-between gap-2 px-3 py-1.5 bg-primary text-primary-foreground text-xs">
        <div className="flex items-center gap-2 truncate">
          <User className="h-3.5 w-3.5" />
          <span className="font-semibold">{session.cashierName}</span>
          <span className="opacity-80">· {session.cashierCode}</span>
          <span className="opacity-60 hidden sm:inline">· Shift since {new Date(session.loginAt).toLocaleTimeString()}</span>
        </div>
        <Button size="sm" variant="secondary" className="h-7 px-2"
          onClick={async () => { await logoutCashier(); setSession(null); }}>
          <LogOut className="h-3.5 w-3.5 mr-1" /> Logout
        </Button>
      </div>
      <Suspense fallback={<div className="p-6">Loading billing…</div>}>
        <POSBillingPage />
      </Suspense>
    </div>
  );
}
