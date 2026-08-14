import { supabase } from '@/integrations/supabase/client';
import { UserRoleData } from '@/contexts/SupabaseAuthContext';

export interface ResolvedMerchantContext {
  merchantId: string;
  storeId: string | null;
  userId: string;
  userRole: string;
}

/**
 * Robust, production-grade merchant resolution pipeline.
 * Resolves merchant_id via:
 * 1. Active Store's merchant_id
 * 2. Active UserRole context's merchant_id
 * 3. Merchants table where owner_id = userId
 * 4. User_roles table for active user
 * 5. Staff table for active user
 */
export async function resolveMerchantContext(
  user: { id: string } | null,
  activeStore?: { id: string; merchant_id?: string } | null,
  userRole?: UserRoleData | null
): Promise<ResolvedMerchantContext> {
  if (!user || !user.id) {
    throw new Error('Authentication Required: User is not logged in.');
  }

  const userId = user.id;

  // 1. Direct active store merchant ID
  if (activeStore && activeStore.merchant_id) {
    return {
      merchantId: activeStore.merchant_id,
      storeId: activeStore.id,
      userId,
      userRole: userRole?.role || 'owner',
    };
  }

  // 2. Direct userRole merchant ID
  if (userRole && userRole.merchant_id) {
    return {
      merchantId: userRole.merchant_id,
      storeId: activeStore?.id || userRole.store_id || null,
      userId,
      userRole: userRole.role || 'owner',
    };
  }

  // 3. Query merchants table by owner_id
  const { data: merchantRow, error: merchantErr } = await supabase
    .from('merchants')
    .select('id')
    .eq('owner_id', userId)
    .maybeSingle();

  if (merchantRow && merchantRow.id) {
    return {
      merchantId: merchantRow.id,
      storeId: activeStore?.id || null,
      userId,
      userRole: userRole?.role || 'owner',
    };
  }

  // 4. Query user_roles table for any valid merchant_id
  const { data: roleRows, error: roleErr } = await supabase
    .from('user_roles')
    .select('merchant_id, store_id, role')
    .eq('user_id', userId)
    .not('merchant_id', 'is', null)
    .limit(1);

  if (roleRows && roleRows.length > 0 && roleRows[0].merchant_id) {
    return {
      merchantId: roleRows[0].merchant_id,
      storeId: activeStore?.id || roleRows[0].store_id || null,
      userId,
      userRole: roleRows[0].role || userRole?.role || 'staff',
    };
  }

  // 5. Query staff table for staff record with merchant_id
  const { data: staffRow, error: staffErr } = await supabase
    .from('staff')
    .select('merchant_id, store_id, role')
    .eq('user_id', userId)
    .not('merchant_id', 'is', null)
    .maybeSingle();

  if (staffRow && staffRow.merchant_id) {
    return {
      merchantId: staffRow.merchant_id,
      storeId: activeStore?.id || staffRow.store_id || null,
      userId,
      userRole: staffRow.role || 'staff',
    };
  }

  throw new Error(
    `Could not determine merchant ID for logged-in user (${userId}). Please check user account & store assignment permissions.`
  );
}
