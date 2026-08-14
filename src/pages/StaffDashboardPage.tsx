import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/store';
import { 
  User, 
  Clock, 
  LogOut, 
  Calendar, 
  DollarSign, 
  CheckCircle,
  ListTodo,
  Bell,
  ChevronRight,
  Wallet,
  ArrowLeft,
  Plus,
  Check,
  MapPin,
  Loader2,
  AlertCircle,
  Navigation,
  Radio,
  Fingerprint,
  Camera,
  TrendingUp,
  BarChart3,
  MessageCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStaffAttendance } from '@/hooks/useStaffAttendance';
import { supabase } from '@/integrations/supabase/client';
import { StoreLocationSettings } from '@/components/pos/StoreLocationSettings';
import FaceCaptureDialog from '@/components/pos/FaceCaptureDialog';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import AttendanceCalendar from '@/components/pos/AttendanceCalendar';
import OvertimeReport from '@/components/pos/OvertimeReport';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { StaffChecklistsWidget } from '@/components/pos/StaffChecklistsWidget';

interface StaffMember {
  id: string;
  auth_user_id?: string;
  staff_role_id?: string;
  merchant_id?: string;
  customer_id?: string;
  name: string;
  role: string;
  phone: string;
  avatar?: string;
  store_id?: string;
}

interface DailyTask {
  id: string;
  title: string;
  completed: boolean;
  date: string;
  staffId: string;
}

interface SalaryRecord {
  month: string;
  amount: number;
  status: 'paid' | 'pending';
  paidOn?: string;
}

const StaffDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { logout: contextLogout, userRole } = useSupabaseAuth();
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [storeLocationConfigured, setStoreLocationConfigured] = useState<boolean | null>(null);
  const [showLocationSettings, setShowLocationSettings] = useState(false);
  const [storeCoordinates, setStoreCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isSettingAutoLocation, setIsSettingAutoLocation] = useState(false);
  const [currentDistance, setCurrentDistance] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isTrackingLive, setIsTrackingLive] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  
  // Biometric verification states
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [verificationAction, setVerificationAction] = useState<'checkin' | 'checkout'>('checkin');
  const [showFaceCapture, setShowFaceCapture] = useState(false);
  const [isVerifyingFace, setIsVerifyingFace] = useState(false);
  const [fingerprintEnabled, setFingerprintEnabled] = useState(false);
  const [storedFaceUrl, setStoredFaceUrl] = useState<string | null>(null);
  
  // Working hours states
  const [workStartTime, setWorkStartTime] = useState<string | null>(null);
  const [workEndTime, setWorkEndTime] = useState<string | null>(null);
  
  // Dialog states
  const [showAttendanceCalendar, setShowAttendanceCalendar] = useState(false);
  const [showOvertimeReport, setShowOvertimeReport] = useState(false);
  
  const { authenticate: authenticateFingerprint, isBiometricAvailable, checkBiometricAvailability } = useBiometricAuth();

  // Check biometric availability on mount
  useEffect(() => {
    checkBiometricAvailability();
  }, [checkBiometricAvailability]);

  // Calculate distance between two coordinates using Haversine formula
  const calculateDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Start live GPS tracking
  const startLiveTracking = useCallback(() => {
    if (!navigator.geolocation || !storeCoordinates) return;

    // Prevent starting multiple watchers
    if (watchIdRef.current !== null) {
      console.log('[GPS] watch already active, not starting a new one');
      return;
    }

    // Prevent duplicate immediate requests
    let isRequesting = false;

    const requestPositionWithRetry = async () => {
      if (isRequesting) return null;
      isRequesting = true;
      try {
        const doRequest = () => new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
        });

        try {
          const pos = await doRequest();
          return pos;
        } catch (err: any) {
          // If timeout (code 3), wait 3s and retry once
          if (err && err.code === err.TIMEOUT) {
            console.warn('[GPS] initial getCurrentPosition timed out; retrying in 3s');
            await new Promise(r => setTimeout(r, 3000));
            try {
              const pos2 = await doRequest();
              return pos2;
            } catch (err2: any) {
              console.error('[GPS] retry failed:', err2 && err2.message);
              throw err2;
            }
          }
          throw err;
        }
      } finally {
        isRequesting = false;
      }
    };

    // First get current position immediately (always request fresh position)
    (async () => {
      try {
        const position = await requestPositionWithRetry();
        if (!position) {
          setIsTrackingLive(false);
          return;
        }

        const userLat = position.coords.latitude;
        const userLon = position.coords.longitude;
        const accuracy = position.coords.accuracy ?? 0;
        const timestamp = position.timestamp || Date.now();

        console.log('[GPS] Current Latitude:', userLat);
        console.log('[GPS] Current Longitude:', userLon);
        console.log('[GPS] Accuracy:', accuracy);
        console.log('[GPS] Timestamp:', new Date(timestamp).toISOString());
        console.log('[GPS] Store Latitude:', storeCoordinates.latitude);
        console.log('[GPS] Store Longitude:', storeCoordinates.longitude);

        setUserLocation({ latitude: userLat, longitude: userLon });

        if (accuracy > 50) {
          toast({
            title: 'Waiting for a more accurate GPS location.',
            description: `GPS accuracy is ${Math.round(accuracy)}m. Please retry near an open window or outdoors.`,
            variant: 'destructive'
          });
          setIsTrackingLive(false);
          return;
        }

        const distance = calculateDistance(userLat, userLon, storeCoordinates.latitude, storeCoordinates.longitude);
        console.log('[GPS] Calculated Distance (meters):', Math.round(distance));
        setCurrentDistance(Math.round(distance));
        setIsTrackingLive(true);
      } catch (error: any) {
        const msg = error?.message || String(error);
        console.error('[GPS] Initial position error:', msg);
        toast({ title: 'Location Error', description: msg, variant: 'destructive' });
        setIsTrackingLive(false);
      }
    })();

    // Then watch for updates (always fresh positions)
    if (watchIdRef.current === null) {
      watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLon = position.coords.longitude;
        const accuracy = position.coords.accuracy ?? 0;

        console.log('[GPS Watch] Current Latitude:', userLat);
        console.log('[GPS Watch] Current Longitude:', userLon);
        console.log('[GPS Watch] GPS Accuracy (meters):', accuracy);
        console.log('[GPS Watch] Store Latitude:', storeCoordinates.latitude);
        console.log('[GPS Watch] Store Longitude:', storeCoordinates.longitude);

        setUserLocation({ latitude: userLat, longitude: userLon });

        if (accuracy > 50) {
          // Ask user to retry instead of calculating distance
          toast({
            title: 'Low GPS Accuracy',
            description: `GPS accuracy is ${Math.round(accuracy)}m. Please retry near an open window or outdoors.`,
            variant: 'destructive'
          });
          return;
        }

        const distance = calculateDistance(
          userLat, userLon,
          storeCoordinates.latitude, storeCoordinates.longitude
        );
        console.log('[GPS Watch] Calculated Distance (meters):', Math.round(distance));
        setCurrentDistance(Math.round(distance));
      },
      (error) => {
        let reason = 'Unknown GPS watch error';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reason = 'Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            reason = 'Location unavailable';
            break;
          case error.TIMEOUT:
            reason = 'Location request timed out';
            break;
        }
        const fullMsg = `${reason}: ${error.message || 'No details'}`;
        console.error('GPS watch error:', fullMsg);
        // Don't stop tracking on watch errors, keep last known position
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
    } else {
      console.log('[GPS] watch already set, skipping watchPosition registration');
    }
  }, [storeCoordinates, calculateDistance]);

  // Stop live GPS tracking
  const stopLiveTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTrackingLive(false);
  }, []);

  // Auto-start live tracking when store coordinates are available and not checked in
  useEffect(() => {
    if (storeCoordinates) {
      startLiveTracking();
    }

    return () => {
      stopLiveTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeCoordinates]);

  const attendanceAuthUserId = staff?.auth_user_id || staff?.id;
  const attendanceMerchantId = staff?.merchant_id || staff?.customer_id;

  // Get staff attendance from the database using the real staff.id mapping.
  const {
    isCheckedIn,
    currentAttendance,
    attendanceHistory,
    attendanceState,
    isLoading: isAttendanceLoading,
    isVerifying,
    resolvedStaffId,
    resolvedMerchantId,
    checkIn,
    checkOut,
    refreshAttendance,
    loadTodayAttendance,
    applyAttendanceRecord,
    verifyLocation,
    maxDistance
  } = useStaffAttendance(attendanceAuthUserId, staff?.store_id, undefined, attendanceMerchantId, workStartTime, workEndTime);

  const isSameLocalDay = (dateValue?: string | null) => {
    if (!dateValue) return false;
    const date = new Date(dateValue);
    const today = new Date();
    return date.getFullYear() === today.getFullYear()
      && date.getMonth() === today.getMonth()
      && date.getDate() === today.getDate();
  };
  const todayAttendance = currentAttendance || attendanceHistory.find((record) => isSameLocalDay(record.check_in_time)) || null;
  const hasActiveCheckIn = attendanceState.checkedIn;

  const handleAlreadyCheckedIn = async (attendance?: any) => {
    if (attendance?.id) {
      applyAttendanceRecord(attendance);
    }
    await loadTodayAttendance();
    await refreshAttendance();
    toast({
      title: 'Already checked in',
      description: 'Attendance refreshed. You can check out now.'
    });
    setShowVerificationDialog(false);
    setIsVerifyingFace(false);
  };

  // Dev-only quick check-in flag (set localStorage.pos_quick_checkin = 'true' to enable)
  const quickCheckinEnabled = typeof window !== 'undefined' && localStorage.getItem('pos_quick_checkin') === 'true';
  const devBypassEnabled = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    import.meta.env.DEV ||
    String(import.meta.env.VITE_DEV_MODE) === 'true'
  );

  // Stop tracking when checked in (optional - saves battery)
  useEffect(() => {
    if (isCheckedIn) {
      stopLiveTracking();
    } else if (storeCoordinates) {
      startLiveTracking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCheckedIn, storeCoordinates]);

  // Salary records - only from owner/manager notifications (no fake data)
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);

  // Load real salary records from notifications
  useEffect(() => {
    const posNotifications = JSON.parse(localStorage.getItem('pos_notifications') || '[]');
    const staffNotifications = JSON.parse(localStorage.getItem('staff_notifications') || '[]');
    const allNotifs = [...posNotifications, ...staffNotifications];
    
    const salaryNotifs = allNotifs.filter((n: any) => 
      n.type === 'salary' && (
        !n.staffId && !n.targetUserId || 
        n.staffId === staff?.id ||
        n.targetUserId === staff?.id
      )
    );
    
    const records: SalaryRecord[] = salaryNotifs.map((n: any) => ({
      month: new Date(n.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      amount: n.amount || 0,
      status: 'paid' as const,
      paidOn: n.createdAt,
    }));
    
    setSalaryRecords(records);
  }, [staff?.id]);

  useEffect(() => {
    const supabaseStaff = localStorage.getItem('pos_staff_session');
    
    let staffData: StaffMember | null = null;
    let userId: string | null = null;
    
    if (supabaseStaff) {
      try {
        const parsed = JSON.parse(supabaseStaff);
        userId = parsed.user_id || parsed.auth_user_id || parsed.id;
        staffData = {
          id: parsed.user_id || parsed.auth_user_id || parsed.id,
          auth_user_id: parsed.user_id || parsed.auth_user_id || parsed.id,
          staff_role_id: parsed.staff_role_id || parsed.role_id || undefined,
          merchant_id: parsed.merchant_id,
          customer_id: parsed.customer_id,
          name: parsed.name || parsed.full_name || 'Staff',
          role: parsed.role || 'staff',
          phone: parsed.phone || '',
          store_id: parsed.store_id
        };
      } catch {
        localStorage.removeItem('pos_staff_session');
      }
    }
    
    if (!staffData && userRole && ['staff', 'store_manager', 'cashier'].includes(userRole.role)) {
      staffData = {
        id: userRole.user_id,
        auth_user_id: userRole.user_id,
        staff_role_id: userRole.id,
        merchant_id: userRole.merchant_id || userRole.customer_id || undefined,
        customer_id: userRole.customer_id || userRole.merchant_id || undefined,
        name: 'Staff',
        role: userRole.role,
        phone: '',
        store_id: userRole.store_id || undefined,
      };
    }

    if (!staffData) {
      console.warn('[STAFF_AUTH] REDIRECT DASHBOARD src/pages/StaffDashboardPage.tsx:421', { blocked: true, reason: 'missing_staff_session' });
      navigate('/auth', { replace: true });
      return;
    }

    setStaff(staffData);

    // Check if store location is configured and fetch coordinates
    if (staffData.store_id) {
      supabase
        .from('stores')
        .select('latitude, longitude')
        .eq('id', staffData.store_id)
        .maybeSingle()
        .then(({ data }) => {
          const hasLocation = data?.latitude != null && data?.longitude != null;
          setStoreLocationConfigured(hasLocation);
          if (hasLocation && data) {
            setStoreCoordinates({ 
              latitude: Number(data.latitude), 
              longitude: Number(data.longitude) 
            });
          }
        });
    }

    // Fetch staff biometric settings and working hours from user_roles
    if (userId) {
      supabase
        .from('user_roles')
        .select('id, user_id, fingerprint_enabled, face_photo_url, work_start_time, work_end_time, role, store_id, customer_id, merchant_id, created_at')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .then(({ data: roles, error }) => {
          const userRoles = roles || [];
          console.log('User roles data:', userRoles, 'Error:', error);

          const firstFaceRole = userRoles.find((r: any) => r.face_photo_url);
          const firstFingerprintRole = userRoles.find((r: any) => r.fingerprint_enabled);
          const fallbackRole = userRoles[0] || null;
          const roleForBiometric = firstFaceRole || firstFingerprintRole || fallbackRole;

          setFingerprintEnabled(userRoles.some((r: any) => Boolean(r.fingerprint_enabled)));
          setStoredFaceUrl(roleForBiometric?.face_photo_url || null);
          setWorkStartTime(roleForBiometric?.work_start_time || null);
          setWorkEndTime(roleForBiometric?.work_end_time || null);

          if (roleForBiometric) {
            setStaff((current) => current ? {
              ...current,
              id: roleForBiometric.user_id || current.auth_user_id || current.id,
              auth_user_id: roleForBiometric.user_id || current.auth_user_id,
              staff_role_id: roleForBiometric.id || current.staff_role_id,
              store_id: roleForBiometric.store_id || current.store_id,
              merchant_id: roleForBiometric.merchant_id || current.merchant_id,
              customer_id: roleForBiometric.customer_id || current.customer_id,
              avatar: roleForBiometric.face_photo_url || current.avatar,
            } : current);

            console.log('Resolved biometric role:', {
              id: roleForBiometric.id,
              user_id: roleForBiometric.user_id,
              role: roleForBiometric.role,
              store_id: roleForBiometric.store_id,
              customer_id: roleForBiometric.customer_id,
              merchant_id: roleForBiometric.merchant_id,
              face_photo_url: roleForBiometric.face_photo_url,
              fingerprint_enabled: roleForBiometric.fingerprint_enabled,
            });
          }
        });
    }

    // Load tasks
    const today = new Date().toDateString();
    const allTasks: DailyTask[] = JSON.parse(localStorage.getItem('staff_tasks') || '[]');
    const myTasks = allTasks.filter(t => t.staffId === staffData!.id && t.date === today);
    setTasks(myTasks);
  }, [navigate]);

  useEffect(() => {
    if (!staff?.store_id) return;

    let cancelled = false;
    supabase
      .from('stores')
      .select('latitude, longitude')
      .eq('id', staff.store_id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const hasLocation = data?.latitude != null && data?.longitude != null;
        setStoreLocationConfigured(hasLocation);
        if (hasLocation && data) {
          setStoreCoordinates({
            latitude: Number(data.latitude),
            longitude: Number(data.longitude),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [staff?.store_id]);

  const resolveVerificationContext = useCallback(() => {
    const staffSession = (() => {
      try { return JSON.parse(localStorage.getItem('pos_staff_session') || 'null'); } catch { return null; }
    })();
    const activeStoreData = (() => {
      try { return JSON.parse(localStorage.getItem('pos_active_store_data') || 'null'); } catch { return null; }
    })();

    const storeId = staff?.store_id || staffSession?.store_id || activeStoreData?.id || activeStoreData?.store_id || activeStoreData?.storeId || localStorage.getItem('pos_active_store') || null;
    // Prefer explicit storeCode, fall back to legacy store_code and outlet_code fields
    const storeCode = activeStoreData?.storeCode
      || activeStoreData?.store_code
      || activeStoreData?.outlet_code
      || staffSession?.store_code
      || staffSession?.outlet_code
      || localStorage.getItem('pos_store_code')
      || localStorage.getItem('pos_outlet_code')
      || null;
    const merchantId = staffSession?.merchant_id || staffSession?.customer_id || activeStoreData?.merchant_id || activeStoreData?.customer_id || activeStoreData?.organization_id || null;

    return { storeId, storeCode, merchantId };
  }, [staff?.store_id]);

  const handleCheckIn = async () => {
    if (!staff) return;
    
    // If store location not configured, auto-set it first
    if (!storeLocationConfigured && staff.store_id) {
      if (userRole?.role !== 'owner') {
        toast({
          title: 'Location Not Configured',
          description: 'Store location is not set. Please ask the owner to configure it.',
          variant: 'destructive'
        });
        return;
      }
      setIsSettingAutoLocation(true);
      
      // Request location permission and set store location
      if (navigator.geolocation) {
        const doRequest = () => new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
        });

        try {
          let position: GeolocationPosition | null = null;
          try {
            position = await doRequest();
          } catch (err: any) {
            if (err && err.code === err.TIMEOUT) {
              console.warn('[AutoLocation] initial timeout, retrying in 3s');
              await new Promise(r => setTimeout(r, 3000));
              position = await doRequest();
            } else {
              throw err;
            }
          }

          if (!position) throw new Error('Could not obtain position');

          const { latitude, longitude } = position.coords;

          // Save to database
          const { error } = await supabase
            .from('stores')
            .update({ latitude, longitude })
            .eq('id', staff.store_id);

          if (!error) {
            setStoreCoordinates({ latitude, longitude });
            setStoreLocationConfigured(true);
            setIsSettingAutoLocation(false);
          } else {
            setIsSettingAutoLocation(false);
            toast({
              title: 'Save Failed',
              description: 'Could not save store location. Please try again.',
              variant: 'destructive'
            });
          }
        } catch (positionError: any) {
          console.error('Auto-location error:', positionError && positionError.message);
          setIsSettingAutoLocation(false);
          toast({
            title: 'Location Required',
            description: 'Please allow location access to set store location and check in.',
            variant: 'destructive'
          });
        }
      } else {
        setIsSettingAutoLocation(false);
        toast({
          title: 'Not Supported',
          description: 'Geolocation not supported on this device.',
          variant: 'destructive'
        });
      }
      return;
    }
    
    // Show verification dialog
    setVerificationAction('checkin');
    setShowVerificationDialog(true);
  };

  const handleCheckOut = async () => {
    if (!staff) return;
    // Show verification dialog
    setVerificationAction('checkout');
    setShowVerificationDialog(true);
  };

  const handleFingerprintVerification = async () => {
    const result = await authenticateFingerprint();
    if (result.success) {
      setShowVerificationDialog(false);
      if (verificationAction === 'checkin') {
        await checkIn('fingerprint');
      } else {
        await checkOut('fingerprint');
      }
    } else if (result.error?.toLowerCase().includes('cancel')) {
      toast({
        title: 'Fingerprint verification cancelled',
        description: 'No action taken. You can try again or choose another method.'
      });
    } else {
      toast({
        title: 'Fingerprint unavailable',
        description: result.error || 'Could not verify fingerprint',
        variant: 'destructive'
      });
    }
  };

  const handleFaceCapture = async (imageBlob: Blob) => {
    setShowFaceCapture(false);
    setIsVerifyingFace(true);
    
    console.log('Starting face verification...');
    console.log('Stored face URL:', storedFaceUrl);
    
    const locResult = await verifyLocation();
    if (!locResult.success) {
      toast({
        title: verificationAction === 'checkin' ? 'Check-in Failed' : 'Check-out Failed',
        description: locResult.error || `You must be within ${maxDistance}m of the store.`,
        variant: 'destructive'
      });
      setIsVerifyingFace(false);
      return;
    }
    
    try {
      // Convert blob to base64 - keep the full data URL for proper formatting
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // Send the full data URL instead of just the base64 data
          resolve(base64);
        };
      });
      reader.readAsDataURL(imageBlob);
      const imageData = await base64Promise;
      
      console.log('Captured image data length:', imageData.length);
      console.log('Calling verify-face edge function...');
      
      const verificationContext = resolveVerificationContext();
      console.log('Resolved face verification context:', verificationContext);
      
      try {
        const { data: authData } = await supabase.auth.getSession();
        console.log('--- FACE VERIFICATION EVIDENCE LOGS ---');
        console.log('[EVIDENCE] Current session:', authData?.session ? 'exists' : 'null');
        console.log('[EVIDENCE] access_token:', authData?.session?.access_token ? `Bearer ${authData.session.access_token.substring(0, 15)}...` : 'null');
        console.log('[EVIDENCE] Current user id (auth.uid):', authData?.session?.user?.id || 'null');
        console.log('[EVIDENCE] merchant_id:', verificationContext.merchantId);
        console.log('[EVIDENCE] store_id:', verificationContext.storeId);
        console.log('[EVIDENCE] staff_id:', staff?.id);
        console.log('------------------------------------');
      } catch (err) {
        console.warn('Failed to fetch auth session for evidence logs', err);
      }
 
      const payload = {
        capturedFaceBase64: imageData,
        storedFaceUrl: storedFaceUrl,
        store_code: verificationContext.storeCode,
        store_id: verificationContext.storeId,
        merchant_id: verificationContext.merchantId,
        staff_id: resolvedStaffId,
        staff_role_id: staff?.staff_role_id,
        latitude: locResult.latitude ?? null,
        longitude: locResult.longitude ?? null,
        isCheckOut: verificationAction === 'checkout'
      };
      
      console.log('[EVIDENCE] Exact payload sent to the Edge Function:', payload);

      const { data, error } = await supabase.functions.invoke('verify-face', {
        body: payload
      });

      console.log('Face verification response:', data, error);

      if (error) {
        console.error('Edge function error:', error);
        
        let customErrorMsg = error.message;
        
        // Supabase-js returns generic 'Edge Function returned a non-2xx status code'
        // We extract the actual readable message from the response body if available.
        try {
          if (error.context && typeof error.context.json === 'function') {
             // Clone the response so we don't lock it, just in case
             const clone = error.context.clone();
             const body = await clone.json();
             if (body && body.error) {
               customErrorMsg = body.error;
             }
          }
          // If JSON parsing failed, also try to read plain text for mobile clients
          else if (error.context && typeof error.context.text === 'function') {
            try {
              const txt = await error.context.text();
              if (txt) {
                customErrorMsg = txt;
              }
            } catch (e) {}
          }
        } catch (e) {
          console.error('Failed to parse edge function error body:', e);
        }

        // Try to extract full response body and copy to clipboard so mobile testers can paste it here
        try {
          let respBody: any = null;
          if (error.context) {
            try {
              const clone2 = error.context.clone();
              respBody = await clone2.json().catch(async () => {
                try { return await error.context.text(); } catch { return null; }
              });
            } catch (e) {
              try { respBody = await error.context.text(); } catch { respBody = null; }
            }
          }
          if (respBody) {
            const serialized = typeof respBody === 'string' ? respBody : JSON.stringify(respBody);
            try {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(serialized);
                toast({ title: 'Error details copied to clipboard', description: 'Paste here so I can inspect the failure.' });
              } else {
                // Fallback: show the data in an alert for quick copy
                try { alert('Error details:\n' + (serialized.length > 2000 ? serialized.slice(0,2000) + '... (truncated)' : serialized)); } catch {}
              }
            } catch (e) {
              console.warn('Failed to copy error body to clipboard', e);
            }
          }
        } catch (e) {
          console.warn('Could not extract response body for clipboard copy', e);
        }

        if (customErrorMsg.toLowerCase().includes('already checked in')) {
          let attendanceFromError: any = null;
          try {
            const clone = error.context?.clone?.();
            const body = clone ? await clone.json().catch(() => null) : null;
            attendanceFromError = body?.attendance || null;
          } catch (_) {}
          await handleAlreadyCheckedIn(attendanceFromError);
          return;
        }

        toast({
          title: 'Face Verification Failed',
          description: customErrorMsg || 'Could not verify face. Please try again.',
          variant: 'destructive'
        });
        setIsVerifyingFace(false);
        return;
      }
      
      if (!data?.success) {
        const dataError = String(data?.error || data?.reason || '');
        if (dataError.toLowerCase().includes('already checked in')) {
          await handleAlreadyCheckedIn(data?.attendance || null);
          return;
        }

        toast({
          title: 'Face Verification Failed',
          description: dataError || 'Could not verify face',
          variant: 'destructive'
        });
        setIsVerifyingFace(false);
        return;
      }

      if (!data.match) {
        const confValue = data?.confidence !== undefined && data?.confidence !== 'undefined' ? data.confidence : 0;
        toast({
          title: 'Face Not Matched',
          description: `Confidence: ${confValue}%. ${data.reason || 'Please try again.'}`,
          variant: 'destructive'
        });
        setIsVerifyingFace(false);
        return;
      }

      // Face matched - reload database state before showing success or changing UI.
      setShowVerificationDialog(false);
      setIsVerifyingFace(false);
      if (data?.attendance?.id) {
        applyAttendanceRecord(data.attendance);
      }
      await loadTodayAttendance();
      await refreshAttendance();

      if (verificationAction === 'checkin') {
        toast({ title: 'Checked In Successfully', description: 'Face verified. Have a great day!' });
      } else {
        toast({ title: 'Checked Out Successfully', description: 'Face verified. See you next time!' });
      }
    } catch (err) {
      console.error('Face verification error:', err);
      toast({
        title: 'Verification Error',
        description: 'An error occurred during face verification',
        variant: 'destructive'
      });
      setIsVerifyingFace(false);
    }
  };

  const handleLogout = async () => {
    if (hasActiveCheckIn) {
      await handleCheckOut();
    }
    stopLiveTracking();
    localStorage.removeItem('logged_in_staff');
    localStorage.removeItem('pos_staff_session');
    
    try {
      await contextLogout();
    } catch(e) {
      console.error(e);
    }
    
    navigate('/auth');
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim() || !staff) return;

    const newTask: DailyTask = {
      id: Date.now().toString(),
      title: newTaskTitle,
      completed: false,
      date: new Date().toDateString(),
      staffId: staff.id
    };

    const allTasks: DailyTask[] = JSON.parse(localStorage.getItem('staff_tasks') || '[]');
    allTasks.push(newTask);
    localStorage.setItem('staff_tasks', JSON.stringify(allTasks));
    setTasks([...tasks, newTask]);
    setNewTaskTitle('');
    setShowAddTask(false);

    toast({ title: 'Task added' });
  };

  const toggleTaskComplete = (taskId: string) => {
    const updatedTasks = tasks.map(t => 
      t.id === taskId ? { ...t, completed: !t.completed } : t
    );
    setTasks(updatedTasks);

    const allTasks: DailyTask[] = JSON.parse(localStorage.getItem('staff_tasks') || '[]');
    const updatedAllTasks = allTasks.map(t => 
      t.id === taskId ? { ...t, completed: !t.completed } : t
    );
    localStorage.setItem('staff_tasks', JSON.stringify(updatedAllTasks));
  };

  const completedTasks = tasks.filter(t => t.completed).length;
  const totalTasks = tasks.length;

  const menuItems = [
    { label: 'Attendance History', icon: Calendar, description: 'View attendance calendar', onClick: () => setShowAttendanceCalendar(true) },
    { label: 'Overtime & Salary', icon: TrendingUp, description: 'View hours & earnings', onClick: () => setShowOvertimeReport(true) },
    { label: 'Team Chat', icon: MessageCircle, description: 'Chat with team', href: '/chat' },
    { label: 'Leave Request', icon: Calendar, description: 'Apply for leave', href: '/leave-request' },
    { label: 'Advance Request', icon: Wallet, description: 'Request salary advance', href: '/advance-request' },
    { label: 'Notifications', icon: Bell, description: 'View updates', href: '/staff-notifications' },
  ];

  const roleColors: Record<string, string> = {
    waiter: 'bg-blue-500/15 text-blue-600',
    chef: 'bg-orange-500/15 text-orange-600',
    cashier: 'bg-green-500/15 text-green-600',
    manager: 'bg-purple-500/15 text-purple-600',
    cleaner: 'bg-teal-500/15 text-teal-600',
  };

  // Generate Google Maps embed URL (no API key needed for basic embed)
  const getGoogleMapsEmbedUrl = () => {
    if (!storeCoordinates) return '';
    return `https://www.google.com/maps?q=${storeCoordinates.latitude},${storeCoordinates.longitude}&z=17&output=embed`;
  };

  if (!staff) return null;

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header - Responsive */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
          <h1 className="text-base sm:text-lg md:text-xl font-bold">Staff Dashboard</h1>
          <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10" onClick={handleLogout}>
            <LogOut className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
          </Button>
        </div>

        {/* Profile Header with Photo - Responsive */}
        <div className="bg-card rounded-xl sm:rounded-2xl border border-border p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
            {/* Profile Photo */}
            <div className="relative">
              <div className="w-14 h-14 sm:w-16 md:w-20 sm:h-16 md:h-20 rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center overflow-hidden border-2 border-primary/20">
                {staff.avatar && staff.avatar !== 'null' && staff.avatar !== 'undefined' ? (
                  <img 
                    src={staff.avatar} 
                    alt={staff.name} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
                      e.currentTarget.className = "w-8 h-8 object-contain opacity-50";
                    }}
                  />
                ) : (
                  <User className="w-7 h-7 sm:w-8 md:w-10 sm:h-8 md:h-10 text-primary" />
                )}
              </div>
              {/* Online indicator */}
              {hasActiveCheckIn && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-success rounded-full border-2 border-card flex items-center justify-center">
                  <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base sm:text-lg md:text-xl font-bold truncate">{staff.name}</h2>
              <span className={`text-[10px] sm:text-xs px-2 py-0.5 sm:py-1 rounded-full capitalize ${roleColors[staff.role] || 'bg-secondary'}`}>
                {staff.role}
              </span>
              {staff.phone && (
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 truncate">{staff.phone}</p>
              )}
            </div>
          </div>

          {/* Store Location Warning - Restrict to owner */}
          {storeLocationConfigured === false && staff?.store_id && (
            <div className="mb-4 p-3 bg-warning/10 border border-warning/30 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-warning flex-shrink-0" />
                <p className="text-xs text-warning">
                  {userRole?.role === 'owner' 
                    ? 'Store location not set. Set it to enable check-in.' 
                    : 'Store location not set. Contact owner to enable check-in.'}
                </p>
              </div>
              {userRole?.role === 'owner' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowLocationSettings(true)}
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Set Store Location (Current Location)
                </Button>
              )}
            </div>
          )}
          
          {/* Show current store coordinates and live distance */}
          {storeLocationConfigured === true && storeCoordinates && (
            <div className="mb-3 p-3 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3 h-3 text-primary" />
                  <span className="text-xs text-muted-foreground">Store Location:</span>
                </div>
                {userRole?.role === 'owner' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs px-2"
                    onClick={() => setShowLocationSettings(true)}
                  >
                    Update
                  </Button>
                )}
              </div>
              <p className="text-xs font-mono">
                {storeCoordinates.latitude.toFixed(6)}, {storeCoordinates.longitude.toFixed(6)}
              </p>
              
              {/* Live Distance Indicator */}
              {!hasActiveCheckIn && (
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Navigation className="w-3 h-3 text-primary" />
                    <span className="text-xs text-muted-foreground">Distance from store:</span>
                    {isTrackingLive && (
                      <span className="flex items-center gap-1">
                        <Radio className="w-3 h-3 text-success animate-pulse" />
                        <span className="text-[10px] text-success">LIVE</span>
                      </span>
                    )}
                  </div>
                  {currentDistance !== null ? (
                    <span className={`text-sm font-bold ${currentDistance <= 500 ? 'text-success' : 'text-destructive'}`}>
                      {currentDistance < 1000 ? `${currentDistance}m` : `${(currentDistance / 1000).toFixed(1)}km`}
                      {currentDistance <= 500 && <CheckCircle className="w-3 h-3 inline ml-1" />}
                    </span>
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              )}

              {/* Google Maps Embed Preview */}
              <div className="mt-2">
                <iframe
                  src={getGoogleMapsEmbedUrl()}
                  className="w-full h-32 rounded-lg border border-border"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Store Location Map"
                />
                <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-destructive" /> Store
                  </span>
                  {userLocation && (
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-primary" /> You: {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Check In / Check Out Button with Location */}
          {hasActiveCheckIn ? (
            <Button 
              onClick={handleCheckOut} 
              variant="destructive" 
              className="w-full h-12"
              disabled={isVerifying || storeLocationConfigured === false}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Verifying Location...
                </>
              ) : (
                <>
                  <LogOut className="w-5 h-5 mr-2" />
                  Check Out
                </>
              )}
            </Button>
          ) : (
            <>
              <Button 
                onClick={handleCheckIn} 
                className="w-full h-12"
                disabled={isVerifying || isSettingAutoLocation}
              >
                {isSettingAutoLocation ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Setting Store Location...
                  </>
                ) : isVerifying ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Verifying Location...
                  </>
                ) : (
                  <>
                    <MapPin className="w-5 h-5 mr-2" />
                    {storeLocationConfigured === false 
                      ? (userRole?.role === 'owner' ? 'Set Location & Check In' : 'Location Not Set')
                      : 'Check In'}
                  </>
                )}
              </Button>

              {quickCheckinEnabled && (
                <Button
                  variant="secondary"
                  className="w-full h-12 mt-2"
                  onClick={async () => {
                    try {
                      toast({ title: 'Manual check-in started (dev only)' });
                      await checkIn('face');
                    } catch (e) {
                      console.error('Manual check-in error:', e);
                      toast({ title: 'Manual check-in failed', description: String(e), variant: 'destructive' });
                    }
                  }}
                >
                  <Check className="w-5 h-5 mr-2" />
                  Normal Check-in (DEV)
                </Button>
              )}
            </>
          )}

          <p className="text-xs text-muted-foreground text-center mt-3 flex items-center justify-center gap-1">
            <MapPin className="w-3 h-3" />
            Location verified within {maxDistance}m of the store
          </p>

          {hasActiveCheckIn && (
            <p className="text-sm text-success text-center mt-2">
              ✓ Currently checked in
            </p>
          )}
        </div>

        {/* Working Hours & Overtime Section - Responsive */}
        <div className="bg-card rounded-xl sm:rounded-2xl border border-border p-3 sm:p-4 mb-4 sm:mb-6">
          <h3 className="font-semibold flex items-center gap-2 mb-3 sm:mb-4 text-sm sm:text-base">
            <Clock className="w-4 h-4" />
            Working Hours
          </h3>
          
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            {/* Scheduled Hours */}
            <div className="bg-secondary/50 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">Shift Timing</p>
              <p className="font-semibold text-sm">
                {workStartTime && workEndTime 
                  ? `${workStartTime.slice(0, 5)} - ${workEndTime.slice(0, 5)}`
                  : 'Not Set'}
              </p>
            </div>
            
            {/* Total Hours Today */}
            <div className="bg-secondary/50 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">Today's Hours</p>
              <p className="font-semibold text-sm">
                {attendanceState.workingHours}
              </p>
            </div>
            
            {/* Scheduled Duration */}
            <div className="bg-primary/10 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">Scheduled Duration</p>
              <p className="font-semibold text-sm text-primary">
                {workStartTime && workEndTime ? (
                  (() => {
                    const [startH, startM] = workStartTime.split(':').map(Number);
                    const [endH, endM] = workEndTime.split(':').map(Number);
                    const startMins = startH * 60 + startM;
                    const endMins = endH * 60 + endM;
                    const totalMins = endMins - startMins;
                    const hours = Math.floor(totalMins / 60);
                    const mins = totalMins % 60;
                    return `${hours}h ${mins > 0 ? `${mins}m` : ''}`;
                  })()
                ) : '--'}
              </p>
            </div>
            
            {/* Overtime */}
            <div className="bg-warning/10 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">Overtime Today</p>
              <p className="font-semibold text-sm text-warning">
                {attendanceState.overtime}
              </p>
            </div>
          </div>
          
          {/* Check-in/out times today */}
          {todayAttendance?.check_in_time && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Check-in:</span>
                <span className="font-medium text-success">
                  {new Date(todayAttendance.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {todayAttendance?.check_out_time && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Check-out:</span>
                  <span className="font-medium text-destructive">
                    {new Date(todayAttendance.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <StaffChecklistsWidget />
        {/* Daily Tasks - Responsive */}
        <div className="bg-card rounded-xl sm:rounded-2xl border border-border p-3 sm:p-4 mb-4 sm:mb-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
              <ListTodo className="w-4 h-4" />
              Today's Tasks
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] sm:text-xs bg-primary/10 text-primary px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
                {completedTasks}/{totalTasks}
              </span>
              <Button size="sm" variant="outline" className="h-7 sm:h-8 w-7 sm:w-8 p-0" onClick={() => setShowAddTask(true)}>
                <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No tasks for today. Add some!
              </p>
            ) : (
              tasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => toggleTaskComplete(task.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                    task.completed ? 'bg-success/10' : 'bg-secondary hover:bg-muted'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    task.completed ? 'bg-success border-success' : 'border-muted-foreground'
                  }`}>
                    {task.completed && <Check className="w-4 h-4 text-white" />}
                  </div>
                  <span className={`flex-1 text-left ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                    {task.title}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Quick Menu - Responsive */}
        <div className="space-y-1.5 sm:space-y-2 mb-4 sm:mb-6">
          {menuItems.map(item => (
            <button
              key={item.label}
              onClick={() => item.onClick ? item.onClick() : item.href && navigate(item.href)}
              className="w-full bg-card rounded-lg sm:rounded-xl border border-border p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:bg-muted/50 transition-colors touch-manipulation"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-secondary flex items-center justify-center shrink-0">
                <item.icon className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-medium text-sm sm:text-base truncate">{item.label}</p>
                <p className="text-[10px] sm:text-sm text-muted-foreground truncate">{item.description}</p>
              </div>
              {'badge' in item && (item as any).badge && (
                <span className="min-w-[18px] sm:min-w-[20px] h-4 sm:h-5 px-1 sm:px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] sm:text-xs flex items-center justify-center shrink-0">
                  {(item as any).badge}
                </span>
              )}
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>

        {/* Attendance History - Responsive */}
        <div className="bg-card rounded-xl sm:rounded-2xl border border-border p-3 sm:p-4 mb-4 sm:mb-6">
          <h3 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Clock className="w-4 h-4" />
            Recent Attendance
          </h3>
          
          <div className="space-y-2 sm:space-y-3">
            {isAttendanceLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : attendanceHistory.length === 0 ? (
              <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">
                No attendance records yet
              </p>
            ) : (
              attendanceHistory.map((record, idx) => (
                <div key={record.id || idx} className="flex items-center justify-between py-1.5 sm:py-2 border-b border-border last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-xs sm:text-sm">
                      {new Date(record.check_in_time).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                      {new Date(record.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      {record.check_out_time && (
                        <> — {new Date(record.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</>
                      )}
                      {record.check_in_distance && (
                        <span className="ml-1 sm:ml-2 text-primary">📍 {record.check_in_distance}m</span>
                      )}
                    </p>
                  </div>
                  <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full shrink-0 ${
                    record.status === 'checked_out' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
                  }`}>
                    {record.status === 'checked_out' ? 'Complete' : 'Active'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Salary History - Responsive */}
        <div className="bg-card rounded-xl sm:rounded-2xl border border-border p-3 sm:p-4">
          <h3 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
            <DollarSign className="w-4 h-4" />
            Salary History
          </h3>
          
          <div className="space-y-2 sm:space-y-3">
            {salaryRecords.map((record, idx) => (
              <div key={idx} className="flex items-center justify-between py-1.5 sm:py-2 border-b border-border last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-xs sm:text-sm">{record.month}</p>
                  {record.paidOn && (
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      Paid on {new Date(record.paidOn).toLocaleDateString('en-IN')}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sm sm:text-base">{formatCurrency(record.amount)}</p>
                  <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${
                    record.status === 'paid' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
                  }`}>
                    {record.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add Task Dialog */}
        <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Input
                placeholder="Task title..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddTask()}
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowAddTask(false)}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleAddTask}>
                  Add Task
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Store Location Settings Dialog */}
        <Dialog open={showLocationSettings} onOpenChange={setShowLocationSettings}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Configure Store Location</DialogTitle>
            </DialogHeader>
            {staff?.store_id && (
              <StoreLocationSettings storeId={staff.store_id} />
            )}
          </DialogContent>
        </Dialog>

        {/* Biometric Verification Dialog */}
        <Dialog open={showVerificationDialog} onOpenChange={setShowVerificationDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-center">
                {verificationAction === 'checkin' ? 'Verify to Check In' : 'Verify to Check Out'}
              </DialogTitle>
              <DialogDescription className="text-center">
                Please verify your identity using one of the methods below
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 pt-4">
              {/* Face Verification Option */}
              {storedFaceUrl && (
                <Button
                  variant="outline"
                  className="w-full h-16 flex items-center justify-center gap-3"
                  onClick={() => {
                    setShowVerificationDialog(false);
                    setShowFaceCapture(true);
                  }}
                  disabled={isVerifyingFace}
                >
                  {isVerifyingFace ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-primary" />
                  )}
                  <div className="text-left">
                    <p className="font-medium">Face Verification</p>
                    <p className="text-xs text-muted-foreground">Capture your face to verify</p>
                  </div>
                </Button>
              )}

              {/* Fingerprint Verification Option - show if fingerprint enabled */}
              {fingerprintEnabled && (
                <Button
                  variant="outline"
                  className="w-full h-16 flex items-center justify-center gap-3"
                  onClick={handleFingerprintVerification}
                  disabled={isBiometricAvailable === false}
                >
                  <Fingerprint className="w-6 h-6 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">Fingerprint</p>
                    <p className="text-xs text-muted-foreground">
                      {isBiometricAvailable === false ? 'Not available on this device' : 'Use device biometrics'}
                    </p>
                  </div>
                </Button>
              )}

              {/* No biometric configured */}
              {!storedFaceUrl && (!fingerprintEnabled || !isBiometricAvailable) && (
                <div className="text-center py-4">
                  <AlertCircle className="w-12 h-12 text-warning mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">
                    No biometric verification configured. Contact your manager to set up face or fingerprint verification.
                  </p>
                  <Button
                    onClick={async () => {
                      setShowVerificationDialog(false);
                      if (verificationAction === 'checkin') {
                        await checkIn('face');
                      } else {
                        await checkOut('face');
                      }
                    }}
                    className="w-full"
                  >
                    Proceed Without Verification
                  </Button>
                </div>
              )}

              {/* Dev-only bypass button */}
              {devBypassEnabled && verificationAction === 'checkin' && (
                <div className="space-y-2 pt-1">
                  <Button
                    variant="secondary"
                    className="w-full h-16 flex items-center justify-center gap-3"
                    onClick={async () => {
                      setShowVerificationDialog(false);
                      await checkIn('face');
                    }}
                  >
                    <span className="text-base">🧪 Proceed Without Verification</span>
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Development only. Skips biometric checks but keeps GPS and store validation.
                  </p>
                </div>
              )}

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setShowVerificationDialog(false)}
              >
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Face Capture Dialog */}
        <FaceCaptureDialog
          open={showFaceCapture}
          onOpenChange={setShowFaceCapture}
          onCapture={handleFaceCapture}
          title={verificationAction === 'checkin' ? 'Face Check-In' : 'Face Check-Out'}
          description="Position your face in the frame and capture"
        />

        {/* Attendance Calendar Dialog */}
        <Dialog open={showAttendanceCalendar} onOpenChange={setShowAttendanceCalendar}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Attendance History
              </DialogTitle>
              <DialogDescription>
                View your attendance records and statistics
              </DialogDescription>
            </DialogHeader>
            {staff && (
              <AttendanceCalendar userId={resolvedStaffId || staff.id} storeId={staff.store_id} />
            )}
          </DialogContent>
        </Dialog>

        {/* Overtime Report Dialog */}
        <Dialog open={showOvertimeReport} onOpenChange={setShowOvertimeReport}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Overtime & Salary Report
              </DialogTitle>
              <DialogDescription>
                Track your hours worked and earnings
              </DialogDescription>
            </DialogHeader>
            {staff && (
              <OvertimeReport 
                userId={resolvedStaffId || staff.id} 
                workStartTime={workStartTime} 
                workEndTime={workEndTime}
                hourlyRate={100}
                overtimeMultiplier={1.5}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default StaffDashboardPage;
