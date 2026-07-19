import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocationVerification } from './useLocationVerification';
import { toast } from '@/hooks/use-toast';

interface AttendanceRecord {
  id: string;
  staff_id: string;
  user_id: string | null;
  merchant_id: string | null;
  store_id: string;
  check_in_time: string;
  check_out_time: string | null;
  check_in_distance: number | null;
  check_out_distance: number | null;
  status: 'checked_in' | 'checked_out';
}

type AttendanceRecordInput = Partial<AttendanceRecord> & {
  check_in?: string | null;
  check_out?: string | null;
  organization_id?: string | null;
};

interface StaffAttendanceState {
  checkedIn: boolean;
  checkedOut: boolean;
  workingHours: string;
  workingMinutes: number;
  overtime: string;
  overtimeMinutes: number;
  breakStatus: 'none' | 'on_break';
  currentShift: {
    startTime: string | null;
    endTime: string | null;
  };
  currentAttendance: AttendanceRecord | null;
}

interface UseStaffAttendanceResult {
  isCheckedIn: boolean;
  currentRecord: AttendanceRecord | null;
  currentAttendance: AttendanceRecord | null;
  attendanceHistory: AttendanceRecord[];
  attendanceState: StaffAttendanceState;
  isLoading: boolean;
  isVerifying: boolean;
  resolvedStaffId: string | null;
  resolvedMerchantId: string | null;
  checkIn: (verificationMethod?: 'face' | 'fingerprint') => Promise<boolean>;
  checkOut: (verificationMethod?: 'face' | 'fingerprint') => Promise<boolean>;
  refreshAttendance: () => Promise<void>;
  loadTodayAttendance: () => Promise<StaffAttendanceState>;
  applyAttendanceRecord: (record: AttendanceRecordInput | null) => StaffAttendanceState;
}

interface ResolvedStaffContext {
  staffId: string;
  authUserId: string;
  storeId: string;
  merchantId: string;
  roleId: string | null;
}

const STAFF_NOT_FOUND_MESSAGE = 'Staff record not found';

const emptyAttendanceState: StaffAttendanceState = {
  checkedIn: false,
  checkedOut: false,
  workingHours: '--',
  workingMinutes: 0,
  overtime: '--',
  overtimeMinutes: 0,
  breakStatus: 'none',
  currentShift: { startTime: null, endTime: null },
  currentAttendance: null,
};

const isUuid = (value?: string | null) => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

const getTodayBounds = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const localDate = [
    start.getFullYear(),
    String(start.getMonth() + 1).padStart(2, '0'),
    String(start.getDate()).padStart(2, '0'),
  ].join('-');

  return {
    localDate,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
};

const formatDuration = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0h 0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
};

export const useStaffAttendance = (
  authUserId?: string,
  storeId?: string,
  fallbackUserId?: string,
  merchantId?: string,
  workStartTime?: string | null,
  workEndTime?: string | null
): UseStaffAttendanceResult => {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<AttendanceRecord | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [attendanceState, setAttendanceState] = useState<StaffAttendanceState>(emptyAttendanceState);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedStaffId, setResolvedStaffId] = useState<string | null>(null);
  const [resolvedMerchantId, setResolvedMerchantId] = useState<string | null>(null);
  
  const { verifyLocation, isVerifying, maxDistance } = useLocationVerification(storeId);

  const normalizeAttendanceRecord = (record: AttendanceRecordInput): AttendanceRecord => ({
    id: record.id,
    staff_id: record.staff_id,
    user_id: record.user_id || null,
    merchant_id: record.merchant_id || record.organization_id || null,
    store_id: record.store_id,
    check_in_time: record.check_in_time || record.check_in,
    check_out_time: record.check_out_time || record.check_out || null,
    check_in_distance: record.check_in_distance ?? null,
    check_out_distance: record.check_out_distance ?? null,
    status: (record.status || (record.check_out_time || record.check_out ? 'checked_out' : 'checked_in')) as 'checked_in' | 'checked_out'
  });

  const resolveStaffContext = useCallback(async (): Promise<ResolvedStaffContext | null> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUserId = sessionData?.session?.user?.id;
    const primaryAuthUserId = [sessionUserId, authUserId, fallbackUserId].find(isUuid) || null;
    const candidateUserIds = primaryAuthUserId ? [primaryAuthUserId] : [];

    console.log('[Attendance Debug] Resolve staff context input:', {
      currentAuthUserId: sessionUserId || null,
      resolvedLookupUserId: primaryAuthUserId,
      hookAuthUserId: authUserId || null,
      fallbackUserId: fallbackUserId || null,
      storeId: storeId || null,
      merchantId: merchantId || null,
    });

    if (candidateUserIds.length === 0) return null;

    let staffQuery = supabase
      .from('staff')
      .select('id,user_id,profile_id,store_id,customer_id,active,approval_status')
      .or(candidateUserIds.map((id) => `user_id.eq.${id},profile_id.eq.${id}`).join(','))
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (storeId) staffQuery = staffQuery.eq('store_id', storeId);

    const { data: staffRows, error: staffError } = await staffQuery;

    if (staffError) {
      console.error('[Attendance Debug] Staff lookup error:', staffError);
      toast({
        title: 'Attendance unavailable',
        description: 'Could not validate your staff record. Please contact your manager.',
        variant: 'destructive',
      });
      return null;
    }

    const validStaffRows = (staffRows || []).filter((row: any) => {
      const status = String(row.approval_status || 'approved').toLowerCase();
      return status === 'approved' || status === 'active';
    });
    const staffRow: any = validStaffRows[0] || null;

    if (!staffRow?.id) {
      console.error(`[Attendance Debug] ${STAFF_NOT_FOUND_MESSAGE}. Insert blocked.`, {
        currentAuthUserId: sessionUserId || null,
        authUserIds: candidateUserIds,
        storeId,
        merchantId,
      });
      toast({
        title: 'Check-in Failed',
        description: STAFF_NOT_FOUND_MESSAGE,
        variant: 'destructive',
      });
      return null;
    }

    const finalStoreId = staffRow.store_id || storeId || null;
    if (!finalStoreId) {
      console.error('[Attendance Debug] Staff row has no store. Insert blocked.', staffRow);
      return null;
    }

    const { data: storeRow, error: storeError } = await supabase
      .from('stores')
      .select('id,customer_id,merchant_id,is_active')
      .eq('id', finalStoreId)
      .maybeSingle();

    if (storeError || !storeRow?.id) {
      console.error('[Attendance Debug] Store validation failed. Insert blocked.', { storeError, finalStoreId });
      return null;
    }

    const finalMerchantId = staffRow.customer_id || storeRow.customer_id || storeRow.merchant_id || merchantId || null;
    if (!finalMerchantId) {
      console.error('[Attendance Debug] Merchant validation failed. Insert blocked.', { staffRow, storeRow, merchantId });
      return null;
    }

    const [{ data: merchantRow, error: merchantError }, { data: customerRow, error: customerError }] = await Promise.all([
      supabase.from('merchants').select('id').eq('id', finalMerchantId).maybeSingle(),
      supabase.from('customers').select('id').eq('id', finalMerchantId).maybeSingle(),
    ]);

    if ((merchantError && !String(merchantError.message || '').includes('0 rows')) || (customerError && !String(customerError.message || '').includes('0 rows'))) {
      console.error('[Attendance Debug] Merchant/customer validation query failed. Insert blocked.', { merchantError, customerError, finalMerchantId });
      return null;
    }

    if (!merchantRow?.id && !customerRow?.id) {
      console.error('[Attendance Debug] Merchant/customer record not found. Insert blocked.', { finalMerchantId, staffRow, storeRow });
      return null;
    }

    const staffBelongsToStore = staffRow.store_id === finalStoreId;
    const staffBelongsToMerchant = !staffRow.customer_id || staffRow.customer_id === finalMerchantId || staffRow.customer_id === storeRow.customer_id || staffRow.customer_id === storeRow.merchant_id;
    if (!staffBelongsToStore || !staffBelongsToMerchant) {
      console.error('[Attendance Debug] Staff merchant/store mismatch. Insert blocked.', {
        staffRow,
        storeRow,
        finalMerchantId,
        staffBelongsToStore,
        staffBelongsToMerchant,
      });
      return null;
    }

    let roleId: string | null = null;
    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('id,user_id,role,store_id,customer_id,merchant_id,is_active')
      .in('user_id', candidateUserIds)
      .eq('is_active', true)
      .in('role', ['staff', 'store_manager', 'cashier']);
    const matchingRole = (roleRows || []).find((role: any) => !role.store_id || role.store_id === finalStoreId);
    roleId = matchingRole?.id || null;

    const context = {
      staffId: staffRow.id,
      authUserId: staffRow.user_id || staffRow.profile_id,
      storeId: finalStoreId,
      merchantId: finalMerchantId,
      roleId,
    };

    setResolvedStaffId(context.staffId);
    setResolvedMerchantId(context.merchantId);
    console.log('[Attendance Debug] Resolved staff context:', context);
    return context;
  }, [authUserId, fallbackUserId, storeId, merchantId]);

  const buildAttendanceState = useCallback((record: AttendanceRecord | null): StaffAttendanceState => {
    const checkedIn = Boolean(record && !record.check_out_time && record.status === 'checked_in');
    const checkedOut = Boolean(record?.check_out_time || record?.status === 'checked_out');

    let workingMinutes = 0;
    if (record?.check_in_time) {
      const checkIn = new Date(record.check_in_time);
      const checkOut = record.check_out_time ? new Date(record.check_out_time) : new Date();
      workingMinutes = Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000));
    }

    let scheduledMinutes = 0;
    if (workStartTime && workEndTime) {
      const [startH, startM] = workStartTime.split(':').map(Number);
      const [endH, endM] = workEndTime.split(':').map(Number);
      scheduledMinutes = Math.max(0, (endH * 60 + endM) - (startH * 60 + startM));
    }
    const overtimeMinutes = scheduledMinutes > 0 ? Math.max(0, workingMinutes - scheduledMinutes) : 0;

    return {
      checkedIn,
      checkedOut,
      workingHours: record?.check_in_time ? formatDuration(workingMinutes) : '--',
      workingMinutes,
      overtime: record?.check_in_time && scheduledMinutes > 0 ? (overtimeMinutes > 0 ? `+${formatDuration(overtimeMinutes)}` : 'None') : '--',
      overtimeMinutes,
      breakStatus: 'none',
      currentShift: { startTime: workStartTime || null, endTime: workEndTime || null },
      currentAttendance: record,
    };
  }, [workStartTime, workEndTime]);

  const applyAttendanceRecord = useCallback((record: AttendanceRecordInput | null): StaffAttendanceState => {
    const normalized = record?.id ? normalizeAttendanceRecord(record) : null;
    const nextState = buildAttendanceState(normalized);
    setCurrentRecord(normalized);
    setIsCheckedIn(nextState.checkedIn);
    setAttendanceState(nextState);
    if (normalized) {
      setAttendanceHistory((prev) => {
        const withoutDuplicate = prev.filter((item) => item.id !== normalized.id);
        return [normalized, ...withoutDuplicate].slice(0, 10);
      });
    }
    return nextState;
  }, [buildAttendanceState]);

  const loadTodayAttendance = useCallback(async (): Promise<StaffAttendanceState> => {
    setIsLoading(true);
    const context = await resolveStaffContext();
    if (!context) {
      setIsCheckedIn(false);
      setCurrentRecord(null);
      setAttendanceState(emptyAttendanceState);
      setIsLoading(false);
      return emptyAttendanceState;
    }

    const { localDate, startIso, endIso } = getTodayBounds();
    const selectAttendance = 'id,staff_id,user_id,merchant_id,organization_id,store_id,check_in,check_in_time,check_out,check_out_time,check_in_distance,check_out_distance,status';

    console.log('[Attendance Debug] Today\'s Attendance Query:', {
      merchant_id: context.merchantId,
      store_id: context.storeId,
      staff_id: context.staffId,
      attendance_date: localDate,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      localDayStartIso: startIso,
      localDayEndIso: endIso,
    });

    const { data: attendanceRows, error: todayError } = await supabase
      .from('staff_attendance')
      .select(selectAttendance)
      .eq('merchant_id', context.merchantId)
      .eq('store_id', context.storeId)
      .eq('staff_id', context.staffId)
      .or(`status.eq.checked_in,attendance_date.eq.${localDate},and(check_in.gte.${startIso},check_in.lt.${endIso})`)
      .order('check_in', { ascending: false });

    if (todayError) {
      console.error('[Attendance Debug] Attendance Result Error:', todayError);
      setIsLoading(false);
      return emptyAttendanceState;
    }

    const normalizedToday = (attendanceRows || []).map(normalizeAttendanceRecord);
    const openRecord = normalizedToday.find((record) => !record.check_out_time && record.status === 'checked_in');
    const todayRecord = openRecord || normalizedToday[0] || null;
    const nextState = buildAttendanceState(todayRecord);

    console.log('[Attendance Debug] Attendance Result:', normalizedToday);
    console.log('[Attendance Debug] Current Button State:', nextState.checkedIn ? 'CHECK OUT' : 'CHECK IN');

    setCurrentRecord(todayRecord);
    setIsCheckedIn(nextState.checkedIn);
    setAttendanceState(nextState);
    setIsLoading(false);
    return nextState;
  }, [resolveStaffContext, buildAttendanceState]);

  const fetchAttendance = useCallback(async () => {
    const todayState = await loadTodayAttendance();
    const context = await resolveStaffContext();
    if (!context) {
      setAttendanceHistory([]);
      return;
    }

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const selectAttendance = 'id,staff_id,user_id,merchant_id,organization_id,store_id,check_in,check_in_time,check_out,check_out_time,check_in_distance,check_out_distance,status';

    const { data: history, error: historyError } = await supabase
      .from('staff_attendance')
      .select(selectAttendance)
      .eq('merchant_id', context.merchantId)
      .eq('store_id', context.storeId)
      .eq('staff_id', context.staffId)
      .gte('check_in', weekAgo.toISOString())
      .order('check_in', { ascending: false })
      .limit(10);

    if (historyError) {
      console.error('[Attendance Debug] Error fetching attendance history:', historyError);
    } else {
      setAttendanceHistory((history || []).map(normalizeAttendanceRecord));
    }

    setIsCheckedIn(todayState.checkedIn);
    setCurrentRecord(todayState.currentAttendance);
  }, [loadTodayAttendance, resolveStaffContext]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  useEffect(() => {
    const onFocus = () => fetchAttendance();
    const onVisibility = () => {
      if (!document.hidden) fetchAttendance();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchAttendance]);

  const checkIn = useCallback(async (verificationMethod: 'face' | 'fingerprint' = 'face'): Promise<boolean> => {
    const context = await resolveStaffContext();
    if (!context) {
      toast({
        title: 'Check-in Failed',
        description: 'Staff record, merchant, or store is not linked correctly. Please contact your manager.',
        variant: 'destructive'
      });
      return false;
    }

    const todayState = await loadTodayAttendance();
    if (todayState.checkedIn) {
      toast({ title: 'Already checked in', description: 'Attendance refreshed. You can check out now.' });
      return true;
    }

    const result = await verifyLocation();
    if (!result.success) {
      toast({
        title: 'Check-in Failed',
        description: result.error || `You must be within ${maxDistance}m of the store`,
        variant: 'destructive'
      });
      return false;
    }

    try {
      const nowIso = new Date().toISOString();
      const { localDate } = getTodayBounds();
      const payload = {
        staff_id: context.staffId,
        user_id: context.authUserId,
        store_id: context.storeId,
        merchant_id: context.merchantId,
        organization_id: context.merchantId,
        check_in: nowIso,
        check_in_time: nowIso,
        latitude: result.latitude,
        longitude: result.longitude,
        check_in_latitude: result.latitude,
        check_in_longitude: result.longitude,
        check_in_distance: result.distance,
        status: 'checked_in',
        verification_type: verificationMethod,
        verification_method: verificationMethod,
        attendance_date: localDate
      };

      console.log('[Attendance Debug] Before Insert:', {
        currentAuthUserId: context.authUserId,
        resolvedStaffId: context.staffId,
        resolvedMerchantId: context.merchantId,
        resolvedStoreId: context.storeId,
        attendancePayload: payload,
      });

      const { data, error } = await supabase
        .from('staff_attendance')
        .insert(payload)
        .select('id,staff_id,user_id,merchant_id,organization_id,store_id,check_in,check_in_time,check_out,check_out_time,check_in_distance,check_out_distance,status')
        .single();

      console.log('[Attendance Debug] Insert Response:', data);
      console.error('[Attendance Debug] Insert Error:', error);

      if (error) {
        toast({
          title: 'Check-in Failed',
          description: error.message,
          variant: 'destructive'
        });
        await loadTodayAttendance();
        return false;
      }

      applyAttendanceRecord(data as AttendanceRecordInput);
      await loadTodayAttendance();
      await fetchAttendance();
      toast({
        title: 'Checked In Successfully',
        description: `${verificationMethod === 'fingerprint' ? 'Fingerprint' : 'Face'} verified. Distance: ${result.distance}m. Have a great day!`
      });
      return true;
    } catch (error) {
      console.error('[Attendance Debug] Check-in unexpected error:', error);
      toast({
        title: 'Check-in Failed',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive'
      });
      await loadTodayAttendance();
      return false;
    }
  }, [resolveStaffContext, loadTodayAttendance, verifyLocation, maxDistance, fetchAttendance]);

  const checkOut = useCallback(async (verificationMethod: 'face' | 'fingerprint' = 'face'): Promise<boolean> => {
    const todayState = await loadTodayAttendance();
    const activeRecord = todayState.currentAttendance;
    if (!activeRecord || !todayState.checkedIn) {
      toast({
        title: 'Check-out Failed',
        description: 'No active check-in found',
        variant: 'destructive'
      });
      return false;
    }

    const result = await verifyLocation();
    if (!result.success) {
      toast({
        title: 'Check-out Failed',
        description: result.error || `You must be within ${maxDistance}m of the store`,
        variant: 'destructive'
      });
      return false;
    }

    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('staff_attendance')
        .update({
          check_out: nowIso,
          check_out_time: nowIso,
          latitude: result.latitude,
          longitude: result.longitude,
          check_out_latitude: result.latitude,
          check_out_longitude: result.longitude,
          check_out_distance: result.distance,
          status: 'checked_out'
        })
        .eq('id', activeRecord.id)
        .eq('staff_id', activeRecord.staff_id);

      if (error) {
        console.error('[Attendance Debug] Check-out error:', error);
        toast({
          title: 'Check-out Failed',
          description: error.message,
          variant: 'destructive'
        });
        await loadTodayAttendance();
        return false;
      }

      applyAttendanceRecord({
        ...activeRecord,
        check_out: nowIso,
        check_out_time: nowIso,
        status: 'checked_out',
        check_out_distance: result.distance,
      });
      await loadTodayAttendance();
      await fetchAttendance();
      toast({
        title: 'Checked Out Successfully',
        description: `${verificationMethod === 'fingerprint' ? 'Fingerprint' : 'Face'} verified. Distance: ${result.distance}m. See you next time!`
      });
      return true;
    } catch (error) {
      console.error('[Attendance Debug] Check-out error:', error);
      toast({
        title: 'Check-out Failed',
        description: 'An unexpected error occurred',
        variant: 'destructive'
      });
      await loadTodayAttendance();
      return false;
    }
  }, [loadTodayAttendance, verifyLocation, maxDistance, fetchAttendance]);

  return {
    isCheckedIn,
    currentRecord,
    currentAttendance: attendanceState.currentAttendance,
    attendanceHistory,
    attendanceState,
    isLoading,
    isVerifying,
    resolvedStaffId,
    resolvedMerchantId,
    checkIn,
    checkOut,
    refreshAttendance: fetchAttendance,
    loadTodayAttendance,
    applyAttendanceRecord,
  };
};