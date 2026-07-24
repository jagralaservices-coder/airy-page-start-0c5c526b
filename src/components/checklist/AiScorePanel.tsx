import React from 'react';

const CATEGORY_LABELS: Record<string, string> = {
  uniform: 'Uniform', hair: 'Hair', shoes: 'Shoes', nails: 'Nails',
  cap: 'Cap', mask: 'Mask', gloves: 'Gloves', apron: 'Apron',
  id_card: 'ID Card', face_visible: 'Face Visible', cleanliness: 'Cleanliness',
  beard: 'Beard', overall_grooming: 'Overall Grooming',
};

interface Props {
  categories: Record<string, number>;
  overall: number;
  result: string;
  reason?: string;
}

export const AiScorePanel: React.FC<Props> = ({ categories, overall, result, reason }) => {
  const isPass = result === 'pass' || result === 'ai_pass' || result === 'approved';
  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Overall AI Score</div>
          <div className="text-3xl font-bold">{Math.round(overall)}%</div>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${isPass ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'}`}>
          {isPass ? 'PASS' : 'FAIL'}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {Object.entries(categories ?? {}).map(([k, v]) => (
          <div key={k} className="rounded-lg bg-muted/40 p-2">
            <div className="text-xs text-muted-foreground">{CATEGORY_LABELS[k] ?? k}</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${Number(v) >= 75 ? 'bg-emerald-500' : Number(v) >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, Math.max(0, Number(v)))}%` }} />
              </div>
              <span className="text-sm font-medium tabular-nums">{Math.round(Number(v))}%</span>
            </div>
          </div>
        ))}
      </div>
      {reason && (
        <div className="text-sm text-muted-foreground border-t border-border pt-2">
          <span className="font-medium text-foreground">Reason: </span>{reason}
        </div>
      )}
    </div>
  );
};

export default AiScorePanel;
