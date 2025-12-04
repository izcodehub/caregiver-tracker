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
  const { t } = useLanguage();

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

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const photoPreviewRef = useRef<HTMLDivElement>(null);

  // Extract NFC/QR parameters from URL and clean up
  useEffect(() => {
    const qrCode = searchParams.get('qr_code');
    const secretParam = searchParams.get('secret');
    const method = searchParams.get('method'); // 'nfc' or 'qr'

    if (qrCode && secretParam) {
      // NFC tap detected (has secret token)
      const detectedMethod = (method === 'qr' || method === 'nfc') ? method : 'nfc';

      setBeneficiaryQrCode(qrCode);
      setSecret(secretParam);
      setVerificationMethod(detectedMethod);
      setTapTimestamp(new Date().toISOString());

      // Store in sessionStorage for validation
      sessionStorage.setItem('card_tap_time', new Date().toISOString());
      sessionStorage.setItem('nfc_qr_code', qrCode);
      sessionStorage.setItem('verification_method', detectedMethod);

      // Clean the URL immediately to hide the secret
      window.history.replaceState({}, '', '/checkin');

      // Request challenge token from server
      requestChallengeToken(qrCode, secretParam, detectedMethod);
    } else if (qrCode && !secretParam) {
      // QR code scan detected (no secret) - geolocation is MANDATORY
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
      const recentTap = sessionStorage.getItem('card_tap_time');
      const storedQrCode = sessionStorage.getItem('nfc_qr_code');
      const storedMethod = sessionStorage.getItem('verification_method') as 'nfc' | 'qr';

      if (!recentTap || !storedQrCode) {
        // No valid tap, block the form
        setBlocked(true);
        setLoading(false);
        return;
      }

      // Check if tap is still valid (within 15 minutes)
      const tapTime = new Date(recentTap).getTime();
      const now = Date.now();
      const minutesElapsed = (now - tapTime) / 1000 / 60;

      if (minutesElapsed > 15) {
        // Tap expired
        setBlocked(true);
        sessionStorage.removeItem('card_tap_time');
        sessionStorage.removeItem('nfc_qr_code');
        sessionStorage.removeItem('verification_method');
        setLoading(false);
        return;
      }

      // Valid session exists but secret already cleaned
      setBeneficiaryQrCode(storedQrCode);
      setVerificationMethod(storedMethod || 'nfc');
    }
  }, [searchParams]);

  const requestChallengeToken = async (qrCode: string, secret: string, method: 'nfc' | 'qr') => {
    try {
      const response = await fetch('/api/nfc/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_code: qrCode,
          secret: secret,
          method: method,
          timestamp: new Date().toISOString(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setChallengeToken(data.challengeToken);
        setValidated(true);
      } else {
        setError(data.message || 'Validation failed');
        setBlocked(true);
      }
    } catch (err) {
      console.error('Error requesting challenge token:', err);
      setError('Failed to validate card/QR code');
      setBlocked(true);
    }
  };

  useEffect(() => {
    if (beneficiaryQrCode && !blocked) {
      loadElderlyData();
      getCurrentLocation();
    }
  }, [beneficiaryQrCode, blocked]);

  // Load caregiver names after elderly data is loaded
  useEffect(() => {
    if (elderly?.id) {
      loadCaregiverNames();
    }
  }, [elderly?.id]);

  const loadElderlyData = async () => {
    try {
      const { data, error } = await supabase
        .from('beneficiaries')
        .select('*')
        .eq('qr_code', beneficiaryQrCode)
        .single();

      if (error) throw error;
      setElderly(data);

      // Check for active caregivers
      await checkActiveCaregivers(data.id);
    } catch (err) {
      console.error('Error loading elderly data:', err);
      setError(t('checkIn.invalidQR'));
      setBlocked(true);
    } finally {
      setLoading(false);
    }
  };

  const checkActiveCaregivers = async (beneficiaryId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: checkIns, error } = await supabase
        .from('check_in_outs')
        .select('*')
        .eq('beneficiary_id', beneficiaryId)
        .gte('timestamp', `${today}T00:00:00`)
        .lte('timestamp', `${today}T23:59:59`)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      // Determine who is currently checked in
      const activeMap = new Map<string, boolean>();

      checkIns.forEach(ci => {
        if (ci.action === 'check-in') {
          activeMap.set(ci.caregiver_name, true);
        } else if (ci.action === 'check-out') {
          activeMap.set(ci.caregiver_name, false);
        }
      });

      // Get list of currently active caregivers
      const active = Array.from(activeMap.entries())
        .filter(([_, isActive]) => isActive)
        .map(([name, _]) => name);

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
    if (!elderly?.id) return;

    try {
      const { data, error} = await supabase
        .from('caregivers')
        .select('name')
        .eq('beneficiary_id', elderly.id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const names = data.map(c => c.name);
      setCaregiverSuggestions(names);
    } catch (err) {
      console.error('Error loading caregiver names:', err);
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
      setError('Beneficiary not found');
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
      setError(err?.message || 'Error adding new caregiver');
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
          if (error.code === error.PERMISSION_DENIED) {
            setLocationError('Location access denied');
            if (verificationMethod === 'qr') {
              setShowLocationHelp(true);
            }
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            setLocationError('Location unavailable');
          } else if (error.code === error.TIMEOUT) {
            setLocationError('Location request timeout');
          }
        }
      );
    } else {
      setLocationError('Geolocation not supported');
    }
  };

  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
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
      setError('Please tap the beneficiary\'s card/QR code to start the visit.');
      return;
    }

    // For QR code method (no secret), geolocation is MANDATORY
    if (verificationMethod === 'qr' && (!location || !location.lat || !location.lng)) {
      setError('Geolocation is required when using QR code. Please enable location services.');
      setLocationError('Location required for QR code check-in');
      setShowLocationHelp(true);
      return;
    }

    // For NFC method (has secret), challenge token is required
    if (verificationMethod === 'nfc' && !challengeToken) {
      setError('Invalid NFC tap. Please tap the card again.');
      return;
    }

    if (!caregiverName.trim()) {
      setError(t('checkIn.enterNameError'));
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

  // Blocked state - no valid NFC tap
  if (blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-full mb-6">
            <AlertCircle className="text-red-600" size={40} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Card or QR Code Required
          </h1>
          <p className="text-gray-700 mb-2">
            Please tap the beneficiary's NFC card or scan the QR code to start your visit.
          </p>
          <p className="text-sm text-gray-500">
            Saved bookmarks and direct links are not allowed for security reasons.
          </p>
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
                    ✓ {verificationMethod === 'nfc' ? 'NFC verified' : 'QR code verified'}
                  </p>
                  {verificationMethod === 'qr' && (
                    <p className="text-xs text-orange-600 flex items-center gap-1">
                      <MapPin size={12} /> Geolocation required
                    </p>
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
              ) : (
                <div className="space-y-3">
                  {activeCaregivers.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-green-900 mb-2">{t('checkIn.activeNow')}</p>
                      <div className="space-y-1">
                        {activeCaregivers.map(name => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => {
                              setCaregiverName(name);
                              setAction('check-out');
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                              caregiverName === name && action === 'check-out'
                                ? 'bg-green-600 text-white'
                                : 'bg-white text-gray-900 border border-green-300 hover:bg-green-100'
                            }`}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {caregiverSuggestions.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">{t('checkIn.allCaregivers')}</p>
                      <select
                        value={caregiverName}
                        onChange={(e) => handleDropdownChange(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                      >
                        <option value="">{t('checkIn.selectName')}</option>
                        {caregiverSuggestions.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                        <option value="__add_new__">+ {t('checkIn.addYourName')}</option>
                      </select>
                    </div>
                  )}

                  {caregiverSuggestions.length === 0 && (
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
                    <div className="space-y-3">
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

        {/* Location Help Modal */}
        {showLocationHelp && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <MapPin className="text-red-600" size={24} />
                  Location Required
                </h3>
                <button
                  onClick={() => setShowLocationHelp(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <AlertCircle size={24} />
                </button>
              </div>

              <div className="space-y-4 text-sm text-gray-700">
                <p className="font-semibold text-red-600">
                  QR code check-in requires your location to verify you are on-site.
                </p>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="font-semibold text-blue-900 mb-2">How to enable location:</p>

                  {/* Detect browser/device */}
                  {typeof navigator !== 'undefined' && (
                    <>
                      {/* iOS Safari */}
                      {/iPhone|iPad|iPod/.test(navigator.userAgent) && (
                        <ol className="list-decimal list-inside space-y-2 text-blue-800">
                          <li>Go to iPhone <strong>Settings</strong></li>
                          <li>Scroll down and tap <strong>Safari</strong></li>
                          <li>Tap <strong>Location</strong></li>
                          <li>Select <strong>Ask</strong> or <strong>Allow</strong></li>
                          <li>Return here and tap the button below to try again</li>
                        </ol>
                      )}

                      {/* Android Chrome */}
                      {/Android/.test(navigator.userAgent) && /Chrome/.test(navigator.userAgent) && (
                        <ol className="list-decimal list-inside space-y-2 text-blue-800">
                          <li>Tap the <strong>lock icon</strong> or <strong>site settings</strong> in the address bar</li>
                          <li>Tap <strong>Permissions</strong></li>
                          <li>Find <strong>Location</strong> and select <strong>Allow</strong></li>
                          <li>Tap the button below to try again</li>
                        </ol>
                      )}

                      {/* Desktop Chrome/Edge */}
                      {!/iPhone|iPad|iPod|Android/.test(navigator.userAgent) && /Chrome|Edg/.test(navigator.userAgent) && (
                        <ol className="list-decimal list-inside space-y-2 text-blue-800">
                          <li>Click the <strong>lock icon</strong> in the address bar</li>
                          <li>Click <strong>Site settings</strong></li>
                          <li>Find <strong>Location</strong> and select <strong>Allow</strong></li>
                          <li>Refresh the page or click the button below</li>
                        </ol>
                      )}

                      {/* Desktop Firefox */}
                      {!/iPhone|iPad|iPod|Android/.test(navigator.userAgent) && /Firefox/.test(navigator.userAgent) && (
                        <ol className="list-decimal list-inside space-y-2 text-blue-800">
                          <li>Click the <strong>permissions icon</strong> in the address bar</li>
                          <li>Find <strong>Access Your Location</strong></li>
                          <li>Click the <strong>X</strong> to remove the block</li>
                          <li>Refresh the page or click the button below</li>
                        </ol>
                      )}

                      {/* Generic fallback */}
                      {!/Chrome|Edg|Firefox|Safari/.test(navigator.userAgent) && (
                        <ol className="list-decimal list-inside space-y-2 text-blue-800">
                          <li>Look for a <strong>location/permissions icon</strong> in your browser's address bar</li>
                          <li>Allow location access for this site</li>
                          <li>Refresh the page or click the button below</li>
                        </ol>
                      )}
                    </>
                  )}
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-amber-900">
                    <strong>Why is this needed?</strong><br />
                    Location verification prevents fraudulent check-ins from photos of the QR code. Your location is only used to confirm you are physically present.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <button
                  onClick={() => {
                    setShowLocationHelp(false);
                    getCurrentLocation();
                  }}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                >
                  Try Again
                </button>
                <button
                  onClick={() => setShowLocationHelp(false)}
                  className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
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

