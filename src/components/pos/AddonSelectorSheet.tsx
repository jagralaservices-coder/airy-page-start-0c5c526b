import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Minus, Plus } from 'lucide-react';
import { Addon, getAddons } from '@/lib/addons';
import { formatCurrency } from '@/lib/store';

interface AddonSelectorSheetProps {
  isOpen: boolean;
  parentName: string;
  onClose: () => void;
  onConfirm: (selected: Array<{ addon: Addon; quantity: number }>) => void;
}

export const AddonSelectorSheet: React.FC<AddonSelectorSheetProps> = ({
  isOpen,
  parentName,
  onClose,
  onConfirm,
}) => {
  const [addons, setAddons] = useState<Addon[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isOpen) return;
    setAddons(getAddons().filter(a => a.isAvailable));
    setQuantities({});
  }, [isOpen]);

  const setQty = (id: string, delta: number) => {
    setQuantities(prev => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      return { ...prev, [id]: next };
    });
  };

  const totalAddons = Object.values(quantities).reduce((s, q) => s + q, 0);

  const handleSkip = () => {
    onConfirm([]);
    onClose();
  };

  const handleSave = () => {
    const selected = addons
      .map(a => ({ addon: a, quantity: quantities[a.id] || 0 }))
      .filter(x => x.quantity > 0);
    onConfirm(selected);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleSkip()}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        <DialogHeader className="p-4 pb-2 border-b border-border">
          <DialogTitle className="text-base font-medium">
            Add Addons — {parentName}
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
          {addons.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No addons available
            </p>
          ) : (
            addons.map(a => {
              const qty = quantities[a.id] || 0;
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{a.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(a.price)}
                      {a.category && <span> • {a.category}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setQty(a.id, -1)}
                      disabled={qty === 0}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="min-w-[24px] text-center font-semibold">{qty}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setQty(a.id, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 pt-2 border-t border-border">
          <Button variant="outline" onClick={handleSkip}>
            Skip
          </Button>
          <Button
            onClick={handleSave}
            disabled={totalAddons === 0}
            className="bg-primary hover:bg-primary/90"
          >
            Add {totalAddons > 0 ? `(${totalAddons})` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
