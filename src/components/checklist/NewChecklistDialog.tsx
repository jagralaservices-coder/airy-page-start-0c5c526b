import React, { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const SHIFT_TYPES = ['Opening', 'Mid Shift', 'Closing', 'Any Shift', 'Custom Shift'] as const;
const SCHEDULES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'once', label: 'One Time' },
  { value: 'custom', label: 'Custom' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (payload: { name: string; shift_type: string; frequency: string }) => Promise<void>;
}

export const NewChecklistDialog: React.FC<Props> = ({ open, onOpenChange, onCreate }) => {
  const [name, setName] = useState('');
  const [shiftType, setShiftType] = useState('Any Shift');
  const [frequency, setFrequency] = useState('daily');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), shift_type: shiftType, frequency });
      setName(''); setShiftType('Any Shift'); setFrequency('daily');
      onOpenChange(false);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New Checklist</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Checklist name *</label>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Morning Opening Checklist" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Shift Type</label>
              <select className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm" value={shiftType} onChange={e => setShiftType(e.target.value)}>
                {SHIFT_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Frequency</label>
              <select className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm" value={frequency} onChange={e => setFrequency(e.target.value)}>
                {SCHEDULES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create & Edit'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewChecklistDialog;
