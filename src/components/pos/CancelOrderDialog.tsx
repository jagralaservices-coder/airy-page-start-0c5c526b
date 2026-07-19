import React, { useState } from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Lock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useLocale } from '@/contexts/LocaleContext';

interface CancelOrderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, foodPrepared: boolean) => void;
  orderNumber: string;
}

export const CancelOrderDialog: React.FC<CancelOrderDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  orderNumber,
}) => {
  const { t } = useLocale();
  const { user } = useSupabaseAuth();
  const [password, setPassword] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [foodPrepared, setFoodPrepared] = useState<'yes' | 'no' | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');

  const handleVerifyAndCancel = async () => {
    if (!password) {
      setError(t('msg.passwordRequired'));
      return;
    }

    if (!cancelReason.trim()) {
      setError(t('msg.cancelReasonRequired'));
      return;
    }

    if (foodPrepared === null) {
      setError('Please confirm whether the food was prepared');
      return;
    }

    if (!user?.email) {
      setError(t('msg.userNotLoggedIn'));
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      // Verify password via dedicated endpoint — does NOT replace the
      // caller's auth session (previous signInWithPassword call rotated the
      // JWT and fired a SIGNED_IN event on every cancel).
      const { data, error: authError } = await supabase.functions.invoke('verify-user-password', {
        body: { password, email: user.email },
      });

      if (authError || !data?.valid) {
        setError(t('msg.incorrectPassword'));
        setIsVerifying(false);
        return;
      }


      // Password verified - proceed with cancellation
      onConfirm(cancelReason.trim(), foodPrepared === 'yes');
      handleClose();
      toast.success(`${t('common.orderNo')} ${orderNumber} ${t('msg.orderCancelledSuccess')}`);
    } catch (err) {
      setError(t('msg.verifyFailed'));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setCancelReason('');
    setFoodPrepared(null);
    setError('');
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <AlertDialogTitle>{t('cancelOrder.title')} #{orderNumber}?</AlertDialogTitle>
              <AlertDialogDescription className="mt-1">
                {t('cancelOrder.cannotBeUndone')}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {/* Cancel Reason */}
          <div className="space-y-2">
            <Label htmlFor="cancelReason">{t('cancelOrder.reasonLabel')} *</Label>
            <Textarea
              id="cancelReason"
              placeholder={t('cancelOrder.reasonPlaceholder')}
              value={cancelReason}
              onChange={(e) => {
                setCancelReason(e.target.value);
                setError('');
              }}
              className="min-h-[80px]"
            />
          </div>

          {/* Food Prepared? — controls inventory deduction */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              🍳 Was the food already prepared? *
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={foodPrepared === 'yes' ? 'default' : 'outline'}
                onClick={() => { setFoodPrepared('yes'); setError(''); }}
                className="w-full"
              >
                Yes — deduct inventory
              </Button>
              <Button
                type="button"
                variant={foodPrepared === 'no' ? 'default' : 'outline'}
                onClick={() => { setFoodPrepared('no'); setError(''); }}
                className="w-full"
              >
                No — keep inventory
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Yes: raw materials were used, stock will be reduced. No: ingredients are still in stock.
            </p>
          </div>


          {/* Password Verification */}
          <div className="space-y-2">
            <Label htmlFor="password" className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              {t('cancelOrder.passwordLabel')} *
            </Label>
            <Input
              id="password"
              type="password"
              placeholder={t('cancelOrder.passwordPlaceholder')}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isVerifying) {
                  handleVerifyAndCancel();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              {t('cancelOrder.passwordHint')}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium">
              {error}
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isVerifying}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleVerifyAndCancel}
            disabled={isVerifying}
            className="min-w-[150px] font-semibold"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('cancelOrder.verifying')}
              </>
            ) : (
              t('cancelOrder.confirmCancel')
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
