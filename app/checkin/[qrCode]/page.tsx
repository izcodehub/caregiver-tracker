'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { uploadPhoto } from '@/lib/storage';
import { Camera, MapPin, LogIn, LogOut, Loader2 } from 'lucide-react';

export default function CheckInPage() {
  const params = useParams();
  const router = useRouter();
  const qrCode = params.qrCode as string;

  const [elderly, setElderly] = useState<any>(null);
  const [caregiverName, setCaregiverName] = useState('');
  const [action, setAction] = useState<'check-in' | 'check-out'>('check-in');
  const [photo, setPhoto] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [caregiverSuggestions, setCaregiverSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
    } catch (err) {
      console.error('Error loading elderly data:', err);
      setError('Invalid QR code');
    } finally {
      setLoading(false);
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
  };

  const handleSuggestionClick = (name: string) => {
    setCaregiverName(name);
    setShowSuggestions(false);
  };

  const getFilteredSuggestions = () => {
    if (!caregiverName) return [];
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

      // Wait a bit for state to update, then set video source
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;

          // Wait for video metadata to load (when dimensions are known)
          videoRef.current.onloadedmetadata = () => {
            // Scroll after video has proper dimensions
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
      setError('Could not access camera. Please check permissions.');
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
      setError('Please enter your name');
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
        });

      if (insertError) throw insertError;

      setSuccess(true);

      // Reset form after 2 seconds
      setTimeout(() => {
        setCaregiverName('');
        setPhoto(null);
        setSuccess(false);
        setAction('check-in');
      }, 2000);

    } catch (err) {
      console.error('Error submitting check-in:', err);
      setError('Failed to submit. Please try again.');
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
          <h1 className="text-2xl font-bold text-red-600 mb-4">Invalid QR Code</h1>
          <p className="text-gray-600">This QR code is not registered in the system.</p>
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
            {action === 'check-in' ? 'Checked In!' : 'Checked Out!'}
          </h2>
          <p className="text-gray-600">Your {action} has been recorded successfully.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Caregiver Check-In</h1>
          <p className="text-gray-600">for {elderly.name}</p>
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
              Your Name
            </label>
            <input
              type="text"
              value={caregiverName}
              onChange={(e) => handleNameChange(e.target.value)}
              onFocus={() => setShowSuggestions(caregiverName.length > 0)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              placeholder="Enter your name"
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
                    className="w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-900 transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Action
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
                Check In
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
                Check Out
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Photo (Optional)
            </label>
            {!photo && !cameraActive && (
              <button
                type="button"
                onClick={startCamera}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Camera size={20} />
                Take Photo
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
                  Capture
                </button>
              </div>
            )}

            {photo && (
              <div className="space-y-2">
                <img src={photo} alt="Captured" className="w-full rounded-lg" />
                <button
                  type="button"
                  onClick={retakePhoto}
                  className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Retake Photo
                </button>
              </div>
            )}
          </div>

          {location && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin size={16} />
              <span>Location captured</span>
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
                Submitting...
              </span>
            ) : (
              `Submit ${action === 'check-in' ? 'Check In' : 'Check Out'}`
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
