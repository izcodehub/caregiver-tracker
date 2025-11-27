'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import {
  Clock,
  User,
  Calendar,
  Download,
  AlertCircle,
  CheckCircle,
  XCircle,
  MapPin,
  Camera,
} from 'lucide-react';
import QRCodeGenerator from '@/components/QRCodeGenerator';

type CheckInOut = {
  id: string;
  elderly_id: string;
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
};

type CurrentStatus = {
  is_checked_in: boolean;
  last_check_in: string | null;
  caregiver_name: string | null;
  hours_today: number;
};

export default function DashboardPage() {
  const [elderly, setElderly] = useState<Elderly | null>(null);
  const [checkIns, setCheckIns] = useState<CheckInOut[]>([]);
  const [currentStatus, setCurrentStatus] = useState<CurrentStatus | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [showPhoto, setShowPhoto] = useState<string | null>(null);

  useEffect(() => {
    loadData();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('check_in_outs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'check_in_outs',
        },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedMonth]);

  const loadData = async () => {
    try {
      // Load elderly data (for demo, we'll get the first one)
      const { data: elderlyData } = await supabase
        .from('elderly')
        .select('*')
        .limit(1)
        .single();

      if (elderlyData) {
        setElderly(elderlyData);

        // Load check-ins for selected month
        const startDate = startOfMonth(selectedMonth);
        const endDate = endOfMonth(selectedMonth);

        const { data: checkInsData } = await supabase
          .from('check_in_outs')
          .select('*')
          .eq('elderly_id', elderlyData.id)
          .gte('timestamp', startDate.toISOString())
          .lte('timestamp', endDate.toISOString())
          .order('timestamp', { ascending: false });

        setCheckIns(checkInsData || []);

        // Get current status
        const { data: statusData } = await supabase
          .rpc('get_current_status', { elderly_uuid: elderlyData.id });

        if (statusData && statusData.length > 0) {
          setCurrentStatus(statusData[0]);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!checkIns.length) return;

    const headers = ['Date', 'Time', 'Caregiver', 'Action', 'Latitude', 'Longitude'];
    const rows = checkIns.map(ci => [
      format(new Date(ci.timestamp), 'yyyy-MM-dd'),
      format(new Date(ci.timestamp), 'HH:mm:ss'),
      ci.caregiver_name,
      ci.action,
      ci.latitude || '',
      ci.longitude || '',
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caregiver-tracker-${format(selectedMonth, 'yyyy-MM')}.csv`;
    a.click();
  };

  const groupByDate = () => {
    const grouped: { [key: string]: CheckInOut[] } = {};
    checkIns.forEach(ci => {
      const date = format(new Date(ci.timestamp), 'yyyy-MM-dd');
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(ci);
    });
    return grouped;
  };

  const calculateDailyHours = (dayCheckIns: CheckInOut[]) => {
    let totalHours = 0;
    const sorted = [...dayCheckIns].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].action === 'check-in' && sorted[i + 1].action === 'check-out') {
        const start = new Date(sorted[i].timestamp).getTime();
        const end = new Date(sorted[i + 1].timestamp).getTime();
        totalHours += (end - start) / (1000 * 60 * 60);
      }
    }

    return totalHours.toFixed(2);
  };

  const hasDiscrepancy = (dayCheckIns: CheckInOut[]) => {
    const sorted = [...dayCheckIns].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Check for missing check-out
    if (sorted.length % 2 !== 0) return true;

    // Check for unusual patterns
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].action === sorted[i + 1].action) return true;
    }

    return false;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!elderly) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">No Data Found</h1>
          <p className="text-gray-600 mb-6">
            Please set up an elderly profile first by running the SQL schema in Supabase.
          </p>
        </div>
      </div>
    );
  }

  const groupedCheckIns = groupByDate();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Caregiver Tracker</h1>
              <p className="text-gray-600 mt-1">Monitoring care for {elderly.name}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download size={20} />
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Current Status Card */}
        {currentStatus && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Current Status</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${currentStatus.is_checked_in ? 'bg-green-100' : 'bg-red-100'}`}>
                  {currentStatus.is_checked_in ? (
                    <CheckCircle className="text-green-600" size={24} />
                  ) : (
                    <XCircle className="text-red-600" size={24} />
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className="font-semibold text-gray-800">
                    {currentStatus.is_checked_in ? 'Caregiver Present' : 'No Caregiver'}
                  </p>
                </div>
              </div>

              {currentStatus.caregiver_name && (
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <User className="text-blue-600" size={24} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Current Caregiver</p>
                    <p className="font-semibold text-gray-800">{currentStatus.caregiver_name}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Clock className="text-purple-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Hours Today</p>
                  <p className="font-semibold text-gray-800">{currentStatus.hours_today.toFixed(2)}h</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Check-ins List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-800">Check-In History</h2>
                <input
                  type="month"
                  value={format(selectedMonth, 'yyyy-MM')}
                  onChange={(e) => setSelectedMonth(new Date(e.target.value + '-01'))}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                />
              </div>

              {Object.keys(groupedCheckIns).length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="mx-auto text-gray-400 mb-4" size={48} />
                  <p className="text-gray-600">No check-ins for this month</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedCheckIns).map(([date, dayCheckIns]) => {
                    const hours = calculateDailyHours(dayCheckIns);
                    const hasIssue = hasDiscrepancy(dayCheckIns);

                    return (
                      <div key={date} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Calendar size={18} className="text-gray-600" />
                            <span className="font-semibold text-gray-800">
                              {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                            </span>
                            {hasIssue && (
                              <AlertCircle className="text-orange-500" size={18} />
                            )}
                          </div>
                          <span className="text-sm text-gray-600">{hours} hours</span>
                        </div>

                        <div className="space-y-2">
                          {dayCheckIns.map((ci) => (
                            <div
                              key={ci.id}
                              className={`flex items-center justify-between p-3 rounded-lg ${
                                ci.action === 'check-in' ? 'bg-green-50' : 'bg-red-50'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${
                                  ci.action === 'check-in' ? 'bg-green-100' : 'bg-red-100'
                                }`}>
                                  {ci.action === 'check-in' ? (
                                    <CheckCircle className="text-green-600" size={16} />
                                  ) : (
                                    <XCircle className="text-red-600" size={16} />
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium text-gray-800">{ci.caregiver_name}</p>
                                  <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <Clock size={14} />
                                    <span>{format(new Date(ci.timestamp), 'HH:mm:ss')}</span>
                                    {ci.latitude && ci.longitude && (
                                      <>
                                        <MapPin size={14} />
                                        <span>Location verified</span>
                                      </>
                                    )}
                                    {ci.photo_url && (
                                      <button
                                        onClick={() => setShowPhoto(ci.photo_url!)}
                                        className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                                      >
                                        <Camera size={14} />
                                        <span>View photo</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                ci.action === 'check-in'
                                  ? 'bg-green-200 text-green-800'
                                  : 'bg-red-200 text-red-800'
                              }`}>
                                {ci.action}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* QR Code Section */}
          <div>
            <QRCodeGenerator qrCode={elderly.qr_code} elderlyName={elderly.name} />
          </div>
        </div>
      </div>

      {/* Photo Modal */}
      {showPhoto && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPhoto(null)}
        >
          <div className="relative max-w-2xl w-full">
            <button
              onClick={() => setShowPhoto(null)}
              className="absolute top-4 right-4 bg-white rounded-full p-2 hover:bg-gray-100"
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
