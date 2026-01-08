'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { uploadPhoto } from '@/lib/storage';
import { Camera, MapPin, LogIn, LogOut, Loader2, Plus, ChevronDown, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageToggle from '@/components/LanguageToggle';

function CheckInContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t, language } = useLanguage();

  // NFC/QR parameters (extracted from URL, then cleared)
  const [beneficiaryQrCode, setBeneficiaryQrCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [challengeToken, setChallengeToken] = useState<string>('');
  const [tapTimestamp, setTapTimestamp] = useState<string>('');
  const [validated, setValidated] = useState<boolean>(false);
  const [verificationMethod, setVerificationMethod] = useState<'nfc' | 'qr'>('nfc');
  const [locationError, setLocationError] = useState<string>('');

  const [elderly, setElderly] = useState<any>(null);
  const [caregiverName, setCaregiverName] = useState('');
  const [action, setAction] = useState<'check-in' | 'check-out'>('check-in');
  const [isTraining, setIsTraining] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [caregiverSuggestions, setCaregiverSuggestions] = useState<string[]>([]);
  const [activeCaregivers, setActiveCaregivers] = useState<string[]>([]);
  const [showAddCaregiver, setShowAddCaregiver] = useState(false);
  const [newCaregiverName, setNewCaregiverName] = useState('');
  const [showPhotoSection, setShowPhotoSection] = useState(false);
  const [savingNewCaregiver, setSavingNewCaregiver] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [showLocationHelp, setShowLocationHelp] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const photoPreviewRef = useRef<HTMLDivElement>(null);
  const hasProcessedParams = useRef(false);

  const TIME_WINDOW_MINUTES = 2;

  // Extract NFC/QR parameters from URL and clean up
  useEffect(() => {
    console.log('='.repeat(80));
    console.log('[CheckIn] useEffect triggered at:', new Date().toISOString());
    console.log('[CheckIn] Current URL:', typeof window !== 'undefined' ? window.location.href : 'SSR');

    const qrCode = searchParams.get('qr_code');
    const secretParam = searchParams.get('secret');
    const method = searchParams.get('method');

    console.log('[CheckIn] Raw params - QR Code:', qrCode, 'Secret:', secretParam ? 'EXISTS' : 'NONE', 'Method:', method);
    console.log('[CheckIn] hasProcessedParams.current:', hasProcessedParams.current);
    console.log('[CheckIn] Current state - blocked:', blocked, 'validated:', validated, 'loading:', loading);
    console.log('[CheckIn] Current sessionStorage:');
    console.log('  - card_tap_time:', sessionStorage.getItem('card_tap_time'));
    console.log('  - nfc_qr_code:', sessionStorage.getItem('nfc_qr_code'));
    console.log('  - verification_method:', sessionStorage.getItem('verification_method'));
    console.log('[CheckIn] Current tapTimestamp state:', tapTimestamp);

    // Reset processed flag if we have new URL parameters
    if (qrCode && secretParam) {
      console.log('[CheckIn] ⚡ NEW NFC TAP DETECTED - Resetting everything');
      hasProcessedParams.current = false;
      // Reset all state for new NFC tap
      console.log('[CheckIn] Setting blocked=false, error="", validated=false, loading=true');
      setBlocked(false);
      setError('');
      setValidated(false);
      setLoading(true); // Keep loading until processing completes
      // Clear old session data to prevent interference from previous taps
      console.log('[CheckIn] Clearing old sessionStorage data');
      sessionStorage.removeItem('card_tap_time');
      sessionStorage.removeItem('nfc_qr_code');
      sessionStorage.removeItem('verification_method');
      console.log('[CheckIn] Old sessionStorage cleared');
    }

    const processParams = () => {
      // Prevent double processing using ref
      if (hasProcessedParams.current) {
        console.log('[CheckIn] Already processed params, skipping');
        return;
      }
      hasProcessedParams.current = true;
      console.log('[CheckIn] Processing URL parameters...');

      console.log('[CheckIn] QR Code:', qrCode, 'Secret:', secretParam ? 'exists' : 'none', 'Method:', method);

      if (qrCode && secretParam) {
        console.log('[CheckIn] 🔐 NFC/Secret flow detected');
        // NFC tap detected (has secret token)
        const detectedMethod = (method === 'qr' || method === 'nfc') ? method : 'nfc';
        const newTimestamp = new Date().toISOString();

        console.log('[CheckIn] Generated new timestamp:', newTimestamp);
        console.log('[CheckIn] Detected method:', detectedMethod);
        console.log('[CheckIn] Setting state: beneficiaryQrCode, secret, verificationMethod, tapTimestamp');

        setBeneficiaryQrCode(qrCode);
        setSecret(secretParam);
        setVerificationMethod(detectedMethod);
        setTapTimestamp(newTimestamp);

        // Store in sessionStorage for validation (use the same timestamp)
        console.log('[CheckIn] Storing in sessionStorage with timestamp:', newTimestamp);
        sessionStorage.setItem('card_tap_time', newTimestamp);
        sessionStorage.setItem('nfc_qr_code', qrCode);
        sessionStorage.setItem('verification_method', detectedMethod);
        console.log('[CheckIn] sessionStorage updated successfully');

        // Clean the URL immediately to hide the secret
        console.log('[CheckIn] Cleaning URL to hide secret');
        window.history.replaceState({}, '', '/checkin');
        console.log('[CheckIn] URL cleaned');

        // Request challenge token from server
        console.log('[CheckIn] Requesting challenge token from server');
        requestChallengeToken(qrCode, secretParam, detectedMethod);
      } else if (qrCode && !secretParam) {
        // QR code scan detected (no secret) - geolocation is MANDATORY
        // Reset blocked state for new QR scan
        setBlocked(false);
        setError('');
        // Clear old session data to prevent interference
        sessionStorage.removeItem('card_tap_time');
        sessionStorage.removeItem('nfc_qr_code');
        sessionStorage.removeItem('verification_method');

        setBeneficiaryQrCode(qrCode);
        setVerificationMethod('qr');
        setValidated(true); // Allow form to load, but geolocation required
        setTapTimestamp(new Date().toISOString());

        // Store in sessionStorage
        sessionStorage.setItem('card_tap_time', new Date().toISOString());
        sessionStorage.setItem('nfc_qr_code', qrCode);
        sessionStorage.setItem('verification_method', 'qr');

        // Clean URL
        window.history.replaceState({}, '', '/checkin');
      } else {
        // No parameters - check if there's a recent tap in session
        console.log('[CheckIn] 📋 No URL parameters - checking sessionStorage');
        const recentTap = sessionStorage.getItem('card_tap_time');
        const storedQrCode = sessionStorage.getItem('nfc_qr_code');
        const storedMethod = sessionStorage.getItem('verification_method') as 'nfc' | 'qr';

        console.log('[CheckIn] sessionStorage values:');
        console.log('  - recentTap:', recentTap);
        console.log('  - storedQrCode:', storedQrCode);
        console.log('  - storedMethod:', storedMethod);

        if (!recentTap || !storedQrCode) {
          // No valid tap, block the form
          console.log('[CheckIn] ❌ No valid tap in session - blocking form');
          setBlocked(true);
          setLoading(false);
          return;
        }

        // Check if tap is still valid (within TIME_WINDOW_MINUTES)
        const tapTime = new Date(recentTap).getTime();
        const now = Date.now();
        const minutesElapsed = (now - tapTime) / 1000 / 60;

        console.log('[CheckIn] ⏰ Time validation:');
        console.log('  - tapTime:', new Date(tapTime).toISOString());
        console.log('  - now:', new Date(now).toISOString());
        console.log('  - minutesElapsed:', minutesElapsed.toFixed(2));
        console.log('  - TIME_WINDOW_MINUTES:', TIME_WINDOW_MINUTES);

        if (minutesElapsed > TIME_WINDOW_MINUTES) {
          // Tap expired - clear session and show full error
          console.log('[CheckIn] ⏱️ Session EXPIRED - clearing and blocking');
          setBlocked(true);
          setError(
            'Veuillez taper la carte du bénéficiaire ou scanner le code QR à nouveau pour commencer la visite. / Please tap the beneficiary\'s card or scan the QR code again to start the visit.'
          );
          sessionStorage.removeItem('card_tap_time');
          sessionStorage.removeItem('nfc_qr_code');
          sessionStorage.removeItem('verification_method');
          setLoading(false);
          return;
        }

        // Valid session exists but secret already cleaned
        console.log('[CheckIn] ✅ Valid session found - restoring state');
        setBeneficiaryQrCode(storedQrCode);
        setVerificationMethod(storedMethod || 'nfc');
        setTapTimestamp(recentTap); // Restore the tap timestamp from session
        console.log('[CheckIn] State restored from session');
      }
    };

    processParams();
  }, [searchParams]);

  const requestChallengeToken = async (qrCode: string, secret: string, method: 'nfc' | 'qr') => {
    console.log('[Challenge] 🔑 Requesting challenge token');
    console.log('[Challenge] qrCode:', qrCode, 'method:', method);
    try {
      const requestTimestamp = new Date().toISOString();
      console.log('[Challenge] Request timestamp:', requestTimestamp);

      const response = await fetch('/api/nfc/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_code: qrCode,
          secret: secret,
          method: method,
          timestamp: requestTimestamp,
        }),
      });

      console.log('[Challenge] Response status:', response.status);
      const data = await response.json();
      console.log('[Challenge] Response data:', data);

      if (data.success) {
        console.log('[Challenge] ✅ Challenge token received, setting validated=true');
        setChallengeToken(data.challengeToken);
        setValidated(true);
      } else {
        console.log('[Challenge] ❌ Challenge failed:', data.message);
        setError(data.message || (language === 'fr' ? 'Échec de la validation' : 'Validation failed'));
        setBlocked(true);
      }
    } catch (err) {
      console.error('[Challenge] ⚠️ Error requesting challenge token:', err);
      setError(language === 'fr'
        ? 'Impossible de valider la carte/code QR'
        : 'Failed to validate card/QR code');
      setBlocked(true);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (beneficiaryQrCode && !blocked && isMounted) {
        await loadElderlyData();
        // Don't auto-request location for NFC (optional)
        // Location is only mandatory for QR code method
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [beneficiaryQrCode, blocked]);

  // Show location modal for QR method if location not available
  useEffect(() => {
    if (verificationMethod === 'qr' && validated && !location) {
      setShowLocationHelp(true);
    }
  }, [verificationMethod, validated, location]);

  // Countdown timer for NFC tap expiration
  useEffect(() => {
    console.log('[Countdown] Timer effect triggered - tapTimestamp:', tapTimestamp, 'validated:', validated, 'loading:', loading);

    // Don't start countdown while loading or if not validated
    if (!tapTimestamp || !validated || loading) {
      console.log('[Countdown] Conditions not met - not starting timer');
      setTimeRemaining(null);
      return;
    }

    console.log('[Countdown] ⏲️ Starting countdown timer');

    const updateTimer = () => {
      const now = new Date().getTime();
      const tapTime = new Date(tapTimestamp).getTime();
      const secondsElapsed = (now - tapTime) / 1000;
      const secondsRemaining = (TIME_WINDOW_MINUTES * 60) - secondsElapsed;

      console.log('[Countdown] Timer update - secondsRemaining:', secondsRemaining.toFixed(1));

      if (secondsRemaining <= 0) {
        console.log('[Countdown] ⏱️ TIME EXPIRED - blocking form');
        setTimeRemaining(0);
        setBlocked(true);
        setValidated(false);
        setError('Délai expiré. Veuillez taper à nouveau la carte. / Time expired. Please tap the card again.');
      } else {
        setTimeRemaining(Math.ceil(secondsRemaining));
      }
    };

    // Update immediately
    updateTimer();

    // Update every second
    const interval = setInterval(updateTimer, 1000);

    return () => {
      console.log('[Countdown] Cleaning up timer interval');
      clearInterval(interval);
    };
  }, [tapTimestamp, validated, loading, t]);

  // Load caregiver names after elderly data is loaded
  useEffect(() => {
    let isMounted = true;

    const loadNames = async () => {
      if (elderly?.id && isMounted) {
        await loadCaregiverNames();
      }
    };

    loadNames();

    return () => {
      isMounted = false;
    };
  }, [elderly?.id]);

  const loadElderlyData = async (retryCount = 0) => {
    console.log('[CheckIn] Loading elderly data for QR:', beneficiaryQrCode, 'Retry:', retryCount);

    try {
      // Add timeout to the query with AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      console.log('[CheckIn] Fetching beneficiary data...');
      const { data, error } = await supabase
        .from('beneficiaries')
        .select('*')
        .eq('qr_code', beneficiaryQrCode)
        .abortSignal(controller.signal)
        .single();

      clearTimeout(timeoutId);

      if (error) {
        console.error('[CheckIn] Supabase error:', error);
        throw error;
      }

      console.log('[CheckIn] Elderly data loaded:', data.name);
      setElderly(data);

      // Check for active caregivers
      console.log('[CheckIn] Checking active caregivers...');
      await checkActiveCaregivers(data.id);
      console.log('[CheckIn] Active caregivers check complete');
    } catch (err: any) {
      console.error('[CheckIn] Error loading elderly data:', err);

      // Retry once on timeout or network error
      if (retryCount === 0 && (err.name === 'AbortError' || err.message?.includes('network'))) {
        console.log('[CheckIn] Retrying query...');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        return loadElderlyData(1); // Retry
      }

      if (err.name === 'AbortError') {
        setError(language === 'fr'
          ? 'Délai d\'attente dépassé. Veuillez réessayer.'
          : 'Request timeout. Please try again.');
      } else {
        setError(t('checkIn.invalidQR'));
      }
      setBlocked(true);
    } finally {
      console.log('[CheckIn] Setting loading to false');
      setLoading(false);
    }
  };

  const checkActiveCaregivers = async (beneficiaryId: string) => {
    try {
      // Get all check-ins/outs (not just today) to determine who's currently active
      const { data: checkIns, error } = await supabase
        .from('check_in_outs')
        .select('*')
        .eq('beneficiary_id', beneficiaryId)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      console.log('All check-ins/outs:', checkIns);

      // Determine who is currently checked in (looking at ALL history, not just today)
      const activeMap = new Map<string, boolean>();

      checkIns?.forEach(ci => {
        const name = ci.caregiver_name;
        const action = ci.action;
        console.log(`Processing: "${name}" - "${action}" at ${ci.timestamp}`);

        if (action === 'check-in') {
          activeMap.set(name, true);
          console.log(`  ✓ Set "${name}" to ACTIVE`);
        } else if (action === 'check-out') {
          activeMap.set(name, false);
          console.log(`  ✗ Set "${name}" to INACTIVE`);
        } else {
          console.log(`  ? Unknown action: "${action}"`);
        }
      });

      // Get list of currently active caregivers
      const active = Array.from(activeMap.entries())
        .filter(([_, isActive]) => isActive)
        .map(([name, _]) => name);

      console.log('Active caregivers map:', Array.from(activeMap.entries()));
      console.log('Currently active:', active);

      setActiveCaregivers(active);

      // Smart default logic
      if (active.length > 0) {
        setAction('check-out');
        setCaregiverName(active[0]);
      } else {
        setAction('check-in');
        if (checkIns.length > 0) {
          setCaregiverName(checkIns[checkIns.length - 1].caregiver_name);
        }
      }
    } catch (err) {
      console.error('Error checking active caregivers:', err);
    }
  };

  const loadCaregiverNames = async () => {
    if (!elderly?.id) {
      console.log('[CheckIn] Skipping caregiver load - no elderly ID');
      return;
    }

    console.log('[CheckIn] Loading caregiver names for beneficiary:', elderly.id);
    try {
      const { data, error} = await supabase
        .from('caregivers')
        .select('name')
        .eq('beneficiary_id', elderly.id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const names = data.map(c => c.name);
      console.log('[CheckIn] Loaded caregiver names:', names);
      setCaregiverSuggestions(names);
    } catch (err) {
      console.error('[CheckIn] Error loading caregiver names:', err);
    }
  };

  const handleDropdownChange = (value: string) => {
    if (value === '__add_new__') {
      setShowAddCaregiver(true);
      setNewCaregiverName('');
      return;
    }

    setCaregiverName(value);

    if (activeCaregivers.includes(value)) {
      setAction('check-out');
    } else {
      setAction('check-in');
    }
  };

  const handleAddNewCaregiver = async () => {
    if (!newCaregiverName.trim()) {
      setError(t('checkIn.enterNameError'));
      return;
    }

    if (!elderly?.id) {
      setError(language === 'fr' ? 'Bénéficiaire introuvable' : 'Beneficiary not found');
      return;
    }

    setSavingNewCaregiver(true);
    setError('');

    try {
      const nameParts = newCaregiverName.trim().split(' ');
      const normalizedName = nameParts.length >= 2
        ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase() + ' ' + nameParts[1].toUpperCase()
        : newCaregiverName.trim().charAt(0).toUpperCase() + newCaregiverName.trim().slice(1).toLowerCase();

      const { data: existing } = await supabase
        .from('caregivers')
        .select('id, name')
        .eq('beneficiary_id', elderly.id)
        .ilike('name', normalizedName)
        .single();

      if (existing) {
        setCaregiverName(existing.name);
        if (activeCaregivers.includes(existing.name)) {
          setAction('check-out');
        } else {
          setAction('check-in');
        }
      } else {
        const { error } = await supabase
          .from('caregivers')
          .insert({
            beneficiary_id: elderly.id,
            name: normalizedName
          });

        if (error) throw error;

        setCaregiverName(normalizedName);
        setAction('check-in');
      }

      setShowAddCaregiver(false);
      setNewCaregiverName('');
      await loadCaregiverNames();
    } catch (err: any) {
      console.error('Error adding caregiver:', err);
      setError(err?.message || (language === 'fr'
        ? 'Erreur lors de l\'ajout du nouveau soignant'
        : 'Error adding new caregiver'));
    } finally {
      setSavingNewCaregiver(false);
    }
  };

  const getCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setLocationError('');
          setShowLocationHelp(false);
        },
        (error) => {
          console.error('Error getting location:', error);
          setShowLocationHelp(false); // Close modal on error
          if (error.code === error.PERMISSION_DENIED) {
            setLocationError('Location access denied');
            setError(language === 'fr'
              ? 'Accès à la localisation refusé. Veuillez activer la localisation dans les paramètres de votre navigateur.'
              : 'Location access denied. Please enable location in your browser settings.');
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            setLocationError('Location unavailable');
            setError(language === 'fr'
              ? 'Position indisponible. Vérifiez que le GPS est activé.'
              : 'Location unavailable. Check that GPS is enabled.');
          } else if (error.code === error.TIMEOUT) {
            setLocationError('Location request timeout');
            setError(language === 'fr'
              ? 'Délai d\'attente de localisation expiré.'
              : 'Location request timeout.');
          }
        }
      );
    } else {
      setLocationError('Geolocation not supported');
      setError(language === 'fr'
        ? 'Géolocalisation non prise en charge par ce navigateur.'
        : 'Geolocation not supported by this browser.');
    }
  };

  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' }
      });
      streamRef.current = stream;
      setCameraActive(true);

      // Wait for next render cycle to ensure video element exists
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;

          // Wait for video to load metadata before scrolling
          videoRef.current.onloadedmetadata = () => {
            setTimeout(() => {
              videoRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
              });
            }, 100);
          };
        }
      }, 100);
    } catch (err) {
      console.error('Camera error:', err);
      setError(t('checkIn.cameraError'));
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      setPhoto(canvas.toDataURL('image/jpeg'));
    }
    stopCamera();

    // Scroll to photo preview after capture
    setTimeout(() => {
      photoPreviewRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 100);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setCameraActive(false);
  };

  const retakePhoto = () => {
    setPhoto(null);
    startCamera();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Block submission if no valid tap
    if (!validated || blocked) {
      setError(language === 'fr'
        ? 'Veuillez taper la carte du bénéficiaire ou scanner le code QR pour commencer la visite.'
        : 'Please tap the beneficiary\'s card or scan the QR code to start the visit.'
      );
      return;
    }

    // For QR code method (no secret), geolocation is MANDATORY
    if (verificationMethod === 'qr' && (!location || !location.lat || !location.lng)) {
      setError(language === 'fr'
        ? 'La localisation est requise pour le code QR. Veuillez cliquer sur "Localisation requise" ci-dessus.'
        : 'Geolocation is required for QR code. Please click "Geolocation required" above.');
      setLocationError('Location required for QR code check-in');
      return;
    }

    // For NFC method (has secret), challenge token is required
    if (verificationMethod === 'nfc' && !challengeToken) {
      setError(language === 'fr'
        ? 'Tap NFC invalide. Veuillez taper à nouveau la carte.'
        : 'Invalid NFC tap. Please tap the card again.');
      return;
    }

    if (!caregiverName.trim()) {
      setError(t('checkIn.enterNameError'));
      return;
    }

    // Validate time window: form must be submitted within TIME_WINDOW_MINUTES of NFC tap
    const now = new Date().getTime();
    const tapTime = new Date(tapTimestamp).getTime();
    const minutesElapsed = (now - tapTime) / 1000 / 60;

    if (minutesElapsed > TIME_WINDOW_MINUTES) {
      setError(
        `Délai expiré. Vous devez soumettre dans les ${TIME_WINDOW_MINUTES} minutes suivant le tap de la carte. Veuillez taper à nouveau la carte. / Time expired. You must submit within ${TIME_WINDOW_MINUTES} minutes of tapping the card. Please tap the card again.`
      );
      setBlocked(true);
      setValidated(false);
      return;
    }

    setSubmitting(true);
    setError('');
    setLocationError('');

    try {
      let photoUrl = null;

      if (photo) {
        photoUrl = await uploadPhoto(photo, elderly.id, new Date().toISOString());
      }

      // Submit with validation
      console.log('Submitting check-in with verification method:', verificationMethod);
      const response = await fetch('/api/checkin/nfc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beneficiary_qr_code: beneficiaryQrCode,
          secret: secret,
          challenge_token: challengeToken,
          tap_timestamp: tapTimestamp,
          verification_method: verificationMethod,
          caregiver_name: caregiverName.trim(),
          action,
          is_training: isTraining,
          photo_url: photoUrl,
          latitude: location?.lat || null,
          longitude: location?.lng || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      setSuccess(true);

      // Clear session storage
      sessionStorage.removeItem('card_tap_time');
      sessionStorage.removeItem('nfc_qr_code');
      sessionStorage.removeItem('verification_method');

      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch (err: any) {
      console.error('Submit error:', err);
      setError(err.message || t('checkIn.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  // Blocked state - no valid NFC tap or expired
  if (blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-full mb-6">
            <AlertCircle className="text-red-600" size={40} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Carte ou code QR requis
          </h1>
          <h2 className="text-lg font-semibold text-gray-700 mb-4">
            Card or QR Code Required
          </h2>
          {error ? (
            <p className="text-gray-700 mb-2">
              {error}
            </p>
          ) : (
            <>
              <p className="text-gray-700 mb-2 font-medium">
                Veuillez taper la carte NFC du bénéficiaire ou scanner le code QR pour commencer votre visite.
              </p>
              <p className="text-gray-600 mb-4">
                Please tap the beneficiary's NFC card or scan the QR code to start your visit.
              </p>
              <p className="text-sm text-gray-500 italic">
                Les favoris enregistrés et les liens directs ne sont pas autorisés pour des raisons de sécurité.
              </p>
              <p className="text-sm text-gray-500 italic">
                Saved bookmarks and direct links are not allowed for security reasons.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4 text-blue-600" size={48} />
          <p className="text-gray-700">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
            {action === 'check-in' ? (
              <LogIn className="text-green-600" size={40} />
            ) : (
              <LogOut className="text-green-600" size={40} />
            )}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {action === 'check-in' ? t('checkIn.checkedIn') : t('checkIn.checkedOut')}
          </h2>
          <p className="text-gray-700">{t('checkIn.recordedSuccessfully')}</p>
        </div>
      </div>
    );
  }

  // Main form
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                {t('checkIn.title')}
              </h1>
              {elderly && (
                <p className="text-gray-600">
                  {t('checkIn.forBeneficiary')} <span className="font-semibold">{elderly.name}</span>
                </p>
              )}
              {validated && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    ✓ {verificationMethod === 'nfc'
                      ? (language === 'fr' ? 'Carte vérifiée' : 'Card verified')
                      : (language === 'fr' ? 'Code QR vérifié' : 'QR code verified')}
                  </p>
                  {timeRemaining !== null && timeRemaining > 0 && (
                    <p className={`text-xs flex items-center gap-1 ${
                      timeRemaining <= 60 ? 'text-red-600 font-bold animate-pulse' : 'text-gray-600'
                    }`}>
                      ⏱️ {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                      {' '}
                      {language === 'fr' ? 'restantes' : 'remaining'}
                    </p>
                  )}
                  {verificationMethod === 'qr' && (
                    <button
                      type="button"
                      onClick={() => setShowLocationHelp(true)}
                      className={`text-xs flex items-center gap-1 hover:underline cursor-pointer ${
                        location
                          ? 'text-green-600 hover:text-green-700'
                          : 'text-orange-600 hover:text-orange-700'
                      }`}
                    >
                      <MapPin size={12} />
                      {location
                        ? (language === 'fr' ? '✓ Localisation activée' : '✓ Location enabled')
                        : (language === 'fr' ? 'Localisation requise - Cliquer ici' : 'Geolocation required - Click here')}
                    </button>
                  )}
                </div>
              )}
            </div>
            <LanguageToggle />
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Hidden fields */}
            <input type="hidden" value={beneficiaryQrCode} />
            <input type="hidden" value={secret} />
            <input type="hidden" value={challengeToken} />
            <input type="hidden" value={tapTimestamp} />
            <input type="hidden" value={verificationMethod} />

            {/* Caregiver Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('checkIn.yourName')}
              </label>

              {showAddCaregiver ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={newCaregiverName}
                    onChange={(e) => setNewCaregiverName(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    placeholder={t('checkIn.typeYourName')}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddNewCaregiver}
                      disabled={savingNewCaregiver}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {savingNewCaregiver ? <Loader2 className="animate-spin mx-auto" size={20} /> : t('checkIn.saveMyName')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddCaregiver(false);
                        setNewCaregiverName('');
                      }}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : caregiverSuggestions.length > 0 ? (
                <select
                  value={caregiverName}
                  onChange={(e) => handleDropdownChange(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                >
                  <option value="">{t('checkIn.selectName')}</option>

                  {/* Active caregivers optgroup */}
                  {activeCaregivers.length > 0 && (
                    <optgroup label={t('checkIn.activeNow')}>
                      {activeCaregivers.map(name => {
                        console.log('Rendering active caregiver:', name);
                        return <option key={name} value={name}>✓ {name}</option>;
                      })}
                    </optgroup>
                  )}

                  {/* Other caregivers optgroup */}
                  {caregiverSuggestions.filter(name => !activeCaregivers.includes(name)).length > 0 && (
                    <optgroup label={t('checkIn.allCaregivers')}>
                      {caregiverSuggestions
                        .filter(name => {
                          const isActive = activeCaregivers.includes(name);
                          console.log(`Caregiver "${name}" - isActive: ${isActive}`);
                          return !isActive;
                        })
                        .map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                    </optgroup>
                  )}

                  <option value="__add_new__">+ {t('checkIn.addYourName')}</option>
                </select>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddCaregiver(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-700 hover:border-blue-500 hover:text-blue-600 transition-colors"
                >
                  <Plus size={20} />
                  {t('checkIn.addYourName')}
                </button>
              )}
            </div>

            {/* Action Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('checkIn.action')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAction('check-in')}
                  className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                    action === 'check-in'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <LogIn className="inline mr-2" size={20} />
                  {t('checkIn.checkIn')}
                </button>
                <button
                  type="button"
                  onClick={() => setAction('check-out')}
                  className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                    action === 'check-out'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <LogOut className="inline mr-2" size={20} />
                  {t('checkIn.checkOut')}
                </button>
              </div>
            </div>

            {/* Training Checkbox */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                id="training"
                checked={isTraining}
                onChange={(e) => setIsTraining(e.target.checked)}
                className="w-5 h-5 text-blue-600"
              />
              <label htmlFor="training" className="text-sm text-gray-700">
                {t('checkIn.training')} <span className="text-gray-500">({t('checkIn.trainingHelp')})</span>
              </label>
            </div>

            {/* Location Display */}
            {verificationMethod === 'qr' && (
              <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-lg ${
                location
                  ? 'text-green-700 bg-green-50 border border-green-200'
                  : 'text-orange-700 bg-orange-50 border border-orange-200'
              }`}>
                <MapPin size={16} />
                {location
                  ? '✓ ' + t('checkIn.locationCaptured')
                  : '⚠ Geolocation required - Please enable location services'}
                {locationError && (
                  <span className="block text-xs mt-1 text-orange-600">{locationError}</span>
                )}
              </div>
            )}
            {verificationMethod === 'nfc' && location && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-4 py-2 rounded-lg">
                <MapPin size={16} />
                {t('checkIn.locationCaptured')}
              </div>
            )}

            {/* Photo Section */}
            <div>
              <button
                type="button"
                onClick={() => setShowPhotoSection(!showPhotoSection)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2"
              >
                <Camera size={16} />
                {t('checkIn.photoOptional')}
                <ChevronDown
                  size={16}
                  className={`transition-transform ${showPhotoSection ? 'rotate-180' : ''}`}
                />
              </button>

              {showPhotoSection && (
                <div className="space-y-3">
                  {!photo && !cameraActive && (
                    <button
                      type="button"
                      onClick={startCamera}
                      className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <Camera size={20} />
                      {t('checkIn.takePhoto')}
                    </button>
                  )}

                  {cameraActive && (
                    <div className="space-y-3">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full rounded-lg"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={capturePhoto}
                          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          {t('checkIn.capture')}
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  )}

                  {photo && (
                    <div ref={photoPreviewRef} className="space-y-3">
                      <img src={photo} alt="Captured" className="w-full rounded-lg" />
                      <button
                        type="button"
                        onClick={retakePhoto}
                        className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                      >
                        {t('checkIn.retake')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || !caregiverName.trim()}
              className={`w-full py-4 rounded-lg font-semibold text-white transition-colors ${
                submitting || !caregiverName.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : action === 'check-in'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin" size={20} />
                  {t('checkIn.submitting')}
                </span>
              ) : (
                t('checkIn.submit')
              )}
            </button>
          </form>
        </div>

        {/* Location Permission Modal */}
        {showLocationHelp && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <MapPin className="text-blue-600" size={32} />
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {language === 'fr' ? 'Localisation requise' : 'Location Required'}
                </h3>

                <p className="text-gray-700 mb-6">
                  {language === 'fr'
                    ? "Activez votre géolocalisation pour soumettre votre arrivée"
                    : "Enable your geolocation to submit your arrival"}
                </p>

                <div className="w-full space-y-3">
                  <button
                    onClick={() => {
                      getCurrentLocation();
                    }}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                  >
                    {language === 'fr' ? 'Activer' : 'Enable'}
                  </button>
                  <button
                    onClick={() => setShowLocationHelp(false)}
                    className="w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {language === 'fr' ? 'Annuler' : 'Cancel'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CheckInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4 text-blue-600" size={48} />
          <p className="text-gray-700">Loading...</p>
        </div>
      </div>
    }>
      <CheckInContent />
    </Suspense>
  );
}

