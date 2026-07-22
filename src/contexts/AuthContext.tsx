/**
 * AuthContext — Phase 2A extraction.
 *
 * A thin, stable facade over SupabaseAuthContext that exposes only the
 * auth-scoped surface (session, user, role, sign-in/out, refresh). It exists
 * so downstream contexts (Merchant, Store, POSData, Realtime) can depend on
 * an auth-only API without pulling in the full legacy SupabaseAuthContext
 * shape. SupabaseAuthContext remains the source of truth for the actual
 * Supabase session lifecycle — this file does NOT duplicate that logic.
 *
 * Backward compatibility: this file is additive. Existing consumers of
 * useSupabaseAuth() are unaffected.
 */
import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {
  useSupabaseAuth,
  type UserRole,
  type UserRoleData,
} from '@/contexts/SupabaseAuthContext';

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  userRole: UserRoleData | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const legacy = useSupabaseAuth();

  const value = useMemo<AuthContextValue>(() => ({
    user: legacy.user,
    session: legacy.session,
    userRole: legacy.userRole,
    role: legacy.userRole?.role ?? null,
    isAuthenticated: legacy.isAuthenticated,
    isLoading: legacy.isLoading,
    login: legacy.login,
    logout: legacy.logout,
    refreshSession: async () => {
      // Supabase JS auto-refreshes; this is a manual nudge for callers.
      await supabase.auth.getSession();
    },
  }), [
    legacy.user,
    legacy.session,
    legacy.userRole,
    legacy.isAuthenticated,
    legacy.isLoading,
    legacy.login,
    legacy.logout,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

/** Safe variant — returns null when outside the provider (mirrors usePOSSafe). */
export function useAuthSafe(): AuthContextValue | null {
  return useContext(AuthContext) ?? null;
}
