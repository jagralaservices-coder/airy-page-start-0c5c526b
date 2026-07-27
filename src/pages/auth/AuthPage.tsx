import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { usePOS } from '@/contexts/POSContext';
import { useToast } from '@/hooks/use-toast';
import { useLocale } from '@/contexts/LocaleContext';
import { Eye, EyeOff, ArrowLeft, LogIn, Check, Clock, Crown, Building2, Store } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useOTP } from '@/hooks/useOTP';
import { ADDONS_PRICING } from '@/lib/subscriptionConfig';

const AuthPage: React.FC = () => {
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  
  const [loginEmail, setLoginEmail] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  
  // Owner specifics
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<'retail' | 'restaurant'>('retail');
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  
  // Store specifics
  const [storeName, setStoreName] = useState('');
  const [ownerCode, setOwnerCode] = useState('');
  
  // OTP specifics
  const [otp, setOtp] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loginErrorMsg, setLoginErrorMsg] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState(false);
  
  // Routing states
  const [isSignup, setIsSignup] = useState(searchParams.get('signup') === 'true');
  const [signupStep, setSignupStep] = useState<'role_selection' | 'owner_form' | 'store_form' | 'otp' | 'membership' | 'addons' | 'pending' | 'form'>('form');
  const [signupComplete, setSignupComplete] = useState(false);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  
  const navigate = useNavigate();
  const { login, signup, resetPassword, isLoading: authLoading, userRole, isAuthenticated } = useSupabaseAuth();
  const { loginStore } = usePOS();
  const { toast } = useToast();
  const { sendOTP, verifyOTP, countdown, resetOTPState, isSent } = useOTP();

  const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T | null> =>
    Promise.race([
      Promise.resolve(p),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);

  const ownerSignupSchema = z.object({
    email: z.string().email(t('auth.validEmail')),
    password: z.string().min(6, t('auth.passwordMinLength')),
    fullName: z.string().min(1, t('auth.fullNameRequired')),
    phone: z.string().min(10, t('auth.phoneRequired')),
    businessName: z.string().min(1, t('auth.businessNameRequired')),
  });

  const storeSignupSchema = z.object({
    storeName: z.string().min(1, 'Store Name is required'),
    ownerCode: z.string().min(1, 'Owner Email or Code is required'),
    phone: z.string().min(10, t('auth.phoneRequired')),
    password: z.string().min(6, t('auth.passwordMinLength')),
  });

  useEffect(() => {
    if (isSignup && signupStep === 'form') {
      setSignupStep('role_selection');
    }
  }, [isSignup, signupStep]);

  useEffect(() => {
    if (localStorage.getItem('pos_account_suspended') === 'true') {
      localStorage.removeItem('pos_account_suspended');
      navigate('/account-suspended', { replace: true });
    }
  }, [navigate]);

  const redirectByRole = (role: string) => {
    const lastPath = localStorage.getItem('pos_last_path');
    if (lastPath) {
      localStorage.removeItem('pos_last_path');
    }
    
    if (role !== 'admin' && role !== 'super_admin' && role !== 'owner' && role !== 'merchant' && lastPath && lastPath.startsWith('/') && !lastPath.startsWith('//') && lastPath !== '/' && lastPath !== '/auth' && lastPath !== '/reset-password' && !lastPath.startsWith('/admin')) {
      try {
        navigate(lastPath, { replace: true });
        return;
      } catch (e) {}
    }
    switch (role) {
      case 'super_admin': 
      case 'admin': navigate('/admin/dashboard', { replace: true }); break;
      case 'owner':
      case 'merchant': navigate('/dashboard', { replace: true }); break;
      case 'store_manager': navigate('/pos', { replace: true }); break;
      case 'cashier': navigate('/pos', { replace: true }); break;
      case 'staff': navigate('/staff-dashboard', { replace: true }); break;
      default: navigate('/dashboard', { replace: true });
    }
  };

  const isStoreIdentifier = (value: string) => /^[0-9A-F]{8}$/i.test(value.trim()) || /^STR[0-9]{5}$/i.test(value.trim());
  const isStaffIdentifier = (value: string) => /^[0-9]{8}$/.test(value.trim()) || /^(STF|MGR|CSH)[0-9]{5}$/i.test(value.trim());

  const applyStaffFunctionSession = (data: any, fallbackEmail: string) => {
    console.info('[STAFF_AUTH] STAFF FOUND src/pages/auth/AuthPage.tsx:120', {
      auth_user_id: data.user_id || null,
      role_id: data.staff_role_id || data.role_id || null,
      role: data.role || null,
    });

    localStorage.setItem('pos_active_store_data', JSON.stringify({
      id: data.store_id,
      storeId: data.store_id,
      storeName: data.store_name,
      storeAddress: data.store_address,
      storePhone: data.store_phone,
      customerId: data.customer_id,
      customer_id: data.customer_id,
      merchant_id: data.merchant_id || data.customer_id,
      storeCode: data.store_code,
    }));

    const staffSession = {
      id: data.user_id,
      user_id: data.user_id,
      auth_user_id: data.user_id,
      staff_role_id: data.staff_role_id || data.role_id,
      role_id: data.staff_role_id || data.role_id,
      name: data.name || 'Staff',
      email: data.email || fallbackEmail,
      role: data.role,
      store_id: data.store_id,
      store_name: data.store_name,
      customer_id: data.customer_id,
      merchant_id: data.merchant_id || data.customer_id,
      staff_code: data.staff_code || null,
    };

    localStorage.setItem('pos_staff_session', JSON.stringify(staffSession));
    localStorage.setItem('pos_staff_login_mode', 'true');
    localStorage.setItem('logged_in_staff', JSON.stringify({
      id: data.user_id,
      staff_role_id: data.staff_role_id || data.role_id,
      name: staffSession.name,
      role: data.role,
      phone: data.store_phone || '',
      store_id: data.store_id,
      customer_id: data.customer_id,
      merchant_id: data.merchant_id || data.customer_id,
    }));
    window.dispatchEvent(new CustomEvent('pos:active-store-changed'));
    console.info('[STAFF_AUTH] STORE FOUND src/pages/auth/AuthPage.tsx:166', {
      store_id: data.store_id || null,
      store_name: data.store_name || null,
      merchant_id: data.merchant_id || data.customer_id || null,
    });
  };

  const goToStaffDashboard = () => {
    setTimeout(() => {
      try {
        navigate('/staff-dashboard', { replace: true });
      } catch (_) {
        try { window.location.replace('/staff-dashboard'); } catch (e) {}
      }
      setTimeout(() => {
        if (window.location.pathname === '/auth') {
          try { window.location.replace('/staff-dashboard'); } catch (_) {}
        }
      }, 500);
    }, 80);
  };

  const hydrateStaffAuthSession = async (staffData: any, rawPassword: string) => {
    if (staffData?.session?.access_token && staffData?.session?.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: staffData.session.access_token,
        refresh_token: staffData.session.refresh_token,
      });
      if (!error) {
        console.info('[STAFF_AUTH] SESSION FOUND src/pages/auth/AuthPage.tsx:181', {
          auth_user_id: staffData.session.user?.id || staffData.user_id || null,
        });
        return true;
      }
      console.warn('[STAFF_AUTH] SESSION LOST src/pages/auth/AuthPage.tsx:186', { error: error.message });
    }

    const staffEmail = String(staffData?.email || '').trim().toLowerCase();
    if (!staffEmail) return false;

    const passwordValue = rawPassword.trim();
    const candidates = Array.from(new Set([
      passwordValue,
      /^\d+$/.test(passwordValue) ? `${passwordValue}Aa@1` : '',
      /^\d+$/.test(passwordValue) ? `${passwordValue}#MaxoraPOS!26@Auth` : '',
    ].filter(Boolean)));

    for (const candidate of candidates) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: staffEmail,
        password: candidate,
      });
      if (!error && data?.session) {
        console.info('[STAFF_AUTH] SESSION FOUND src/pages/auth/AuthPage.tsx:203', { auth_user_id: data.session.user.id });
        return true;
      }
    }
    console.warn('[STAFF_AUTH] SESSION LOST src/pages/auth/AuthPage.tsx:207', { auth_user_id: staffData?.user_id || null });
    return false;
  };

  const clearBrowserAuthForStaffSession = async () => {
    localStorage.removeItem('pos_staff_login_mode');
    localStorage.removeItem('pos_staff_session');
    localStorage.removeItem('logged_in_staff');
    localStorage.removeItem('pos_account_suspended');
    localStorage.removeItem('pos_session_active');
    localStorage.removeItem('pos_session_backup');
    localStorage.removeItem('pos_user_backup');
    localStorage.removeItem('pos_user_role_backup');
    localStorage.removeItem('pos_customer_backup');
    localStorage.removeItem('pos_store_backup');
    localStorage.removeItem('pos_is_store_login');
  };

  useEffect(() => {
    if (!loginSuccess || !isAuthenticated) return;
    if (userRole) {
      setIsLoading(false);
      redirectByRole(userRole.role);
    }
  }, [loginSuccess, isAuthenticated, userRole, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoginErrorMsg(null);
    const trimmedEmail = loginEmail.trim();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) {
      setErrors({ loginEmail: !trimmedEmail ? t('auth.validEmail') : '', password: !trimmedPassword ? t('auth.passwordRequired') : '' });
      return;
    }
    setIsLoading(true);
    try {
      console.info('[STAFF_AUTH] LOGIN START src/pages/auth/AuthPage.tsx:235', { identifier: trimmedEmail });
      if (!trimmedEmail.includes('@')) {
        if (isStaffIdentifier(trimmedEmail)) {
          let staffAttemptError = 'Invalid Staff ID or PIN';
          try {
            const { data: staffData, error: staffError } = await supabase.functions.invoke('staff-login', {
              body: { staff_code: trimmedEmail, password: trimmedPassword }
            });

            if (!staffError && staffData?.success) {
              await clearBrowserAuthForStaffSession();
              const hydrated = await hydrateStaffAuthSession(staffData, trimmedPassword);
              if (!hydrated) {
                setIsLoading(false);
                setLoginErrorMsg('Staff session could not be created. Please reset this staff PIN.');
                toast({ title: t('auth.loginFailed'), description: 'Staff session could not be created. Please reset this staff PIN.', variant: 'destructive' });
                return;
              }
              applyStaffFunctionSession(staffData, staffData.email || `${trimmedEmail}@maxora.local`);
              setIsLoading(false);
              toast({ title: 'Login successful', description: `Welcome ${staffData.name || 'Staff'}` });
              console.info('[STAFF_AUTH] REDIRECT DASHBOARD src/pages/auth/AuthPage.tsx:259', { path: '/staff-dashboard' });
              goToStaffDashboard();
              return;
            }
            staffAttemptError = staffData?.error || staffError?.message || staffAttemptError;
          } catch (error: any) {
            staffAttemptError = error?.message || staffAttemptError;
          }

          if (isStoreIdentifier(trimmedEmail)) {
            const store = await withTimeout(loginStore(trimmedEmail, trimmedPassword), 8000);
            setIsLoading(false);
            if (store) {
              toast({ title: 'Login successful', description: `Welcome ${store.name}` });
              navigate('/pos', { replace: true });
              return;
            }
          }

          setIsLoading(false);
          setLoginErrorMsg(staffAttemptError);
          toast({ title: t('auth.loginFailed'), description: staffAttemptError, variant: 'destructive' });
          return;
        }

        // Store ID/code login must take priority over cashier username login.
        // Android WebView was trying `<storeId>@maxora.local` first, which could
        // show cashier-login errors or delay the real store login path.
        if (isStoreIdentifier(trimmedEmail)) {
          const store = await withTimeout(loginStore(trimmedEmail, trimmedPassword), 8000);
          setIsLoading(false);
          if (!store) {
            setLoginErrorMsg('Invalid Store ID or Password.');
            toast({ title: t('auth.loginFailed'), description: 'Invalid store credentials', variant: 'destructive' });
            return;
          }
          toast({ title: 'Login successful', description: `Welcome ${store.name}` });
          navigate('/pos', { replace: true });
          return;
        }

        // First try to resolve as Cashier ID / Username by constructing the dummy email
        const cashierEmail = `${trimmedEmail.toLowerCase()}@maxora.local`;
        const passToTry = /^\d+$/.test(trimmedPassword) ? trimmedPassword + 'Aa@1' : trimmedPassword;
        const cashierLoginResult = await withTimeout(login(cashierEmail, passToTry), 8000);
        const cashierError = cashierLoginResult?.error ?? 'Login timed out. Please check your network and try again.';
        
        if (!cashierError) {
          setLoginSuccess(true);
          if (cashierLoginResult?.role) {
            setIsLoading(false);
            redirectByRole(cashierLoginResult.role);
            return;
          }
          // Same fallback check as below
          try {
            const sessionDataRes = await withTimeout(supabase.auth.getSession(), 3000);
            const sessionData = (sessionDataRes as any)?.data;
            const uid = sessionData?.session?.user?.id;
            if (uid) {
              const roleRes = await withTimeout(supabase.from('user_roles').select('role').eq('user_id', uid).maybeSingle(), 3000);
              const roleRow = (roleRes as any)?.data;
              if (roleRow?.role) {
                redirectByRole(roleRow.role);
                return;
              }
            }
          } catch (e) {}
          return;
        }

        // If not a cashier (or wrong password), try store PIN login
        const store = await withTimeout(loginStore(trimmedEmail, trimmedPassword), 8000);
        setIsLoading(false);
        if (!store) {
          // If store login also fails, show the error from the cashier attempt
          if (/suspend/i.test(cashierError)) {
            navigate('/account-suspended', { replace: true });
            return;
          }
          setLoginErrorMsg('Invalid Cashier ID, Store Code, or Password.');
          toast({ title: t('auth.loginFailed'), description: 'Invalid credentials', variant: 'destructive' });
          return;
        }
        toast({ title: 'Login successful', description: `Welcome ${store.name}` });
        navigate('/pos', { replace: true });
        return;
      }

      if (trimmedEmail.includes('@') && /^\d+$/.test(trimmedPassword)) {
        try {
          const { data: staffData, error: staffError } = await supabase.functions.invoke('staff-login', {
            body: { email: trimmedEmail.toLowerCase(), password: trimmedPassword }
          });

          if (!staffError && staffData?.success) {
            await clearBrowserAuthForStaffSession();
            const hydrated = await hydrateStaffAuthSession(staffData, trimmedPassword);
            if (!hydrated) {
              setIsLoading(false);
              setLoginErrorMsg('Staff session could not be created. Please reset this staff PIN.');
              toast({ title: t('auth.loginFailed'), description: 'Staff session could not be created. Please reset this staff PIN.', variant: 'destructive' });
              return;
            }
            applyStaffFunctionSession(staffData, trimmedEmail);
            setIsLoading(false);
            toast({ title: 'Login successful', description: `Welcome ${staffData.name || 'Staff'}` });
            console.info('[STAFF_AUTH] REDIRECT DASHBOARD src/pages/auth/AuthPage.tsx:374', { path: '/staff-dashboard' });
            goToStaffDashboard();
            return;
          }
        } catch (_) { /* fall back to normal email login */ }
      }

      let loginResult = await login(trimmedEmail, trimmedPassword);
      let error = loginResult.error;
      
      if (error && /^\d+$/.test(trimmedPassword)) {
        // Try falling back to Cashier PIN login pattern if they used an email and a numeric PIN
        const pinLoginResult = await login(trimmedEmail, trimmedPassword + '#MaxoraPOS!26@Auth');
        let pinError = pinLoginResult.error;
        if (!pinError) {
          loginResult = pinLoginResult;
        }
        if (pinError) {
          // Fallback to legacy suffix for older accounts
          const legacyPinLoginResult = await login(trimmedEmail, trimmedPassword + 'Aa@1');
          pinError = legacyPinLoginResult.error;
          if (!pinError) {
            loginResult = legacyPinLoginResult;
          }
        }
        if (!pinError) {
          error = null;
        }
      }
      
      if (error) {
        if (trimmedEmail.includes('@') && /^\d+$/.test(trimmedPassword)) {
          try {
            const { data: staffData, error: staffError } = await supabase.functions.invoke('staff-login', {
              body: { email: trimmedEmail.toLowerCase(), password: trimmedPassword }
            });

            if (!staffError && staffData?.success) {
              await clearBrowserAuthForStaffSession();
              const hydrated = await hydrateStaffAuthSession(staffData, trimmedPassword);
              if (!hydrated) {
                setIsLoading(false);
                setLoginErrorMsg('Staff session could not be created. Please reset this staff PIN.');
                toast({ title: t('auth.loginFailed'), description: 'Staff session could not be created. Please reset this staff PIN.', variant: 'destructive' });
                return;
              }
              applyStaffFunctionSession(staffData, trimmedEmail);
              setIsLoading(false);
              toast({ title: 'Login successful', description: `Welcome ${staffData.name || 'Staff'}` });
              console.info('[STAFF_AUTH] REDIRECT DASHBOARD src/pages/auth/AuthPage.tsx:390', { path: '/staff-dashboard' });
              goToStaffDashboard();
              return;
            }
          } catch (_) { /* keep normal auth error below */ }
        }

        setIsLoading(false);
        if (/suspend/i.test(error)) {
          navigate('/account-suspended', { replace: true });
          return;
        }
        setLoginErrorMsg(error);
        toast({ title: t('auth.loginFailed'), description: error, variant: 'destructive' });
        return;
      }
      setLoginSuccess(true);

      if (loginResult?.role) {
        setIsLoading(false);
        redirectByRole(loginResult.role);
        return;
      }

      // Mobile/Android-safe fallback: don't wait for onAuthStateChange to hydrate
      // isAuthenticated/userRole in context. Wrap role lookup in a hard timeout
      // so a hung network/storage call on Android WebView can't leave the button
      // stuck on "Processing...".
      try {
        const sessionRes = await withTimeout(supabase.auth.getSession(), 3000);
        const uid = (sessionRes as any)?.data?.session?.user?.id;
        if (uid) {
          let role: string | undefined;
          const activeRes = await withTimeout(
            supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', uid)
              .eq('is_active', true)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            3000,
          );
          role = (activeRes as any)?.data?.role;
          if (!role) {
            const anyRes = await withTimeout(
              supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', uid)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
              3000,
            );
            role = (anyRes as any)?.data?.role;
          }
          if (role) {
            setIsLoading(false);
            redirectByRole(role);
            return;
          }
        }
      } catch (_) { /* fall through to state-driven redirect */ }

      // Safety net: release the button and hand off to the app's auth-aware
      // routing. Use navigate() first (works inside Capacitor Android WebView
      // where window.location.replace can break the file:// origin), then a
      // hard reload as last resort for plain mobile browsers.
      setIsLoading(false);
      setTimeout(() => {
        if (window.location.pathname === '/auth') {
          try { navigate('/', { replace: true }); } catch (_) {}
          setTimeout(() => {
            if (window.location.pathname === '/auth') {
              try { window.location.href = '/'; } catch (_) {}
            }
          }, 800);
        }
      }, 1200);
    } catch (err) {
      setIsLoading(false);
      setLoginErrorMsg('Something went wrong');
      toast({ title: t('auth.loginFailed'), description: 'Something went wrong', variant: 'destructive' });
    }
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    // Validate current form
    if (signupStep === 'owner_form') {
      try { ownerSignupSchema.parse({ email, password, fullName, phone, businessName }); }
      catch (error) {
        if (error instanceof z.ZodError) {
          const fieldErrors: Record<string, string> = {};
          error.errors.forEach(err => fieldErrors[err.path[0] as string] = err.message);
          setErrors(fieldErrors);
          return;
        }
      }
    } else if (signupStep === 'store_form') {
      try { storeSignupSchema.parse({ storeName, ownerCode, phone, password }); }
      catch (error) {
        if (error instanceof z.ZodError) {
          const fieldErrors: Record<string, string> = {};
          error.errors.forEach(err => fieldErrors[err.path[0] as string] = err.message);
          setErrors(fieldErrors);
          return;
        }
      }
    }

    setIsLoading(true);
    const success = await sendOTP(phone);
    if (success) {
      setSignupStep('otp');
    }
    setIsLoading(false);
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return;
    
    setIsLoading(true);
    const isVerified = await verifyOTP(phone, otp);
    setIsLoading(false);

    if (!isVerified) return;

    if (signupStep === 'otp') {
       if (businessName) {
         setSignupStep('membership');
       } else {
         await finalizeStoreSignup();
       }
    }
  };

  const finalizeStoreSignup = async () => {
    setIsLoading(true);
    try {
      const storeEmail = `store_${phone.replace('+91', '')}@pos.local`;
      const { error: signupError } = await signup(storeEmail, password, storeName);
      if (signupError) throw new Error(signupError);

      setSignupStep('pending');
      setSignupComplete(true);
      toast({ title: 'Store Created', description: 'Your store account is created.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOwnerSignupComplete = async () => {
    if (!selectedPlan) {
      toast({ title: t('auth.selectPlan'), description: t('auth.selectPlanDesc'), variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const { error: signupError } = await signup(email, password, fullName);
      if (signupError) throw new Error(signupError);
      
      await new Promise(resolve => setTimeout(resolve, 500));

      const { error: customerError } = await supabase.from('customers').insert({
        owner_email: email,
        owner_name: fullName,
        business_name: businessName,
        phone: phone,
        subscription_plan: selectedPlan,
        enabled_addons: selectedAddons,
        business_type: businessType,
        approval_status: 'pending',
        is_active: false,
        phone_verified: true
      });

      if (customerError) console.error('Customer creation error:', customerError);
      setSignupStep('pending');
      setSignupComplete(true);
      toast({ title: t('auth.signupComplete'), description: t('auth.accountPendingApproval') });
    } catch (error: any) {
      toast({ title: t('auth.signupFailed'), description: error.message || t('common.error'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const getHeaderTitle = () => {
    if (signupStep === 'role_selection') return 'Choose Account Type';
    if (signupStep === 'owner_form') return t('auth.ownerSignup');
    if (signupStep === 'store_form') return 'Store Signup';
    if (signupStep === 'otp') return 'Verify Mobile';
    if (signupStep === 'membership') return t('auth.selectPlan');
    if (signupStep === 'addons') return 'Select Add-ons';
    if (signupStep === 'pending') return t('auth.pendingApprovalTitle');
    return t('auth.login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md">
        <Button variant="ghost" onClick={() => navigate('/')} className="mb-3 sm:mb-4 h-9 sm:h-10 text-sm">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('common.backToHome')}
        </Button>

        <Card className="border-0 shadow-2xl">
          <div className="bg-gradient-to-r from-primary to-primary/80 p-4 sm:p-6 rounded-t-lg text-primary-foreground">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-primary-foreground/20 rounded-lg sm:rounded-xl">
                {signupStep === 'membership' || signupStep === 'addons' ? <Crown className="w-6 h-6 sm:w-8 sm:h-8" /> :
                 signupStep === 'pending' ? <Clock className="w-6 h-6 sm:w-8 sm:h-8" /> :
                 isSignup ? <Building2 className="w-6 h-6 sm:w-8 sm:h-8" /> :
                 <LogIn className="w-6 h-6 sm:w-8 sm:h-8" />}
              </div>
              <div>
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold">{getHeaderTitle()}</h1>
              </div>
            </div>
          </div>

          <CardContent className="p-4 sm:p-6">
            {signupStep === 'role_selection' ? (
               <div className="space-y-4">
                 <Button onClick={() => setSignupStep('owner_form')} className="w-full h-16 flex items-center justify-start gap-4" variant="outline">
                    <Crown className="w-6 h-6" />
                    <div className="text-left">
                       <div className="font-bold">Register as Owner</div>
                       <div className="text-xs text-muted-foreground">For business owners & merchants</div>
                    </div>
                 </Button>
                 <Button onClick={() => setSignupStep('store_form')} className="w-full h-16 flex items-center justify-start gap-4" variant="outline">
                    <Store className="w-6 h-6" />
                    <div className="text-left">
                       <div className="font-bold">Register as Store</div>
                       <div className="text-xs text-muted-foreground">For branch stores connecting to an owner</div>
                    </div>
                 </Button>
                 <div className="text-center mt-4">
                   <Button variant="link" onClick={() => { setIsSignup(false); setSignupStep('form'); }}>
                     Already have an account? Login
                   </Button>
                 </div>
               </div>
            ) : signupStep === 'otp' ? (
               <form onSubmit={handleVerifyOTP} className="space-y-4 text-center">
                 <div className="mb-4">
                   <p className="text-sm text-muted-foreground">We sent a secure OTP to +91{phone.replace('+91','')}. Please enter it below.</p>
                 </div>
                 <div className="space-y-2 max-w-[250px] mx-auto text-left">
                   <Label htmlFor="otp">Enter 6-digit OTP</Label>
                   <Input id="otp" type="text" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="------" maxLength={6} required className="text-center tracking-widest text-lg" />
                 </div>
                 <div className="flex flex-col gap-2 pt-4 items-center">
                   <Button type="submit" disabled={isLoading} className="w-full max-w-[250px]">
                     {isLoading ? 'Verifying...' : 'Verify OTP'}
                   </Button>
                   <div className="flex items-center gap-2 mt-2">
                     <Button type="button" variant="ghost" onClick={() => setSignupStep('form')} disabled={isLoading}>Back</Button>
                     <Button type="button" variant="link" disabled={countdown > 0 || isLoading} onClick={() => sendOTP(phone)}>
                       {countdown > 0 ? `Resend OTP in ${countdown}s` : 'Resend OTP'}
                     </Button>
                   </div>
                 </div>
               </form>
            ) : signupStep === 'pending' ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                  <Clock className="w-8 h-8 text-amber-600" />
                </div>
                <h3 className="text-xl font-bold">{t('auth.pendingApprovalTitle')}</h3>
                <p className="text-muted-foreground">{t('auth.pendingApprovalDesc')}</p>
                <Button variant="outline" onClick={() => navigate('/')} className="mt-4">{t('common.backToHome')}</Button>
              </div>
            ) : signupStep === 'membership' ? (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold">Select Membership Plan</h3>
                </div>
                <div className="space-y-3">
                  {[
                    { id: 'basic', name: 'Basic Plan', price: '₹7,999', duration: '/year', features: ['1 Store', 'Basic POS', 'Email Support'] },
                    { id: 'gold', name: 'Gold Plan', price: '₹14,999', duration: '/year', features: ['Up to 5 Stores', 'Advanced Reports', 'Priority Support'] },
                    { id: 'platinum', name: 'Platinum Plan', price: '₹24,999', duration: '/year', features: ['Unlimited Stores', 'All Features', '24/7 Support'] },
                    { id: 'custom', name: 'Customize Plan', price: '₹0', duration: '/year', features: ['Select features as per your need'] },
                  ].map((plan) => (
                    <button key={plan.id} type="button" onClick={() => setSelectedPlan(plan.id)} className={cn('w-full p-4 rounded-lg border-2 text-left transition-all relative', selectedPlan === plan.id ? 'border-primary bg-primary/5' : 'border-border')}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold">{plan.name}</p>
                          <p className="text-sm text-muted-foreground">{plan.features.join(' • ')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-primary">{plan.price}</p>
                          <p className="text-xs text-muted-foreground">{plan.duration}</p>
                        </div>
                      </div>
                      {selectedPlan === plan.id && <div className="absolute top-2 right-2"><Check className="w-5 h-5 text-primary" /></div>}
                    </button>
                  ))}
                </div>
                <Button onClick={() => {
                  if (selectedPlan === 'custom') setSignupStep('addons');
                  else handleOwnerSignupComplete();
                }} disabled={isLoading || !selectedPlan} className="w-full">
                  {selectedPlan === 'custom' ? 'Select Features' : (isLoading ? t('auth.creating') : t('auth.completeSignup'))}
                </Button>
              </div>
            ) : signupStep === 'addons' ? (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold">Customize Your Plan</h3>
                  <p className="text-sm text-muted-foreground">Select Add-ons (Minimum ₹10,000 required)</p>
                </div>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                  {Object.entries(ADDONS_PRICING).map(([addon, price]) => {
                    const isSelected = selectedAddons.includes(addon);
                    return (
                      <button key={addon} type="button" onClick={() => {
                        setSelectedAddons(prev => isSelected ? prev.filter(a => a !== addon) : [...prev, addon])
                      }} className={cn('w-full p-3 rounded-lg border-2 text-left transition-all flex items-center justify-between', isSelected ? 'border-primary bg-primary/5' : 'border-border')}>
                        <span className="font-medium text-sm">{addon}</span>
                        <span className="text-primary font-bold">₹{price.toLocaleString('en-IN')}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="pt-4 border-t border-border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm">Selected Value:</span>
                    <span className="font-bold">₹{selectedAddons.reduce((sum, a) => sum + ADDONS_PRICING[a], 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm">Remaining Required:</span>
                    <span className="font-bold text-destructive">
                      {Math.max(0, 10000 - selectedAddons.reduce((sum, a) => sum + ADDONS_PRICING[a], 0)) > 0 ? `₹${Math.max(0, 10000 - selectedAddons.reduce((sum, a) => sum + ADDONS_PRICING[a], 0)).toLocaleString('en-IN')}` : '₹0'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSignupStep('membership')} className="w-1/3">Back</Button>
                    <Button 
                      onClick={handleOwnerSignupComplete} 
                      disabled={isLoading || selectedAddons.reduce((sum, a) => sum + ADDONS_PRICING[a], 0) < 10000} 
                      className="w-2/3"
                    >
                      {isLoading ? t('auth.creating') : t('auth.completeSignup')}
                    </Button>
                  </div>
                  {selectedAddons.reduce((sum, a) => sum + ADDONS_PRICING[a], 0) < 10000 && (
                    <p className="text-xs text-destructive text-center mt-2">Please select add-ons worth at least ₹10,000 to continue.</p>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={!isSignup ? handleLogin : handleSendOTP} className="space-y-4">
                {signupStep === 'owner_form' && (
                  <>
                    <div className="space-y-2"><Label>Full Name *</Label><Input value={fullName} onChange={e=>setFullName(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Email *</Label><Input type="email" value={email} onChange={e=>setEmail(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Business Name *</Label><Input value={businessName} onChange={e=>setBusinessName(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Business Type *</Label>
                      <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={businessType} onChange={e=>setBusinessType(e.target.value as any)}>
                        <option value="retail">Retail</option>
                        <option value="restaurant">Restaurant</option>
                      </select>
                    </div>
                    <div className="space-y-2"><Label>Mobile Number (10 digits) *</Label><Input type="tel" pattern="[6-9][0-9]{9}" placeholder="9876543210" value={phone} onChange={e=>setPhone(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Password *</Label><Input type="password" value={password} onChange={e=>setPassword(e.target.value)} /></div>
                  </>
                )}
                {signupStep === 'store_form' && (
                  <>
                    <div className="space-y-2"><Label>Store Name *</Label><Input value={storeName} onChange={e=>setStoreName(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Owner Code / Email *</Label><Input value={ownerCode} onChange={e=>setOwnerCode(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Store Mobile Number *</Label><Input type="tel" pattern="[6-9][0-9]{9}" placeholder="9876543210" value={phone} onChange={e=>setPhone(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Password *</Label><Input type="password" value={password} onChange={e=>setPassword(e.target.value)} /></div>
                  </>
                )}
                {!isSignup && (
                  <>
                    {loginErrorMsg && (
                      <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md border border-destructive/20 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                        <span>{loginErrorMsg}</span>
                      </div>
                    )}
                    <div className="space-y-2"><Label>Email</Label><Input value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Password</Label><Input type="password" value={password} onChange={e=>setPassword(e.target.value)} /></div>
                  </>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Processing...' : (isSignup ? 'Send OTP' : 'Login')}
                </Button>

                <div className="text-center mt-4">
                   <Button variant="link" type="button" onClick={() => { setIsSignup(!isSignup); setSignupStep(isSignup ? 'form' : 'role_selection'); }}>
                     {isSignup ? 'Already have an account? Login' : 'Don\'t have an account? Sign up'}
                   </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AuthPage;
