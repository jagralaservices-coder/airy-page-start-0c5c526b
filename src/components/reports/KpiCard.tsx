import React from 'react';
import { cn } from '@/lib/utils';
import { ArrowUpRight } from 'lucide-react';

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'primary' | 'success' | 'warning' | 'destructive' | 'muted';
  onClick?: () => void;
  icon?: React.ReactNode;
}

const toneMap: Record<NonNullable<Props['tone']>, string> = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  muted: 'text-foreground',
};

export const KpiCard: React.FC<Props> = ({ label, value, hint, tone = 'muted', onClick, icon }) => {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={cn(
        'group text-left bg-card border border-border rounded-2xl p-3 sm:p-4 min-w-0 transition-all',
        clickable ? 'hover:border-primary/60 hover:shadow-sm active:scale-[0.99] cursor-pointer' : 'cursor-default'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-semibold leading-tight break-words">{label}</p>
        {clickable && <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0" />}
      </div>
      <p className={cn('text-base sm:text-2xl font-bold mt-1 truncate', toneMap[tone])} title={String(value)}>{value}</p>
      {hint && <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 truncate">{hint}</p>}
    </button>
  );
};

export default KpiCard;
