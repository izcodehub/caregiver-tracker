'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { uploadPhoto } from '@/lib/storage';
import { Camera, MapPin, LogIn, LogOut, Loader2, Plus, ChevronDown } from 'lucide-react';
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
  const [activeCaregivers, setActiveCaregivers] = useState<string[]>([]);
  const [showAddCaregiver, setShowAddCaregiver] = useState(false);
  const [newCaregiverName, setNewCaregiverName] = useState('');
  const [showPhotoSection, setShowPhotoSection] = useState(false);
  const [savingNewCaregiver, setSavingNewCaregiver] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const photoPreviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadElderlyData();
    getCurrentLocation();
  }, [qrCode]);

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
        // Get most recent caregiver from check-ins
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
      const { data, error } = await supabase
        .from('caregivers')
        .select('name')
        .eq('beneficiary_id', elderly.id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      // Get unique caregiver names
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

    // If selecting an active caregiver, switch to check-out
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
      // Normalize name: First name capitalized + LAST NAME CAPS
      const nameParts = newCaregiverName.trim().split(' ');
      const normalizedName = nameParts.length >= 2
        ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1).toLowerCase() + ' ' + nameParts[1].toUpperCase()
        : newCaregiverName.trim().charAt(0).toUpperCase() + newCaregiverName.trim().slice(1).toLowerCase();

      // Check if caregiver already exists for this beneficiary
      const { data: existing } = await supabase
        .from('caregivers')
        .select('id, name')
        .eq('beneficiary_id', elderly.id)
        .ilike('name', normalizedName)
        .single();

      if (existing) {
        // Caregiver already exists, just use their name
        setCaregiverName(existing.name);
        // Check if they're currently active
        if (activeCaregivers.includes(existing.name)) {
          setAction('check-out');
        } else {
          setAction('check-in');
        }
      } else {
        // Add new caregiver for this beneficiary
        const { error } = await supabase
          .from('caregivers')
          .insert({
            beneficiary_id: elderly.id,
            name: normalizedName
          });

        if (error) {
          console.error('Supabase insert error:', error);
          throw error;
        }

        console.log('Caregiver added:', normalizedName);
        setCaregiverName(normalizedName);
        // New caregiver should always default to check-in
        setAction('check-in');
      }

      setShowAddCaregiver(false);
      setNewCaregiverName('');
      // Reload caregiver list
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
        setShowPhotoSection(false);
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

          {/* Caregiver Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('checkIn.yourName')}
            </label>

            {!showAddCaregiver && (
              <div className="relative">
                <style dangerouslySetInnerHTML={{
                  __html: `
                    .caregiver-select optgroup {
                      background-color: #ffffff !important;
                      font-weight: 700 !important;
                      color: #111827 !important;
                      font-size: 0.875rem !important;
                    }
                  `
                }} />
                <select
                  value={caregiverName}
                  onChange={(e) => handleDropdownChange(e.target.value)}
                  className="caregiver-select w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 appearance-none bg-white"
                  required
                >
                  <option value="">{t('checkIn.selectName')}</option>
                  {activeCaregivers.length > 0 && (
                    <optgroup label={t('checkIn.activeNow')} style={{ backgroundColor: '#ffffff', fontWeight: 'bold', color: '#111827' }}>
                      {activeCaregivers.map((name, idx) => (
                        <option
                          key={`active-${idx}`}
                          value={name}
                          style={{ color: '#059669', fontWeight: '500' }}
                        >
                          ● {name} - {t('checkIn.arrived')}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {caregiverSuggestions.filter(name => !activeCaregivers.includes(name)).length > 0 && (
                    <optgroup label={t('checkIn.allCaregivers')} style={{ backgroundColor: '#ffffff', fontWeight: 'bold', color: '#111827' }}>
                      {caregiverSuggestions
                        .filter(name => !activeCaregivers.includes(name))
                        .map((name, idx) => (
                          <option key={idx} value={name}>
                            {name}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  <option value="__add_new__">+ {t('checkIn.addYourName')}</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
              </div>
            )}

            {/* Inline Add New Caregiver */}
            {showAddCaregiver && (
              <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <input
                  type="text"
                  value={newCaregiverName}
                  onChange={(e) => setNewCaregiverName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNewCaregiver();
                    }
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                  placeholder={t('checkIn.typeYourName')}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddCaregiver(false);
                      setNewCaregiverName('');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleAddNewCaregiver}
                    disabled={savingNewCaregiver}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-gray-400"
                  >
                    {savingNewCaregiver ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="animate-spin" size={16} />
                        {t('checkIn.submitting')}
                      </span>
                    ) : (
                      t('checkIn.saveMyName')
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
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

          {/* Collapsed Photo Section */}
          {!showPhotoSection && (
            <button
              type="button"
              onClick={() => setShowPhotoSection(true)}
              className="w-full text-left text-sm text-blue-600 hover:underline"
            >
              + {t('checkIn.photoOptional')}
            </button>
          )}

          {showPhotoSection && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  {t('checkIn.photoOptional')}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowPhotoSection(false);
                    setPhoto(null);
                    stopCamera();
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  {t('checkIn.hide') || 'Hide'}
                </button>
              </div>
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
          )}

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
