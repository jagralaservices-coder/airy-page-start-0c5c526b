import React, { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

export interface ReuploadItem { id: string; title: string; status?: string; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: ReuploadItem[];
  onConfirm: (itemIds: string[], notes: string) => Promise<void>;
}

export const RequestReuploadDialog: React.FC<Props> = ({ open, onOpenChange, items, onConfirm }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (open) {
      // Preselect items that failed AI so owner just confirms.
      const failed = items.filter(i => i.status === 'no_match' || i.status === 'poor_quality').map(i => i.id);
      setSelected(new Set(failed.length ? failed : items.map(i => i.id)));
      setNotes('');
    }
  }, [open, items]);

  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const submit = async () => {
    if (!selected.size) return;
    setBusy(true);
    try { await onConfirm(Array.from(selected), notes.trim()); onOpenChange(false); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Request re-upload</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Pick the items the staff must redo. The submission will unlock only for these items.</p>
        <div className="space-y-2 max-h-72 overflow-auto">
          {items.map(it => (
            <label key={it.id} className="flex items-start gap-2 rounded-md border border-border p-2 cursor-pointer">
              <Checkbox checked={selected.has(it.id)} onCheckedChange={() => toggle(it.id)} />
              <div className="flex-1">
                <div className="text-sm font-medium">{it.title}</div>
                {it.status && <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{it.status.replace('_', ' ')}</div>}
              </div>
            </label>
          ))}
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes for staff (optional)…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[70px]"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !selected.size}>{busy ? 'Requesting…' : 'Request re-upload'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RequestReuploadDialog;
