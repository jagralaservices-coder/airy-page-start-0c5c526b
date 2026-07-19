import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, User } from 'lucide-react';
import { loginCashier } from '@/lib/cashier';

interface Props {
  storeId: string;
  storeName?: string;
  onSuccess: () => void;
}

export const CashierPinLogin: React.FC<Props> = ({ storeId, storeName, onSuccess }) => {
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!identifier.trim() || pin.length < 4) {
      toast.error('Enter Cashier Email/Name and a 4+ digit PIN');
      return;
    }
    setLoading(true);
    try {
      await loginCashier(storeId, identifier.trim(), pin.trim());
      toast.success('Welcome back, cashier!');
      onSuccess();
    } catch (e: any) {
      toast.error(e?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const press = (d: string) => setPin((p) => (p.length < 8 ? p + d : p));
  const clear = () => setPin('');
  const back = () => setPin((p) => p.slice(0, -1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-primary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-5 shadow-2xl">
        <div className="text-center space-y-1">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Cashier Login</h1>
          <p className="text-sm text-muted-foreground">{storeName || 'Billing terminal'}</p>
        </div>

        <div className="space-y-2">
          <Label>Email ID or Name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. cashier@example.com or Ravi"
              className="pl-9 h-11"
              autoFocus
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>PIN</Label>
          <Input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="••••"
            className="h-12 text-center text-2xl tracking-[0.5em] font-bold"
            maxLength={8}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <Button key={n} variant="outline" className="h-14 text-xl font-semibold" onClick={() => press(String(n))}>
              {n}
            </Button>
          ))}
          <Button variant="outline" className="h-14 text-sm" onClick={clear}>Clear</Button>
          <Button variant="outline" className="h-14 text-xl font-semibold" onClick={() => press('0')}>0</Button>
          <Button variant="outline" className="h-14 text-sm" onClick={back}>⌫</Button>
        </div>

        <Button className="w-full h-12 text-base bg-primary text-primary-foreground" disabled={loading} onClick={submit}>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign in & Start Shift'}
        </Button>
      </Card>
    </div>
  );
};

export default CashierPinLogin;
