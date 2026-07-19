import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { ensureCoaSeeded } from '@/lib/accounting/postingEngine';
import { toast } from 'sonner';

export default function AccountingSettings() {
  const { merchantId } = useAccountingContext();
  const seed = async () => {
    if (!merchantId) return;
    await ensureCoaSeeded(merchantId);
    toast.success('Default Chart of Accounts ensured');
  };
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Accounting Settings</h1>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Chart of Accounts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">Install the default Indian Chart of Accounts if not already present.</p>
          <Button onClick={seed}>Install Default COA</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Auto Posting</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Bills, refunds, purchases, expenses, credit payments and gateway settlements will automatically post
            balanced double-entry journals to the ledger. Offline transactions post when they sync.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
