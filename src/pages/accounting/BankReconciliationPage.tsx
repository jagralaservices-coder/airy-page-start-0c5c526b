import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingContext } from '@/lib/accounting/useAccountingContext';
import { exportCSV, inr } from '@/lib/accounting/exportUtils';
import { Upload, Download, Link2 } from 'lucide-react';
import { toast } from 'sonner';

interface BT {
  id: string; txn_date: string; description: string | null; reference: string | null;
  debit: number; credit: number; match_status: string; balance: number | null;
}

// Minimal CSV parser (RFC-lite): handles quoted fields
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (cur !== '' || row.length) { row.push(cur); rows.push(row); row = []; cur = ''; } if (c === '\r' && text[i + 1] === '\n') i++; }
      else cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

export default function BankReconciliationPage() {
  const { merchantId, storeId } = useAccountingContext();
  const [accounts, setAccounts] = useState<Array<{ id: string; bank_name: string; account_name: string }>>([]);
  const [accountId, setAccountId] = useState('');
  const [rows, setRows] = useState<BT[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!accountId || !merchantId) return;
    const { data } = await supabase.from('bank_transactions').select('*').eq('merchant_id', merchantId).eq('bank_account_id', accountId).order('txn_date', { ascending: false }).limit(1000);
    setRows((data ?? []) as any);
  };

  useEffect(() => {
    if (!merchantId) return;
    supabase.from('bank_accounts').select('id,bank_name,account_name').eq('merchant_id', merchantId).eq('is_active', true).then(({ data }) => {
      setAccounts((data ?? []) as any);
      if (data?.length && !accountId) setAccountId(data[0].id);
    });
  }, [merchantId]);

  useEffect(() => { load(); }, [accountId, merchantId]);

  const importFile = async (file: File) => {
    if (!accountId || !merchantId) { toast.error('Select bank account'); return; }
    const text = await file.text();
    const grid = parseCSV(text).filter((r) => r.some((c) => c.trim()));
    if (grid.length < 2) { toast.error('Empty file'); return; }
    const header = grid[0].map((h) => h.trim().toLowerCase());
    const idx = (names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
    const iDate = idx(['date', 'txn date', 'transaction date', 'value date']);
    const iDesc = idx(['description', 'narration', 'particulars', 'details']);
    const iRef = idx(['reference', 'ref', 'chq no', 'utr', 'ref no']);
    const iDebit = idx(['debit', 'withdrawal', 'withdrawal amt.']);
    const iCredit = idx(['credit', 'deposit', 'deposit amt.']);
    const iBal = idx(['balance', 'running balance', 'closing balance']);
    if (iDate < 0) { toast.error('CSV needs a Date column'); return; }
    const inserts = grid.slice(1).map((r) => {
      const d = r[iDate]?.trim();
      const dateISO = /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
      const num = (v: string | undefined) => Number((v ?? '').replace(/[,₹\s]/g, '')) || 0;
      return {
        merchant_id: merchantId, store_id: storeId, bank_account_id: accountId,
        txn_date: dateISO,
        description: iDesc >= 0 ? r[iDesc] : null,
        reference: iRef >= 0 ? r[iRef] : null,
        debit: iDebit >= 0 ? num(r[iDebit]) : 0,
        credit: iCredit >= 0 ? num(r[iCredit]) : 0,
        balance: iBal >= 0 ? num(r[iBal]) : null,
        match_status: 'unmatched',
      };
    }).filter((r) => r.debit || r.credit);
    if (!inserts.length) { toast.error('No rows parsed'); return; }
    const { error } = await supabase.from('bank_transactions').insert(inserts);
    if (error) { toast.error(error.message); return; }
    toast.success(`Imported ${inserts.length} lines`);
    load();
  };

  const autoMatch = async () => {
    if (!merchantId) return;
    const unmatched = rows.filter((r) => r.match_status === 'unmatched');
    if (!unmatched.length) { toast.info('Nothing to match'); return; }
    const refs = unmatched.map((r) => r.reference).filter(Boolean) as string[];
    const [{ data: pays }, { data: supPays }] = await Promise.all([
      refs.length ? supabase.from('payments').select('id,reference,amount').in('reference', refs) : Promise.resolve({ data: [] as any[] }),
      refs.length ? supabase.from('supplier_payments').select('id,reference,amount').in('reference', refs) : Promise.resolve({ data: [] as any[] }),
    ]);
    const payMap = new Map<string, any>();
    (pays ?? []).forEach((p: any) => payMap.set(p.reference, { amt: Number(p.amount), type: 'pay' }));
    (supPays ?? []).forEach((p: any) => payMap.set(p.reference, { amt: Number(p.amount), type: 'supplier' }));
    let matched = 0, partial = 0;
    for (const r of unmatched) {
      if (!r.reference) continue;
      const p = payMap.get(r.reference);
      if (!p) continue;
      const amt = r.credit || r.debit;
      const status = Math.abs(amt - p.amt) < 0.01 ? 'matched' : 'partial';
      await supabase.from('bank_transactions').update({ match_status: status, matched_payment_id: p.id ?? null }).eq('id', r.id);
      if (status === 'matched') matched++; else partial++;
    }
    toast.success(`Matched ${matched}, partial ${partial}`);
    load();
  };

  const summary = useMemo(() => {
    const s = { matched: 0, unmatched: 0, partial: 0, credit: 0, debit: 0 };
    rows.forEach((r) => {
      s[r.match_status as 'matched' | 'unmatched' | 'partial']++;
      s.credit += Number(r.credit); s.debit += Number(r.debit);
    });
    return s;
  }, [rows]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bank Reconciliation</h1>
          <p className="text-sm text-muted-foreground">Import statement, auto-match against payments, review unmatched</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-1" />Import CSV</Button>
          <Button variant="outline" size="sm" onClick={autoMatch}><Link2 className="h-4 w-4 mr-1" />Auto-Match</Button>
          <Button variant="outline" size="sm" onClick={() => exportCSV('bank-reconciliation', rows)}><Download className="h-4 w-4 mr-1" />Export</Button>
        </div>
      </div>
      <div className="flex gap-2 items-end">
        <div className="w-72"><Label className="text-xs">Bank Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.bank_name} — {a.account_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Matched</div><div className="text-lg font-semibold text-green-600">{summary.matched}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Unmatched</div><div className="text-lg font-semibold text-amber-600">{summary.unmatched}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Partial</div><div className="text-lg font-semibold">{summary.partial}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Credits</div><div className="text-base font-mono">{inr(summary.credit)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Debits</div><div className="text-base font-mono">{inr(summary.debit)}</div></CardContent></Card>
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Statement Lines ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr>
              <th className="p-2 pl-4">Date</th><th className="p-2">Description</th><th className="p-2">Ref</th>
              <th className="p-2 text-right">Debit</th><th className="p-2 text-right">Credit</th>
              <th className="p-2 text-right">Balance</th><th className="p-2 pr-4">Status</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Import a bank statement CSV to start reconciling</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 pl-4">{r.txn_date}</td>
                  <td className="p-2 text-xs">{r.description}</td>
                  <td className="p-2 font-mono text-xs">{r.reference}</td>
                  <td className="p-2 text-right font-mono">{r.debit ? inr(r.debit) : ''}</td>
                  <td className="p-2 text-right font-mono">{r.credit ? inr(r.credit) : ''}</td>
                  <td className="p-2 text-right font-mono">{r.balance ? inr(r.balance) : ''}</td>
                  <td className="p-2 pr-4"><Badge variant={r.match_status === 'matched' ? 'default' : r.match_status === 'partial' ? 'secondary' : 'outline'}>{r.match_status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
