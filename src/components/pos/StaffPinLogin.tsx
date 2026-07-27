import React, { useState } from 'react';
import { User, X, LogIn, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ActiveStaff {
  id: string;
  user_id: string;
  name: string;
  staffCode: string;
  role: string;
  store_id: string;
}

interface StaffPinLoginProps {
  isOpen: boolean;
  onClose: () => void;
  onStaffLogin: (staff: ActiveStaff) => void;
  storeId: string;
  staffList: Array<{
    id: string;
    user_id: string;
    staff_code: string | null;
    full_name?: string;
    role: string;
  }>;
}

export const StaffPinLogin: React.FC<StaffPinLoginProps> = ({
  isOpen,
  onClose,
  onStaffLogin,
  storeId,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      toast.error('Email and password are required');
      return;
    }

    setIsLoading(true);
    try {
      const passwordAttempts = Array.from(new Set([
        trimmedPassword,
        /^\d+$/.test(trimmedPassword) ? `${trimmedPassword}Aa@1` : '',
        /^\d+$/.test(trimmedPassword) ? `${trimmedPassword}#MaxoraPOS!26@Auth` : '',
      ].filter(Boolean)));

      let authData: any = null;
      let authError: any = null;

      for (const candidate of passwordAttempts) {
        const result = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: candidate,
        });
        authData = result.data;
        authError = result.error;
        if (!authError && authData?.user) break;
      }

      if (authError) {
        const { data: staffData, error: staffError } = await supabase.functions.invoke('staff-login', {
          body: {
            email: trimmedEmail,
            password: trimmedPassword,
            store_id: storeId,
          },
        });

        if (!staffError && staffData?.success) {
          if (staffData?.session?.access_token && staffData?.session?.refresh_token) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: staffData.session.access_token,
              refresh_token: staffData.session.refresh_token,
            });
            if (sessionError) throw sessionError;
          }

          localStorage.setItem('pos_active_store_data', JSON.stringify({
            id: staffData.store_id,
            storeId: staffData.store_id,
            storeName: staffData.store_name,
            storeAddress: staffData.store_address,
            storePhone: staffData.store_phone,
            customerId: staffData.customer_id,
            customer_id: staffData.customer_id,
            merchant_id: staffData.merchant_id || staffData.customer_id,
            storeCode: staffData.store_code,
          }));

          const activeStaff: ActiveStaff = {
            id: staffData.staff_role_id || staffData.role_id,
            user_id: staffData.user_id,
            name: staffData.name || 'Staff',
            staffCode: staffData.staff_code || '',
            role: staffData.role,
            store_id: staffData.store_id || storeId,
          };

          localStorage.setItem('pos_staff_session', JSON.stringify({
            id: activeStaff.user_id,
            user_id: activeStaff.user_id,
            auth_user_id: activeStaff.user_id,
            staff_role_id: activeStaff.id,
            role_id: activeStaff.id,
            name: activeStaff.name,
            email: staffData.email || trimmedEmail,
            role: activeStaff.role,
            store_id: activeStaff.store_id,
            customer_id: staffData.customer_id || null,
            merchant_id: staffData.merchant_id || staffData.customer_id || null,
            staff_code: activeStaff.staffCode,
          }));

          window.dispatchEvent(new CustomEvent('pos:active-store-changed'));
          onStaffLogin(activeStaff);
          toast.success(`Welcome, ${activeStaff.name}!`);
          setEmail('');
          setPassword('');
          onClose();
          return;
        }

        toast.error(authError.message.includes('Invalid login') 
          ? 'Invalid email or password' 
          : authError.message);
        return;
      }

      if (!authData.user) {
        toast.error('Login failed');
        return;
      }

      // Verify user has staff role for this store
      const { data: roleRows, error: roleError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', authData.user.id)
        .eq('is_active', true)
        .in('role', ['staff', 'store_manager', 'cashier'])
        .order('created_at', { ascending: false });

      const rolePriority: Record<string, number> = { store_manager: 1, staff: 2, cashier: 3 };
      const roleData = (roleRows || [])
        .filter((row: any) => row.store_id === storeId)
        .sort((a: any, b: any) => (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99))[0];

      if (roleError || !roleData) {
        toast.error('No active staff account found for this email');
        return;
      }

      // Verify store match
      if (roleData.store_id !== storeId) {
        toast.error('This account is not linked to this store');
        return;
      }

      const staffName = authData.user.user_metadata?.full_name || authData.user.email || 'Staff';

      const activeStaff: ActiveStaff = {
        id: roleData.id,
        user_id: authData.user.id,
        name: staffName,
        staffCode: roleData.staff_code || '',
        role: roleData.role,
        store_id: roleData.store_id || storeId,
      };

      // Save staff session
      localStorage.setItem('pos_staff_session', JSON.stringify({
        id: activeStaff.user_id,
        user_id: activeStaff.user_id,
        auth_user_id: activeStaff.user_id,
        staff_role_id: roleData.id,
        role_id: roleData.id,
        name: activeStaff.name,
        role: activeStaff.role,
        store_id: activeStaff.store_id,
        customer_id: roleData.customer_id || null,
        merchant_id: roleData.merchant_id || roleData.customer_id || null,
        staff_code: activeStaff.staffCode,
      }));

      onStaffLogin(activeStaff);
      toast.success(`Welcome, ${activeStaff.name}!`);
      setEmail('');
      setPassword('');
      onClose();
    } catch (error) {
      console.error('Staff login error:', error);
      toast.error('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-lg">Staff Login</h2>
              <p className="text-xs text-muted-foreground">Enter your email & password</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Email + Password Form */}
        <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="staff-email">Email</Label>
            <Input
              id="staff-email"
              type="email"
              placeholder="staff@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-password">Password</Label>
            <div className="relative">
              <Input
                id="staff-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12"
            disabled={!email || !password || isLoading}
          >
            <LogIn className="w-4 h-4 mr-2" />
            {isLoading ? 'Logging in...' : 'Login'}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Use the email & password provided by your admin
        </p>
      </div>
    </div>
  );
};
