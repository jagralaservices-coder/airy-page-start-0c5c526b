import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, LayoutDashboard, BookOpen, ListTree, ScrollText, BarChart3, Landmark, Receipt,
  Building, Wallet, FileSpreadsheet, Settings2, ClipboardList, HandCoins, Users, UsersRound,
  Repeat2, Link2, Target, PieChart, Layers, Boxes, TrendingDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const sections: Array<{ title: string; items: Array<{ to: string; label: string; icon: any; end?: boolean }> }> = [
  {
    title: 'Overview',
    items: [
      { to: '/accounting', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/accounting/chart-of-accounts', label: 'Chart of Accounts', icon: ListTree },
      { to: '/accounting/journal', label: 'Journal', icon: ScrollText },
      { to: '/accounting/general-ledger', label: 'General Ledger', icon: BookOpen },
    ],
  },
  {
    title: 'Statements',
    items: [
      { to: '/accounting/trial-balance', label: 'Trial Balance', icon: FileSpreadsheet },
      { to: '/accounting/profit-loss', label: 'Profit & Loss', icon: BarChart3 },
      { to: '/accounting/balance-sheet', label: 'Balance Sheet', icon: Landmark },
      { to: '/accounting/cash-flow', label: 'Cash Flow', icon: Wallet },
    ],
  },
  {
    title: 'Receivables & Payables',
    items: [
      { to: '/accounting/ar-aging', label: 'A/R Aging', icon: ClipboardList },
      { to: '/accounting/ap', label: 'Accounts Payable', icon: HandCoins },
      { to: '/accounting/supplier-ledger', label: 'Supplier Ledger', icon: Users },
      { to: '/accounting/partner-ledger', label: 'Partner Ledger', icon: UsersRound },
    ],
  },
  {
    title: 'Cash & Banking',
    items: [
      { to: '/accounting/banking', label: 'Banking', icon: Building },
      { to: '/accounting/bank-reconciliation', label: 'Bank Reconciliation', icon: Link2 },
      { to: '/accounting/settlement-report', label: 'Settlement Report', icon: Repeat2 },
      { to: '/accounting/payment-reconciliation', label: 'Payment Recon', icon: PieChart },
    ],
  },
  {
    title: 'Planning',
    items: [
      { to: '/accounting/budgets', label: 'Budgets', icon: Target },
      { to: '/accounting/budget-vs-actual', label: 'Budget vs Actual', icon: BarChart3 },
      { to: '/accounting/cost-centers', label: 'Cost Centers', icon: Layers },
      { to: '/accounting/cost-center-report', label: 'Cost Center Analysis', icon: PieChart },
    ],
  },
  {
    title: 'Assets',
    items: [
      { to: '/accounting/fixed-assets', label: 'Fixed Assets', icon: Boxes },
      { to: '/accounting/depreciation', label: 'Depreciation', icon: TrendingDown },
    ],
  },
  {
    title: 'Compliance',
    items: [
      { to: '/accounting/tax', label: 'Tax / GST', icon: Receipt },
      { to: '/accounting/settings', label: 'Settings', icon: Settings2 },
    ],
  },
];

export default function AccountingLayout() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full min-h-screen bg-background">
      <aside className="w-60 border-r bg-card shrink-0 hidden md:flex md:flex-col">
        <div className="p-4 border-b flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => navigate('/operations')} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="font-semibold text-sm">Accounting</div>
            <div className="text-[11px] text-muted-foreground">Enterprise books</div>
          </div>
        </div>
        <nav className="p-2 overflow-y-auto flex-1 space-y-3">
          {sections.map((s) => (
            <div key={s.title}>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{s.title}</div>
              <div className="space-y-0.5">
                {s.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
                        isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-foreground'
                      )
                    }
                  >
                    <n.icon className="h-4 w-4" />
                    <span>{n.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
