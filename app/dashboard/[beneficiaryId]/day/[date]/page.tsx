'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { format, parse } from 'date-fns';
import { ArrowLeft, Clock, User, Camera, MapPin, CheckCircle, XCircle, LogOut, Download } from 'lucide-react';
import { decimalToHHMM } from '@/lib/time-utils';
import { exportFinancialSummaryToCSV, exportDetailedCheckInsToCSV } from '@/lib/export';

type CheckInOut = {
  id: string;
  beneficiary_id: string;
  caregiver_name: string;
  action: 'check-in' | 'check-out';
  timestamp: string;
  photo_url?: string;
  latitude?: number;
  longitude?: number;
};

type Elderly = {
  id: string;
  name: string;
  qr_code: string;
  address: string;
  regular_rate: number;
  holiday_rate: number;
  currency: string;
};

export default function DayDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, logout } = useAuth();
  const beneficiaryId = params.beneficiaryId as string;
  const dateStr = params.date as string;

  const [elderly, setElderly] = useState<Elderly | null>(null);
  const [checkIns, setCheckIns] = useState<CheckInOut[]>([]);
  const [allCheckIns, setAllCheckIns] = useState<CheckInOut[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [showPhoto, setShowPhoto] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [beneficiaryId, dateStr]);

  const loadData = async () => {
    try {
      // Load elderly data
      const { data: elderlyData } = await supabase
        .from('beneficiaries')
        .select('*')
        .eq('id', beneficiaryId)
        .single();

      if (elderlyData) {
        setElderly(elderlyData);

        // Parse the date and get the month
        const date = parse(dateStr, 'yyyy-MM-dd', new Date());
        setSelectedMonth(date);

        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        // Load check-ins for this day
        const { data: checkInsData } = await supabase
          .from('check_in_outs')
          .select('*')
          .eq('beneficiary_id', beneficiaryId)
          .gte('timestamp', startOfDay.toISOString())
          .lte('timestamp', endOfDay.toISOString())
          .order('timestamp', { ascending: true });

        setCheckIns(checkInsData || []);

        // Load all check-ins for the month (for export)
        const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

        const { data: allCheckInsData } = await supabase
          .from('check_in_outs')
          .select('*')
          .eq('beneficiary_id', beneficiaryId)
          .gte('timestamp', startOfMonth.toISOString())
          .lte('timestamp', endOfMonth.toISOString())
          .order('timestamp', { ascending: false });

        setAllCheckIns(allCheckInsData || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportFinancialSummary = () => {
    if (!elderly) return;
    exportFinancialSummaryToCSV(
      allCheckIns,
      elderly.name,
      selectedMonth,
      elderly.regular_rate,
      elderly.holiday_rate,
      elderly.currency
    );
  };

  const exportDetailedCheckIns = () => {
    if (!elderly) return;
    exportDetailedCheckInsToCSV(allCheckIns, elderly.name, selectedMonth);
  };

  const calculateDailyHours = () => {
    let totalHours = 0;
    for (let i = 0; i < checkIns.length - 1; i++) {
      if (checkIns[i].action === 'check-in' && checkIns[i + 1].action === 'check-out') {
        const start = new Date(checkIns[i].timestamp).getTime();
        const end = new Date(checkIns[i + 1].timestamp).getTime();
        totalHours += (end - start) / (1000 * 60 * 60);
      }
    }
    return totalHours;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!elderly) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Not Found</h1>
          <p className="text-gray-600">Client data not found.</p>
        </div>
      </div>
    );
  }

  const date = parse(dateStr, 'yyyy-MM-dd', new Date());
  const totalHours = calculateDailyHours();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Main Header (same as dashboard) */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              {user?.role === 'admin' && (
                <button
                  onClick={() => router.push('/admin')}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <ArrowLeft size={20} />
                  Back to Admin
                </button>
              )}
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Caregiver Tracker</h1>
                <p className="text-gray-600 mt-1">Monitoring care for {elderly.name}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={exportFinancialSummary}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title="Export financial summary matching agency format"
              >
                <Download size={20} />
                Financial Summary
              </button>
              <button
                onClick={exportDetailedCheckIns}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                title="Export detailed check-in/out log"
              >
                <Download size={20} />
                Detailed Log
              </button>
              <button
                onClick={logout}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <LogOut size={20} />
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Day Detail Card */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => router.push(`/dashboard/${beneficiaryId}`)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
            >
              <ArrowLeft size={20} />
              Back to Calendar
            </button>
          </div>
          <div>
            <h2 className="text-3xl font-bold text-gray-800">
              {format(date, 'EEEE, MMMM d, yyyy')}
            </h2>
            <div className="mt-4 flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Clock className="text-blue-600" size={20} />
                <span className="text-gray-700">
                  Total Hours: <span className="font-semibold">{totalHours.toFixed(2)}h ({decimalToHHMM(totalHours)})</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="text-blue-600" size={20} />
                <span className="text-gray-700">
                  Check-ins: <span className="font-semibold">{checkIns.length}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Check-ins */}
        {checkIns.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <Clock className="mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-gray-600">No check-ins recorded for this day</p>
          </div>
        ) : (
          <div className="space-y-4">
            {checkIns.map((ci) => (
              <div
                key={ci.id}
                className={`bg-white rounded-lg shadow-lg p-6 border-l-4 ${
                  ci.action === 'check-in' ? 'border-green-500' : 'border-red-500'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`p-3 rounded-lg ${
                      ci.action === 'check-in' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {ci.action === 'check-in' ? (
                        <CheckCircle className="text-green-600" size={28} />
                      ) : (
                        <XCircle className="text-red-600" size={28} />
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <User size={20} className="text-gray-600" />
                        <span className="text-xl font-semibold text-gray-800">
                          {ci.caregiver_name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-gray-700 mb-2">
                        <Clock size={18} />
                        <span className="font-medium">{format(new Date(ci.timestamp), 'HH:mm:ss')}</span>
                      </div>

                      {ci.latitude && ci.longitude && (
                        <div className="flex items-center gap-2 text-gray-600 mb-3">
                          <MapPin size={18} />
                          <span className="text-sm">
                            {ci.latitude.toFixed(6)}, {ci.longitude.toFixed(6)}
                          </span>
                        </div>
                      )}

                      {ci.photo_url && (
                        <button
                          onClick={() => setShowPhoto(ci.photo_url!)}
                          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium transition-colors"
                        >
                          <Camera size={18} />
                          View Photo
                        </button>
                      )}
                    </div>
                  </div>

                  <span className={`px-4 py-2 rounded-full text-sm font-semibold ${
                    ci.action === 'check-in'
                      ? 'bg-green-200 text-green-800'
                      : 'bg-red-200 text-red-800'
                  }`}>
                    {ci.action}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Photo Modal */}
      {showPhoto && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPhoto(null)}
        >
          <div className="relative max-w-4xl w-full">
            <button
              onClick={() => setShowPhoto(null)}
              className="absolute top-4 right-4 bg-white rounded-full p-2 hover:bg-gray-100 z-10"
            >
              <XCircle size={24} />
            </button>
            <img src={showPhoto} alt="Check-in photo" className="w-full rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
