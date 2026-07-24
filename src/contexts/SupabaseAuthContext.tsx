import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { logSecurityAction } from '@/lib/auditLogger';

export type UserRole = 'super_admin' | 'admin' | 'owner' | 'store_manager' | 'staff' | 'cashier';

export interface UserRoleData {
  id: string;
  user_id: string;
  role: UserRole;
  customer_id: string | null;
  merchant_id?: string | null;
  store_id: string | null;
  staff_code?: string | null;
  ref_code?: string | null;
  pin: string | null;
  is_active: boolean;
}

export interface CustomerData {
  id: string;
  business_name: string;
  owner_name: string;
  subscription_plan: string;
  subscription_tier: string;
  subscription_end: string;
  is_active: boolean;
  max_stores: number;
}

export interface StoreData {
  id: string;
  customer_id: string;
  store_name: string;
  address: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRoleData | null;
  customer: CustomerData | null;
  store: StoreData | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null; role?: UserRole }>;
  signup: (email: string, password: string, fullName: string) => Promise<{ error: string | null, data?: any }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  hasRole: (roles: UserRole[]) => boolean;
  isSuperAdmin: () => boolean;
  isAdmin: () => boolean;
  isOwner: () => boolean;
  isStoreManager: () => boolean;
  isStaff: () => boolean;
  isCashier: () => boolean;
  loginAsDemo: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const clearStoredAuthTokens = () => {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('[Auth] Failed to clear stored auth tokens:', error);
  }
};

export const SupabaseAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRoleData | null>(null);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [store, setStore] = useState<StoreData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearRoleState = useCallback(() => {
    setUserRole(null);
    setCustomer(null);
    setStore(null);
  }, []);

  const clearLegacyLoginState = useCallback(() => {
    localStorage.removeItem('logged_in_staff');
    localStorage.removeItem('store_login');
    localStorage.removeItem('pos_store_session');
    localStorage.removeItem('pos_store_login_data');
    localStorage.removeItem('pos_active_store');
    localStorage.removeItem('pos_is_store_login');
    localStorage.removeItem('pos_store_code');
    localStorage.removeItem('pos_staff_session');
    localStorage.removeItem('pos_active_staff');
    localStorage.removeItem('pos_active_store_data');
    localStorage.removeItem('owner_selected_store_id');
    localStorage.removeItem('owner_selected_store_name');
    localStorage.removeItem('owner_store_selection_done');
  }, []);

  const markAccountSuspended = useCallback(async () => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/pos')) {
      console.warn('[Auth] Suppressed account suspension because user is in POS mode');
      return;
    }
    console.warn('[Auth] Account suspended — signing out');
    try {
      localStorage.setItem('pos_account_suspended', 'true');
    } catch {}
    localStorage.removeItem('pos_session_active');
    localStorage.removeItem('pos_session_backup');
    localStorage.removeItem('pos_user_backup');
    localStorage.removeItem('pos_user_role_backup');
    localStorage.removeItem('pos_customer_backup');
    localStorage.removeItem('pos_store_backup');
    clearLegacyLoginState();
    clearRoleState();
    // Global scope kills sessions on all devices for this user
    try { await supabase.auth.signOut({ scope: 'global' } as any); } catch { await supabase.auth.signOut(); }
    if (typeof window !== 'undefined' && window.location.pathname !== '/account-suspended') {
      window.location.href = '/account-suspended';
    }
  }, [clearLegacyLoginState, clearRoleState]);

  const fetchUserData = useCallback(async (userId: string, authUser?: User | null): Promise<UserRoleData | null> => {
    try {
      if (localStorage.getItem('pos_login_as_demo') === 'true') {
        const mockRole = {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          user_id: '11111111-1111-1111-1111-111111111111',
          role: 'owner' as UserRole,
          customer_id: '22222222-2222-2222-2222-222222222222',
          store_id: '33333333-3333-3333-3333-333333333333',
          is_active: true,
          pin: '1234'
        };
        setUserRole(mockRole);
        setCustomer({
          id: '22222222-2222-2222-2222-222222222222',
          business_name: 'MAXORA Bakery',
          owner_name: 'Mock Owner',
          subscription_plan: 'yearly',
          subscription_tier: 'premium',
          subscription_end: '2030-01-01',
          is_active: true,
          max_stores: 5
        });
        setStore({
          id: '33333333-3333-3333-3333-333333333333',
          customer_id: '22222222-2222-2222-2222-222222222222',
          store_name: 'Main Outlet',
          address: '123 Main St, Mumbai'
        });
        return mockRole;
      }

      // If we are offline, directly restore from cache backups
      if (!navigator.onLine) {
        console.log('[Auth] Offline: restoring user role and store from backup cache');
        const roleBackup = localStorage.getItem('pos_user_role_backup');
        const customerBackup = localStorage.getItem('pos_customer_backup');
        const storeBackup = localStorage.getItem('pos_store_backup');
        if (roleBackup) {
          try {
            const parsedRole = JSON.parse(roleBackup);
            setUserRole(parsedRole);
            if (customerBackup) setCustomer(JSON.parse(customerBackup));
            if (storeBackup) setStore(JSON.parse(storeBackup));
            return parsedRole;
          } catch (e) {
            console.error('[Auth] Failed to parse cached backups', e);
          }
        }
        return null;
      }

      const { data: roleRows, error: roleError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId);

      if (roleError) {
        throw roleError;
      }

      const rolePriority: Record<string, number> = {
        super_admin: 0,
        admin: 1,
        owner: 2,
        store_manager: 3,
        staff: 4,
        cashier: 9,
      };
      const isStatusActive = (status: any) => {
        if (status === true) return true;
        if (status === false) return false;
        if (status === null || status === undefined) return true;
        const str = String(status).toLowerCase().trim();
        return ['true', '1', 'active', 'enabled', 'approved'].includes(str);
      };

      const isStatusSuspended = (isActive: any, approvalStatus: any) => {
        // If explicitly set to false boolean, it's suspended
        if (isActive === false) return true;
        
        // If it's a string that implies suspended
        const activeStr = String(isActive || '').toLowerCase().trim();
        if (['false', '0', 'inactive', 'disabled', 'suspended', 'blocked', 'deleted'].includes(activeStr)) return true;
        
        // Check approval status
        if (approvalStatus) {
          const approval = String(approvalStatus).toLowerCase().trim();
          if (['suspended', 'rejected', 'blocked', 'deleted', 'disabled', 'inactive'].includes(approval)) return true;
        }
        
        return false;
      };

      const activeRows = (roleRows || []).filter((r: any) => isStatusActive(r.is_active));
      const roleData = activeRows
        .slice()
        .sort((a: any, b: any) => (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99))[0];

      // If user has role rows but none are active => account suspended
      if (!roleData && (roleRows || []).length > 0) {
        console.warn('[SuspensionCheck] Triggered at user_roles:', {
          userId,
          roleRows,
          condition: '!roleData && roleRows.length > 0',
          reason: 'User has roles but none evaluate to active'
        });
        await markAccountSuspended();
        return null;
      }

      if (roleData) {
        const roleRecord = roleData as unknown as UserRoleData;
        setUserRole(roleRecord);
        localStorage.setItem('pos_user_role_backup', JSON.stringify(roleRecord));

        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', userId)
          .maybeSingle();

        let customerTier = 'basic';
        if (roleRecord.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .from('customers')
            .select('*')
            .eq('id', roleRecord.customer_id)
            .maybeSingle();
          
          if (!customerError && customerData) {
            customerTier = (customerData as any).subscription_tier || 'basic';
            if (isStatusSuspended((customerData as any).is_active, (customerData as any).approval_status)) {
              console.warn('[SuspensionCheck] Triggered at customers:', {
                userId,
                role: roleRecord.role,
                customerId: roleRecord.customer_id,
                isActive: (customerData as any).is_active,
                approvalStatus: (customerData as any).approval_status,
                condition: 'isStatusSuspended(customerData.is_active, customerData.approval_status)'
              });
              await markAccountSuspended();
              return null;
            }
            setCustomer(customerData as unknown as CustomerData);
            localStorage.setItem('pos_customer_backup', JSON.stringify(customerData));
          } else {
            setCustomer(null);
          }
        } else {
          setCustomer(null);
        }

        // Always check merchant.is_active if user_role has merchant_id (owners/managers)
        if (roleRecord.merchant_id) {
          const { data: merchantData, error: merchantError } = await supabase
            .from('merchants')
            .select('id, is_active, approval_status')
            .eq('id', roleRecord.merchant_id)
            .maybeSingle();
          if (!merchantError && merchantData) {
            if (isStatusSuspended((merchantData as any).is_active, (merchantData as any).approval_status)) {
              console.warn('[SuspensionCheck] Triggered at merchants:', {
                userId,
                role: roleRecord.role,
                merchantId: roleRecord.merchant_id,
                isActive: (merchantData as any).is_active,
                approvalStatus: (merchantData as any).approval_status,
                condition: 'isStatusSuspended(merchantData.is_active, merchantData.approval_status)'
              });
              await markAccountSuspended();
              return null;
            }
          }
        }

        if (roleRecord.store_id) {
          const { data: storeData, error: storeError } = await supabase
            .from('stores')
            .select('id, merchant_id, name, address, phone, email, business_type, country, currency_code, tax_type, tax_percentage, is_active, created_at, updated_at')
            .eq('id', roleRecord.store_id)
            .maybeSingle();
          
          if (!storeError && storeData) {
            if (isStatusSuspended((storeData as any).is_active, (storeData as any).approval_status)) {
              console.warn('[SuspensionCheck] Triggered at stores:', {
                userId,
                role: roleRecord.role,
                storeId: roleRecord.store_id,
                isActive: (storeData as any).is_active,
                approvalStatus: (storeData as any).approval_status,
                condition: 'isStatusSuspended(storeData.is_active, storeData.approval_status)'
              });
              await markAccountSuspended();
              return null;
            }
            const normalizedStore = {
              ...storeData,
              customer_id: (storeData as any).merchant_id,
              store_name: (storeData as any).name,
              store_code: (storeData as any).id?.slice(0, 8).toUpperCase(),
            };
            setStore(normalizedStore as unknown as StoreData);
            localStorage.setItem('pos_store_backup', JSON.stringify(normalizedStore));
            if (roleRecord.role === 'store_manager' || roleRecord.role === 'staff' || roleRecord.role === 'cashier') {
              const generatedStoreCode = (storeData as any).id?.slice(0, 8).toUpperCase();
              localStorage.setItem('pos_active_store', storeData.id);
              localStorage.setItem('pos_store_code', generatedStoreCode);
              localStorage.setItem('owner_selected_store_id', storeData.id);
              localStorage.setItem('pos_active_store_data', JSON.stringify({
                id: storeData.id,
                storeId: storeData.id,
                storeName: (storeData as any).name,
                storeAddress: storeData.address,
                storePhone: storeData.phone,
                customerId: (storeData as any).merchant_id,
                merchant_id: (storeData as any).merchant_id,
                storeCode: generatedStoreCode,
                store_code: generatedStoreCode,
                subscription_tier: customerTier,
                business_type: (storeData as any).business_type || 'restaurant',
              }));
              try { window.dispatchEvent(new CustomEvent('pos:store-changed', { detail: { storeId: storeData.id } })); } catch {}
            }

            if (roleRecord.role === 'staff') {
              localStorage.setItem('pos_staff_session', JSON.stringify({
                id: userId,
                user_id: userId,
                auth_user_id: userId,
                staff_role_id: roleRecord.id,
                role_id: roleRecord.id,
                name: profileData?.full_name || authUser?.user_metadata?.full_name || authUser?.email || 'Staff',
                email: profileData?.email || authUser?.email || null,
                role: roleRecord.role,
                store_id: storeData.id,
                customer_id: (storeData as any).merchant_id,
                merchant_id: (storeData as any).merchant_id,
                staff_code: roleRecord.staff_code || null,
              }));
            } else {
              localStorage.removeItem('pos_staff_session');
            }
          } else {
            setStore(null);
            localStorage.removeItem('pos_active_store_data');
            localStorage.removeItem('pos_staff_session');
          }
        } else {
          setStore(null);
          localStorage.removeItem('pos_active_store_data');
          localStorage.removeItem('pos_staff_session');
        }

        return roleRecord;
      } else {
        clearRoleState();
        return null;
      }
    } catch (error: unknown) {
      console.warn('[Auth] Failed to fetch user role, checking cached backups:', error);
      
      const roleBackup = localStorage.getItem('pos_user_role_backup');
      const customerBackup = localStorage.getItem('pos_customer_backup');
      const storeBackup = localStorage.getItem('pos_store_backup');
      
      if (roleBackup) {
        try {
          const parsedRole = JSON.parse(roleBackup);
          setUserRole(parsedRole);
          if (customerBackup) setCustomer(JSON.parse(customerBackup));
          if (storeBackup) setStore(JSON.parse(storeBackup));
          return parsedRole;
        } catch (e) {
          console.error('[Auth] Failed to parse cached role backup', e);
        }
      }

      clearRoleState();
      return null;
    }
  }, [clearRoleState, markAccountSuspended]);

  useEffect(() => {
    let isMounted = true;

    if (localStorage.getItem('pos_login_as_demo') === 'true') {
      setUser({
        id: '11111111-1111-1111-1111-111111111111',
        email: 'owner@MAXORA.com',
        user_metadata: { full_name: 'Mock Owner' }
      } as any);
      setSession({
        access_token: 'mock-token',
        user: { id: '11111111-1111-1111-1111-111111111111', email: 'owner@MAXORA.com' }
      } as any);
      setUserRole({
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        user_id: '11111111-1111-1111-1111-111111111111',
        role: 'owner',
        customer_id: '22222222-2222-2222-2222-222222222222',
        store_id: '33333333-3333-3333-3333-333333333333',
        is_active: true,
        pin: '1234'
      });
      setCustomer({
        id: '22222222-2222-2222-2222-222222222222',
        business_name: 'MAXORA Bakery',
        owner_name: 'Mock Owner',
        subscription_plan: 'yearly',
        subscription_tier: 'premium',
        subscription_end: '2030-01-01',
        is_active: true,
        max_stores: 5
      });
      setStore({
        id: '33333333-3333-3333-3333-333333333333',
        customer_id: '22222222-2222-2222-2222-222222222222',
        store_name: 'Main Outlet',
        address: '123 Main St, Mumbai'
      });
      setIsLoading(false);
      return;
    }

    const isSessionExpired = (s: Session | null | undefined): boolean => {
      if (!s) return true;
      const expiresAt = (s as any).expires_at as number | undefined; // seconds since epoch
      if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
        // No expiry info — treat as fresh; supabase client will refresh as needed
        return false;
      }
      // 30s safety window so we don't restore a token about to die
      return expiresAt * 1000 <= Date.now() + 30_000;
    };

    const dropSessionBackups = () => {
      localStorage.removeItem('pos_session_backup');
      localStorage.removeItem('pos_user_backup');
    };

    const applySession = (nextSession: Session | null) => {
      if (!isMounted) return;

      let finalSession = nextSession;
      let finalUser = nextSession?.user ?? null;

      const sessionActive = localStorage.getItem('pos_session_active') === 'true';

      if (localStorage.getItem('pos_login_as_demo') === 'true') {
        finalSession = {
          access_token: 'mock-token',
          user: { id: '11111111-1111-1111-1111-111111111111', email: 'owner@MAXORA.com' }
        } as any;
        finalUser = {
          id: '11111111-1111-1111-1111-111111111111',
          email: 'owner@MAXORA.com',
          user_metadata: { full_name: 'Mock Owner' }
        } as any;
      } else if (!finalSession) {
        // If there's a cached session backup, restore it to prevent automatic logout when offline or refreshing.
        // We intentionally restore even if the *access_token* has expired — Supabase's autoRefreshToken
        // will rotate using the long-lived refresh_token (valid for days/weeks), so the user stays logged in
        // across page refreshes, browser restarts, and multi-day gaps until they explicitly log out.
        const sessionBackupStr = localStorage.getItem('pos_session_backup');
        const userBackupStr = localStorage.getItem('pos_user_backup');
        if (sessionBackupStr && userBackupStr && (sessionActive || localStorage.getItem('pos_login_as_demo') === 'true')) {
          try {
            const cached: Session = JSON.parse(sessionBackupStr);
            console.log('[Auth] Restoring session from backup cache (preserves login across refresh/restart)');
            finalSession = cached;
            finalUser = JSON.parse(userBackupStr);
          } catch (e) {
            console.error('[Auth] Failed to parse session backup', e);
            dropSessionBackups();
          }
        }
      } else {
        // Cache backup copies of session/user whenever Supabase gives us a fresh one
        try {
          localStorage.setItem('pos_session_backup', JSON.stringify(finalSession));
          localStorage.setItem('pos_user_backup', JSON.stringify(finalUser));
          localStorage.setItem('pos_session_active', 'true');
        } catch (e) {
          console.error('[Auth] Failed to cache session backup', e);
        }
      }


      setSession(finalSession);
      setUser(finalUser);

      if (!finalUser) {
        clearRoleState();
        setIsLoading(false);
        return;
      }

      window.setTimeout(() => {
        void fetchUserData(finalUser.id, finalUser).finally(() => {
          if (isMounted) {
            setIsLoading(false);
          }
        });
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        // Phase 2 — rotate session_id on login/logout for the offline-first envelope
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          import('@/lib/session').then(({ resetSessionId, clearSessionId }) => {
            if (event === 'SIGNED_OUT') clearSessionId();
            else resetSessionId();
          }).catch(() => {});
          import('@/lib/envelope').then(({ primeUpdatedBy }) => primeUpdatedBy()).catch(() => {});
        }

        if (event === 'PASSWORD_RECOVERY') {
          console.log('[Auth] PASSWORD_RECOVERY event received');
          localStorage.setItem('is_password_recovery', 'true');
          if (window.location.pathname !== '/reset-password') {
            window.location.href = '/reset-password';
          }
          return;
        }

        const sessionActive = localStorage.getItem('pos_session_active') === 'true';
        if (event === 'SIGNED_OUT' && (sessionActive || localStorage.getItem('pos_login_as_demo') === 'true')) {
          console.log('[Auth] Prevented automatic sign out event');
          return;
        }

        if (localStorage.getItem('pos_is_signing_up_staff') === 'true') {
          console.log('[Auth] Ignored auth change during background staff signup');
          return;
        }

        applySession(nextSession);
      }
    );


    void supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Do NOT force sign-out on transient refresh errors — keep user logged in.
        // Supabase's autoRefreshToken will retry the refresh; meanwhile restore from cached backup.
        console.warn('[Auth] getSession warning (keeping session):', error.message);

        const sessionActive = localStorage.getItem('pos_session_active') === 'true';
        if (sessionActive) {
          const sessionBackupStr = localStorage.getItem('pos_session_backup');
          if (sessionBackupStr) {
            try {
              const cachedSession = JSON.parse(sessionBackupStr);
              applySession(cachedSession);
              return;
            } catch (e) {
              console.error('[Auth] Failed to parse backup session during error', e);
            }
          }
          // No backup but session was active — keep current state, don't sign out
          setIsLoading(false);
          return;
        }
      }
      applySession(session);
    });


    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [clearRoleState, fetchUserData]);

  const loginAsDemo = () => {
    localStorage.setItem('pos_login_as_demo', 'true');
    localStorage.setItem('pos_session_active', 'true');
    setUser({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'owner@MAXORA.com',
      user_metadata: { full_name: 'Mock Owner' }
    } as any);
    setSession({
      access_token: 'mock-token',
      user: { id: '11111111-1111-1111-1111-111111111111', email: 'owner@MAXORA.com' }
    } as any);
    setUserRole({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      user_id: '11111111-1111-1111-1111-111111111111',
      role: 'owner',
      customer_id: '22222222-2222-2222-2222-222222222222',
      store_id: '33333333-3333-3333-3333-333333333333',
      is_active: true,
      pin: '1234'
    });
    setCustomer({
      id: '22222222-2222-2222-2222-222222222222',
      business_name: 'MAXORA Bakery',
      owner_name: 'Mock Owner',
      subscription_plan: 'yearly',
      subscription_tier: 'premium',
      subscription_end: '2030-01-01',
      is_active: true,
      max_stores: 5
    });
    setStore({
      id: '33333333-3333-3333-3333-333333333333',
      customer_id: '22222222-2222-2222-2222-222222222222',
      store_name: 'Main Outlet',
      address: '123 St, Mumbai'
    });
    
    // Ensure localStorage has the items needed
    localStorage.setItem('permissions_requested', 'true');
    localStorage.setItem('pos_active_store', '33333333-3333-3333-3333-333333333333');
    localStorage.setItem('pos_active_store_data', JSON.stringify({
      id: '33333333-3333-3333-3333-333333333333',
      storeId: '33333333-3333-3333-3333-333333333333',
      storeName: 'Main Outlet',
      storeAddress: '123 St, Mumbai',
      storePhone: '+91 98765 43210',
      customerId: '22222222-2222-2222-2222-222222222222',
      storeCode: '12345678'
    }));
  };

  const login = async (email: string, password: string): Promise<{ error: string | null; role?: UserRole }> => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedPassword = password.trim();
      
      // ONLY append "Aa@1" for internal staff/cashier emails (which end in @maxora.local)
      // Otherwise, keep the exact password the user typed (like for owners/super_admins)
      const isInternalEmail = normalizedEmail.endsWith('@maxora.local');
      const finalPassword = (isInternalEmail && /^\d+$/.test(normalizedPassword)) 
        ? normalizedPassword + "Aa@1" 
        : normalizedPassword;

      // Clear all cached backup session data before logging in
      localStorage.removeItem('pos_session_backup');
      localStorage.removeItem('pos_user_backup');
      localStorage.removeItem('pos_user_role_backup');
      localStorage.removeItem('pos_customer_backup');
      localStorage.removeItem('pos_store_backup');

      clearLegacyLoginState();
      clearStoredAuthTokens();

      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: finalPassword,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          return { error: 'Invalid email or password. Please try again.' };
        }
        return { error: error.message };
      }

      if (!authData.user) {
        return { error: 'Login failed. Please try again.' };
      }

      if (authData.session) {
        setSession(authData.session);
        setUser(authData.user);
        try {
          localStorage.setItem('pos_session_backup', JSON.stringify(authData.session));
          localStorage.setItem('pos_user_backup', JSON.stringify(authData.user));
          localStorage.setItem('pos_session_active', 'true');
        } catch (cacheError) {
          console.warn('[Auth] Failed to cache login session immediately:', cacheError);
        }
      }

      const { data: roleRows, error: roleError } = await supabase
        .from('user_roles')
        .select('id, user_id, role, customer_id, merchant_id, store_id, staff_code, ref_code, pin, is_active, created_at')
        .eq('user_id', authData.user.id);

      if (roleError) {
        throw roleError;
      }

      const isStatusActive = (status: any) => {
        if (status === true) return true;
        if (status === false) return false;
        if (status === null || status === undefined) return true;
        const str = String(status).toLowerCase().trim();
        return ['true', '1', 'active', 'enabled', 'approved'].includes(str);
      };

      const rolePriority: Record<string, number> = {
        super_admin: 0,
        admin: 1,
        owner: 2,
        store_manager: 3,
        staff: 4,
        cashier: 9,
      };

      const activeRows = (roleRows || []).filter((r: any) => isStatusActive(r.is_active));
      const roleData = activeRows
        .slice()
        .sort((a: any, b: any) => (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99))[0];

      const roleRecord = roleData as unknown as UserRoleData | undefined;

      if (!roleRecord) {
        await supabase.auth.signOut();
        if (localStorage.getItem('pos_account_suspended') === 'true') {
          return { error: 'Your account has been suspended. Please contact the administrator.' };
        }
        return { error: 'No active account found for this email. Please contact admin.' };
      }

      if (!isStatusActive(roleRecord.is_active)) {
        await supabase.auth.signOut();
        return { error: 'Your account has been suspended. Please contact the administrator.' };
      }

      if ((roleRecord.role === 'store_manager' || roleRecord.role === 'staff') && !roleRecord.store_id) {
        await supabase.auth.signOut();
        clearRoleState();
        return { error: 'This account is not linked to any store.' };
      }

      setUserRole(roleRecord);
      localStorage.setItem('pos_user_role_backup', JSON.stringify(roleRecord));

      void fetchUserData(authData.user.id, authData.user).catch((hydrateError) => {
        console.warn('[Auth] Background login hydration failed:', hydrateError);
      });

      logSecurityAction('LOGIN', 'profiles', authData.user.id);
      localStorage.setItem('pos_session_active', 'true');
      return { error: null, role: roleRecord.role };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred';
      return { error: message || 'An unexpected error occurred' };
    }
  };

  const signup = async (email: string, password: string, fullName: string): Promise<{ error: string | null, data?: any }> => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      // Save current session
      const { data: sessionData } = await supabase.auth.getSession();
      const currentSession = sessionData.session;
      
      try {
        if (currentSession) {
          localStorage.setItem('pos_is_signing_up_staff', 'true');
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              full_name: fullName,
            }
          }
        });

        // Restore session if we had one (to prevent auto-login kicking out the admin)
        if (currentSession) {
          await supabase.auth.setSession({
            access_token: currentSession.access_token,
            refresh_token: currentSession.refresh_token,
          });
        }

        if (error) {
        if (error.message.includes('already registered')) {
          return { error: 'This email is already registered. Please login instead.' };
        }
        return { error: error.message };
      }

        return { error: null, data };
      } finally {
        localStorage.removeItem('pos_is_signing_up_staff');
      }
    } catch (error: any) {
      return { error: error.message || 'An unexpected error occurred' };
    }
  };

  const logout = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        logSecurityAction('LOGOUT', 'profiles', user.id);
      }
    } catch (e) {
      console.error('Failed to log logout action:', e);
    }

    localStorage.removeItem('pos_login_as_demo');
    localStorage.removeItem('pos_session_active');
    // Clear all cached backups on explicit logout
    localStorage.removeItem('pos_session_backup');
    localStorage.removeItem('pos_user_backup');
    localStorage.removeItem('pos_user_role_backup');
    localStorage.removeItem('pos_customer_backup');
    localStorage.removeItem('pos_store_backup');
    // Clear permission cache so the next user doesn't inherit features
    localStorage.removeItem('maxora.features.v1');
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    clearLegacyLoginState();
    clearRoleState();
  };

  const resetPassword = async (email: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (error: any) {
      return { error: error.message || 'An unexpected error occurred' };
    }
  };

  const hasRole = (roles: UserRole[]): boolean => {
    if (!userRole) return false;
    return roles.includes(userRole.role);
  };

  const isSuperAdmin = () => {
    return hasRole(['super_admin']);
  };
  const isAdmin = () => hasRole(['admin', 'super_admin']);
  const isOwner = () => hasRole(['owner']);
  const isStoreManager = () => hasRole(['store_manager']);
  const isStaff = () => hasRole(['staff']);
  const isCashier = () => hasRole(['cashier']);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      userRole,
      customer,
      store,
      isLoading,
      isAuthenticated: !!user && !!session,
      login,
      signup,
      logout,
      resetPassword,
      hasRole,
      isSuperAdmin,
      isAdmin,
      isOwner,
      isStoreManager,
      isStaff,
      isCashier,
      loginAsDemo,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useSupabaseAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useSupabaseAuth must be used within a SupabaseAuthProvider');
  }
  return context;
};
