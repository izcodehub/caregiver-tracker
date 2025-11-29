'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { uploadPhoto } from '@/lib/storage';
import { Camera, MapPin, LogIn, LogOut, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageToggle from '@/components/LanguageToggle';

export default function CheckInPage() {
  const params = useParams();
  const router = useRouter();
  const qrCode = params.qrCode as string;
  const { t } = useLanguage();

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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeCaregivers, setActiveCaregivers] = useState<string[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const photoPreviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadElderlyData();
    getCurrentLocation();
    loadCaregiverNames();
  }, [qrCode]);

  const loadElderlyData = async () => {
    try {
      const { data, error } = await supabase
        .from('beneficiaries')
        .select('*')
        .eq('qr_code', qrCode)
        .single();

      if (error) throw error;
      setElderly(data);

      // Check for active caregivers
      await checkActiveCaregivers(data.id);
    } catch (err) {
      console.error('Error loading elderly data:', err);
      setError(t('checkIn.invalidQR'));
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
        // If there's someone checked in, default to check-out
        setAction('check-out');
        // Pre-fill with first active caregiver
        setCaregiverName(active[0]);
      } else {
        // No one checked in, default to check-in
        setAction('check-in');
      }
    } catch (err) {
      console.error('Error checking active caregivers:', err);
    }
  };

  const loadCaregiverNames = async () => {
    try {
      const { data, error } = await supabase
        .from('check_in_outs')
        .select('caregiver_name');

      if (error) throw error;

      // Get unique caregiver names
      const uniqueNames = [...new Set(data.map(item => item.caregiver_name))];
      setCaregiverSuggestions(uniqueNames.sort());
    } catch (err) {
      console.error('Error loading caregiver names:', err);
    }
  };

  const handleNameChange = (value: string) => {
    setCaregiverName(value);
    setShowSuggestions(value.length > 0);

    // Smart action switching based on name
    if (activeCaregivers.length > 0) {
      if (activeCaregivers.includes(value)) {
        // Typing a name that's already checked in → switch to check-out
        setAction('check-out');
      } else if (value.length > 0 && !activeCaregivers.includes(value)) {
        // Typing a different name (second caregiver) → switch to check-in
        setAction('check-in');
      }
    }
  };

  const handleSuggestionClick = (name: string) => {
    setCaregiverName(name);
    setShowSuggestions(false);

    // If selecting an active caregiver, switch to check-out
    if (activeCaregivers.includes(name)) {
      setAction('check-out');
    }
  };

  const getFilteredSuggestions = () => {
    if (!caregiverName) return [];

    // For check-out, prioritize active caregivers
    if (action === 'check-out') {
      const activeMatches = activeCaregivers.filter(name =>
        name.toLowerCase().includes(caregiverName.toLowerCase())
      );

      if (activeMatches.length > 0) {
        return activeMatches.slice(0, 5);
      }
    }

    return caregiverSuggestions.filter(name =>
      name.toLowerCase().includes(caregiverName.toLowerCase())
    ).slice(0, 5);
  };

  const getCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.error('Error getting location:', error);
        }
      );
    }
  };

  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;
      setCameraActive(true);

      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;

          videoRef.current.onloadedmetadata = () => {
            setTimeout(() => {
              videoRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
              });
            }, 300);
          };
        }
      }, 100);
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError(t('checkIn.cameraError'));
      setCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(videoRef.current, 0, 0);
      const photoData = canvas.toDataURL('image/jpeg', 0.8);
      setPhoto(photoData);
      stopCamera();

      // Scroll to photo preview after capture
      setTimeout(() => {
        photoPreviewRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }, 100);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setCameraActive(false);
    }
  };

  const retakePhoto = () => {
    setPhoto(null);
    startCamera();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!caregiverName.trim()) {
      setError(t('checkIn.enterNameError'));
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      let photoUrl = null;

      // Upload photo to storage if there is one
      if (photo) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        photoUrl = await uploadPhoto(photo, elderly.id, timestamp);

        if (!photoUrl) {
          console.warn('Photo upload failed, continuing without photo');
        }
      }

      // Insert check-in/out record
      const { error: insertError } = await supabase
        .from('check_in_outs')
        .insert({
          beneficiary_id: elderly.id,
          caregiver_name: caregiverName,
          action,
          timestamp: new Date().toISOString(),
          photo_url: photoUrl,
          latitude: location?.lat,
          longitude: location?.lng,
          is_training: action === 'check-in' ? isTraining : false, // Only apply training flag to check-ins
        });

      if (insertError) throw insertError;

      setSuccess(true);

      // Reset form after 2 seconds
      setTimeout(() => {
        setCaregiverName('');
        setPhoto(null);
        setIsTraining(false);
        setSuccess(false);
        // Reload to check new active caregivers
        checkActiveCaregivers(elderly.id);
      }, 2000);

    } catch (err) {
      console.error('Error submitting check-in:', err);
      setError(t('checkIn.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  if (!elderly) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">{t('checkIn.invalidQR')}</h1>
          <p className="text-gray-600">{t('checkIn.invalidQRMessage')}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {action === 'check-in' ? t('checkIn.checkedIn') : t('checkIn.checkedOut')}
          </h2>
          <p className="text-gray-600">{t('checkIn.recordedSuccessfully')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="flex justify-end mb-4">
          <LanguageToggle />
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">{t('checkIn.title')}</h1>
          <p className="text-gray-600">{t('checkIn.forBeneficiary')} {elderly.name}</p>
          <p className="text-sm text-gray-500 mt-1">{elderly.address}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('checkIn.yourName')}
            </label>
            <input
              type="text"
              value={caregiverName}
              onChange={(e) => handleNameChange(e.target.value)}
              onFocus={() => setShowSuggestions(caregiverName.length > 0)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              placeholder={t('checkIn.enterName')}
              required
            />

            {/* Autocomplete suggestions */}
            {showSuggestions && getFilteredSuggestions().length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {getFilteredSuggestions().map((name, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSuggestionClick(name)}
                    className={`w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-900 transition-colors ${
                      activeCaregivers.includes(name) ? 'bg-green-50 border-l-4 border-green-500' : ''
                    }`}
                  >
                    {name}
                    {activeCaregivers.includes(name) && (
                      <span className="ml-2 text-xs text-green-600">● {t('checkIn.checkIn')}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('checkIn.action')}
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setAction('check-in')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                  action === 'check-in'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                <LogIn size={20} />
                {t('checkIn.checkIn')}
              </button>
              <button
                type="button"
                onClick={() => setAction('check-out')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                  action === 'check-out'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                <LogOut size={20} />
                {t('checkIn.checkOut')}
              </button>
            </div>
          </div>

          {/* Training checkbox - only show for check-in */}
          {action === 'check-in' && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <input
                type="checkbox"
                id="training"
                checked={isTraining}
                onChange={(e) => setIsTraining(e.target.checked)}
                className="mt-1 w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
              />
              <label htmlFor="training" className="flex-1 cursor-pointer">
                <div className="font-medium text-gray-800">{t('checkIn.training')}</div>
                <div className="text-xs text-gray-600">{t('checkIn.trainingHelp')}</div>
              </label>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('checkIn.photoOptional')}
            </label>
            {!photo && !cameraActive && (
              <button
                type="button"
                onClick={startCamera}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Camera size={20} />
                {t('checkIn.takePhoto')}
              </button>
            )}

            {cameraActive && !photo && (
              <div className="space-y-2">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full rounded-lg bg-gray-900"
                />
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {t('checkIn.capture')}
                </button>
              </div>
            )}

            {photo && (
              <div ref={photoPreviewRef} className="space-y-2">
                <img src={photo} alt="Captured" className="w-full rounded-lg" />
                <button
                  type="button"
                  onClick={retakePhoto}
                  className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  {t('checkIn.retake')}
                </button>
              </div>
            )}
          </div>

          {location && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin size={16} />
              <span>{t('checkIn.locationCaptured')}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-3 rounded-lg font-semibold transition-colors ${
              submitting
                ? 'bg-gray-400 cursor-not-allowed'
                : action === 'check-in'
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="animate-spin" size={20} />
                {t('checkIn.submitting')}
              </span>
            ) : (
              `${t('checkIn.submit')} ${action === 'check-in' ? t('checkIn.checkIn') : t('checkIn.checkOut')}`
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
