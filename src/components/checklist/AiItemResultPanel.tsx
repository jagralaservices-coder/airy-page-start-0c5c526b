import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ImageOff, HelpCircle } from 'lucide-react';

export interface AiItemResult {
  item_id: string;
  title: string;
  status: 'match' | 'no_match' | 'poor_quality' | 'no_reference' | 'error' | string;
  confidence: number | null;
  reason?: string | null;
  detected_problems?: any;
  suggestions?: string | null;
}

interface Props {
  items: AiItemResult[];
}

const STATUS: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  match:         { label: 'Matched',     color: 'bg-emerald-500/15 text-emerald-500', icon: CheckCircle2 },
  no_match:      { label: 'Not matched', color: 'bg-red-500/15 text-red-500',         icon: XCircle },
  poor_quality:  { label: 'Poor image',  color: 'bg-amber-500/15 text-amber-500',     icon: AlertTriangle },
  no_reference:  { label: 'No reference',color: 'bg-muted text-muted-foreground',     icon: ImageOff },
  error:         { label: 'Error',       color: 'bg-muted text-muted-foreground',     icon: HelpCircle },
};

export const AiItemResultPanel: React.FC<Props> = ({ items }) => {
  if (!items?.length) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">
        No AI verification was run (this checklist has no image items).
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-4 space-y-3">
      <div className="text-sm font-semibold">AI verification results</div>
      <div className="space-y-2">
        {items.map((r) => {
          const meta = STATUS[r.status] ?? STATUS.error;
          const Icon = meta.icon;
          const problems: string[] = Array.isArray(r.detected_problems) ? r.detected_problems : [];
          return (
            <div key={r.item_id} className="rounded-lg border border-border bg-background/40 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm">{r.title}</div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${meta.color}`}>
                  <Icon className="h-3.5 w-3.5" /> {meta.label}
                  {typeof r.confidence === 'number' && (r.status === 'match' || r.status === 'no_match') && (
                    <span className="opacity-70">· {r.confidence}%</span>
                  )}
                </span>
              </div>
              {r.reason && <div className="text-xs text-muted-foreground">{r.reason}</div>}
              {problems.length > 0 && (
                <ul className="text-xs list-disc pl-4 text-muted-foreground">
                  {problems.slice(0, 4).map((p, i) => <li key={i}>{String(p)}</li>)}
                </ul>
              )}
              {r.suggestions && <div className="text-xs italic text-muted-foreground">Tip: {r.suggestions}</div>}
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground pt-1 border-t border-border">
        Results are produced by real AI comparison against the owner's reference images. Items without a reference are skipped.
      </div>
    </div>
  );
};

export default AiItemResultPanel;
