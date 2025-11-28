'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/lib/supabase';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { exportFinancialSummaryToCSV, exportDetailedCheckInsToCSV } from '@/lib/export';
import { decimalToHHMM } from '@/lib/time-utils';
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
  ArrowLeft,
  LogOut,
  Euro,
  Info,
  Mail,
  Phone,
  Home,
  UserPlus,
  X,
} from 'lucide-react';
import QRCodeGenerator from '@/components/QRCodeGenerator';
import CalendarView from '@/components/CalendarView';
import CaregiverBreakdown from '@/components/CaregiverBreakdown';
import LanguageToggle from '@/components/LanguageToggle';

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
  country?: string;
  currency?: string;
  regular_rate?: number;
  holiday_rate?: number;
  ticket_moderateur?: number;
};

type FamilyMember = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
};

type CurrentStatus = {
  is_checked_in: boolean;
  last_check_in: string | null;
  caregiver_name: string | null;
  hours_today: number;
};

// Component for showing running time for active check-ins
function RunningTimer({ checkInTime }: { checkInTime: Date }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const updateElapsed = () => {
      const now = new Date();
      const diff = now.getTime() - checkInTime.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setElapsed(`${hours}h${minutes.toString().padStart(2, '0')}m${seconds.toString().padStart(2, '0')}s`);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [checkInTime]);

  return (
    <span className="text-xs font-semibold text-green-600 animate-pulse">
      ⏱️ {elapsed}
    </span>
  );
}

export default function DashboardPage() {
  const params = useParams();
  const beneficiaryId = params.beneficiaryId as string;
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t, language } = useLanguage();

  const [elderly, setElderly] = useState<Elderly | null>(null);
  const [checkIns, setCheckIns] = useState<CheckInOut[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [currentStatus, setCurrentStatus] = useState<CurrentStatus | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [showPhoto, setShowPhoto] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'calendar' | 'history' | 'financial' | 'info'>('calendar');
  const [selectedDayView, setSelectedDayView] = useState<{ date: Date; checkIns: CheckInOut[] } | null>(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [addingMember, setAddingMember] = useState(false);

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
  }, [beneficiaryId, selectedMonth]);

  const loadFamilyMembers = async () => {
    try {
      const { data: familyData } = await supabase
        .from('family_members')
        .select('*')
        .eq('beneficiary_id', beneficiaryId)
        .order('role');

      setFamilyMembers(familyData || []);
    } catch (error) {
      console.error('Error loading family members:', error);
    }
  };

  const loadData = async () => {
    try {
      // Load specific elderly data by ID
      const { data: elderlyData } = await supabase
        .from('beneficiaries')
        .select('*')
        .eq('id', beneficiaryId)
        .single();

      if (elderlyData) {
        setElderly(elderlyData);

        // Load family members
        await loadFamilyMembers();

        // Load check-ins for selected month
        const startDate = startOfMonth(selectedMonth);
        const endDate = endOfMonth(selectedMonth);

        const { data: checkInsData } = await supabase
          .from('check_in_outs')
          .select('*')
          .eq('beneficiary_id', elderlyData.id)
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

  const exportFinancialSummary = () => {
    if (!elderly) return;
    exportFinancialSummaryToCSV(
      checkIns,
      elderly.name,
      selectedMonth,
      elderly.regular_rate || 15,
      elderly.holiday_rate || 22.5,
      elderly.currency || 'EUR'
    );
  };

  const exportDetailedCheckIns = () => {
    if (!elderly) return;
    exportDetailedCheckInsToCSV(checkIns, elderly.name, selectedMonth);
  };

  const calculateDayHours = (dayCheckIns: CheckInOut[]) => {
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

    return totalHours;
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


  const handleAddFamilyMember = async () => {
    if (!newMemberName.trim() || !newMemberEmail.trim()) {
      alert('Please enter both name and email');
      return;
    }

    setAddingMember(true);
    try {
      const response = await fetch('/api/family-members/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beneficiary_id: beneficiaryId,
          name: newMemberName,
          email: newMemberEmail,
          phone: newMemberPhone,
          role: 'secondary',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add family member');
      }

      // Reload family members
      await loadFamilyMembers();

      // Reset form and close modal
      setNewMemberName('');
      setNewMemberEmail('');
      setNewMemberPhone('');
      setShowAddMemberModal(false);
    } catch (error: any) {
      alert(error.message || 'Failed to add family member');
    } finally {
      setAddingMember(false);
    }
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

  const isActiveCheckIn = (checkIn: CheckInOut, allCheckInsForDay: CheckInOut[]): boolean => {
    // Only check-ins can be active
    if (checkIn.action !== 'check-in') return false;

    const sorted = [...allCheckInsForDay].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Find this check-in in the sorted array
    const index = sorted.findIndex(ci => ci.id === checkIn.id);
    if (index === -1) return false;

    // Check if the next action is a check-out
    // If there's no next action or next action is another check-in, this is active
    if (index === sorted.length - 1 || sorted[index + 1].action === 'check-in') {
      return true;
    }

    return false;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!elderly) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">{t('dashboard.noDataFound')}</h1>
          <p className="text-gray-600 mb-6">
            {t('dashboard.setupProfile')}
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
        <div className="bg-white rounded-lg shadow-lg p-4 md:p-6 mb-6">
          <div className="flex flex-col gap-4">
            {/* Top row: Back button and title */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-col gap-2">
                {user?.role === 'admin' && (
                  <button
                    onClick={() => router.push('/admin')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors w-fit"
                  >
                    <ArrowLeft size={16} />
                    <span className="hidden sm:inline">{t('dashboard.backToAdmin')}</span>
                    <span className="sm:hidden">Admin</span>
                  </button>
                )}
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-800">{t('dashboard.title')}</h1>
                  <p className="text-sm md:text-base text-gray-600 mt-1">{t('dashboard.monitoring')} {elderly.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <LanguageToggle />
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                >
                  <LogOut size={16} />
                  <span className="hidden sm:inline">{t('common.logout')}</span>
                </button>
              </div>
            </div>
            {/* Bottom row: Export buttons - only on desktop */}
            <div className="hidden md:flex gap-2">
              <button
                onClick={exportFinancialSummary}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                title={t('export.financialSummary')}
              >
                <Download size={16} />
                {t('dashboard.financialSummary')}
              </button>
              <button
                onClick={exportDetailedCheckIns}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                title={t('export.detailedLog')}
              >
                <Download size={16} />
                {t('dashboard.detailedLog')}
              </button>
            </div>
          </div>
        </div>

        {/* Current Status Card */}
        {currentStatus && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">{t('dashboard.currentStatus')}</h2>
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
                  <p className="text-sm text-gray-600">{t('dashboard.status')}</p>
                  <p className="font-semibold text-gray-800">
                    {currentStatus.is_checked_in ? t('dashboard.caregiverPresent') : t('dashboard.noCaregiver')}
                  </p>
                </div>
              </div>

              {currentStatus.caregiver_name && (
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <User className="text-blue-600" size={24} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">{t('dashboard.currentCaregiver')}</p>
                    <p className="font-semibold text-gray-800">{currentStatus.caregiver_name}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Clock className="text-purple-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('dashboard.hoursToday')}</p>
                  <p className="font-semibold text-gray-800">{currentStatus.hours_today.toFixed(2)}h</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Month Selector */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-gray-800">{t('dashboard.monthlyView')}</h2>
          <input
            type="month"
            value={format(selectedMonth, 'yyyy-MM')}
            onChange={(e) => setSelectedMonth(new Date(e.target.value + '-01'))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
          />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-lg mb-6 overflow-x-auto">
          <div className="flex border-b border-gray-200 min-w-max">
            <button
              onClick={() => setActiveTab('calendar')}
              className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 text-center text-xs sm:text-base font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'calendar'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <Calendar className="inline-block mr-1 sm:mr-2" size={16} />
              <span className="hidden sm:inline">{t('dashboard.calendarView')}</span>
              <span className="sm:hidden">Calendar</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 text-center text-xs sm:text-base font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'history'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <Clock className="inline-block mr-1 sm:mr-2" size={16} />
              <span className="hidden sm:inline">{t('dashboard.checkInHistory')}</span>
              <span className="sm:hidden">History</span>
            </button>
            <button
              onClick={() => setActiveTab('financial')}
              className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 text-center text-xs sm:text-base font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'financial'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <Euro className="inline-block mr-1 sm:mr-2" size={16} />
              <span className="hidden sm:inline">{t('dashboard.financialReview')}</span>
              <span className="sm:hidden">Financial</span>
            </button>
            <button
              onClick={() => setActiveTab('info')}
              className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 text-center text-xs sm:text-base font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'info'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <Info className="inline-block mr-1 sm:mr-2" size={16} />
              Info
            </button>
          </div>
        </div>

        {/* Calendar Tab */}
        {activeTab === 'calendar' && !selectedDayView && (
          <div className="mb-6">
            <CalendarView
              selectedMonth={selectedMonth}
              checkIns={checkIns}
              onDayClick={(date, dayCheckIns) => {
                setSelectedDayView({ date, checkIns: dayCheckIns });
              }}
            />
          </div>
        )}

        {/* Day Detail View (within calendar tab) */}
        {activeTab === 'calendar' && selectedDayView && (
          <div className="mb-6">
            {/* Back to Calendar Button */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <button
                onClick={() => setSelectedDayView(null)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              >
                <ArrowLeft size={20} />
                {t('dashboard.backToCalendar')}
              </button>
            </div>

            {/* Day Header */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-3xl font-bold text-gray-800">
                {format(selectedDayView.date, 'EEEE, MMMM d, yyyy')}
              </h2>
              <div className="mt-4 flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Clock className="text-blue-600" size={20} />
                  <span className="text-gray-700">
                    {t('dashboard.totalHours')}: <span className="font-semibold">{calculateDayHours(selectedDayView.checkIns).toFixed(2)}h ({decimalToHHMM(calculateDayHours(selectedDayView.checkIns))})</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="text-blue-600" size={20} />
                  <span className="text-gray-700">
                    {t('dashboard.checkIns')}: <span className="font-semibold">{selectedDayView.checkIns.length}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Day Check-ins */}
            {selectedDayView.checkIns.length === 0 ? (
              <div className="bg-white rounded-lg shadow-lg p-12 text-center">
                <Clock className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-600">{t('dashboard.noCheckInsRecorded')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedDayView.checkIns.sort((a, b) =>
                  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                ).map((ci) => (
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
                              {t('dashboard.viewPhoto')}
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
        )}

        {/* Financial Tab */}
        {activeTab === 'financial' && (
          <div className="mb-6">
            <CaregiverBreakdown
              checkIns={checkIns}
              selectedMonth={selectedMonth}
              regularRate={elderly.regular_rate || 15}
              holidayRate={elderly.holiday_rate || 22.5}
              currency={elderly.currency || 'EUR'}
              copayPercentage={elderly.ticket_moderateur || 0}
            />
          </div>
        )}

        {/* Info Tab */}
        {activeTab === 'info' && (
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            {/* QR Code Section */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">QR Code</h2>
              <div className="flex flex-col items-center">
                <QRCodeGenerator qrCode={elderly.qr_code} elderlyName={elderly.name} />
                <p className="mt-4 text-sm text-gray-600 text-center">
                  Scan this code with the mobile app to check in/out
                </p>
              </div>
            </div>

            {/* Beneficiary Information */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Beneficiary Information</h2>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <User className="text-blue-600 mt-1" size={20} />
                  <div>
                    <div className="text-sm text-gray-600">Name</div>
                    <div className="font-semibold text-gray-900">{elderly.name}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Home className="text-blue-600 mt-1" size={20} />
                  <div>
                    <div className="text-sm text-gray-600">Address</div>
                    <div className="font-semibold text-gray-900">{elderly.address}</div>
                  </div>
                </div>
                {elderly.country && (
                  <div className="flex items-start gap-3">
                    <MapPin className="text-blue-600 mt-1" size={20} />
                    <div>
                      <div className="text-sm text-gray-600">Country</div>
                      <div className="font-semibold text-gray-900">{elderly.country}</div>
                    </div>
                  </div>
                )}
                {elderly.regular_rate && (
                  <div className="flex items-start gap-3">
                    <Euro className="text-blue-600 mt-1" size={20} />
                    <div>
                      <div className="text-sm text-gray-600">Rates</div>
                      <div className="font-semibold text-gray-900">
                        Regular: {elderly.currency}{elderly.regular_rate}/h
                        {' | '}
                        Holiday: {elderly.currency}{elderly.holiday_rate}/h
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Primary Contact */}
              {familyMembers.length > 0 && familyMembers.find(m => m.role === 'primary') && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Primary Contact</h3>
                  {(() => {
                    const primaryContact = familyMembers.find(m => m.role === 'primary');
                    if (!primaryContact) return null;
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <User className="text-gray-400" size={16} />
                          <span className="font-semibold text-gray-900">{primaryContact.name}</span>
                        </div>
                        {primaryContact.email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="text-gray-400" size={16} />
                            <a href={`mailto:${primaryContact.email}`} className="text-blue-600 hover:underline">
                              {primaryContact.email}
                            </a>
                          </div>
                        )}
                        {primaryContact.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="text-gray-400" size={16} />
                            <a href={`tel:${primaryContact.phone}`} className="text-blue-600 hover:underline">
                              {primaryContact.phone}
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Family Members Section */}
            <div className="lg:col-span-2 bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-800">Additional Family Members</h2>
                <button
                  onClick={() => setShowAddMemberModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <UserPlus size={20} />
                  Add Family Member
                </button>
              </div>
              {familyMembers.filter(m => m.role !== 'primary').length === 0 ? (
                <p className="text-gray-600 text-center py-8">No additional family members</p>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {familyMembers.filter(m => m.role !== 'primary').map((member) => (
                    <div
                      key={member.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <User className="text-blue-600" size={20} />
                          <div className="font-semibold text-gray-900">{member.name}</div>
                        </div>
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full capitalize">
                          {member.role}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {member.email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="text-gray-400" size={16} />
                            <a href={`mailto:${member.email}`} className="text-blue-600 hover:underline">
                              {member.email}
                            </a>
                          </div>
                        )}
                        {member.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="text-gray-400" size={16} />
                            <a href={`tel:${member.phone}`} className="text-blue-600 hover:underline">
                              {member.phone}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Check-In History Tab */}
        {activeTab === 'history' && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Check-ins List */}
            <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-6">{t('dashboard.checkInHistory')}</h2>

              {Object.keys(groupedCheckIns).length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="mx-auto text-gray-400 mb-4" size={48} />
                  <p className="text-gray-600">{t('dashboard.noCheckInsMonth')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedCheckIns).map(([date, dayCheckIns]) => {
                    const hours = calculateDayHours(dayCheckIns).toFixed(2);
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
                          {dayCheckIns.map((ci) => {
                            const isActive = isActiveCheckIn(ci, dayCheckIns);
                            return (
                            <div
                              key={ci.id}
                              className={`flex items-center justify-between p-3 rounded-lg ${
                                ci.action === 'check-in' ? 'bg-green-50' : 'bg-red-50'
                              }`}
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <div className={`p-2 rounded-lg ${
                                  ci.action === 'check-in' ? 'bg-green-100' : 'bg-red-100'
                                }`}>
                                  {ci.action === 'check-in' ? (
                                    <CheckCircle className="text-green-600" size={16} />
                                  ) : (
                                    <XCircle className="text-red-600" size={16} />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <p className="font-medium text-gray-800">{ci.caregiver_name}</p>
                                  <div className="flex items-center gap-2 text-sm text-gray-600 flex-wrap">
                                    <Clock size={14} />
                                    <span>{format(new Date(ci.timestamp), 'HH:mm:ss')}</span>
                                    {ci.latitude && ci.longitude && (
                                      <>
                                        <MapPin size={14} />
                                        <span>{t('dashboard.locationVerified')}</span>
                                      </>
                                    )}
                                    {ci.photo_url && (
                                      <button
                                        onClick={() => setShowPhoto(ci.photo_url!)}
                                        className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                                      >
                                        <Camera size={14} />
                                        <span>{t('dashboard.viewPhoto')}</span>
                                      </button>
                                    )}
                                  </div>
                                  {/* Show running timer for active check-ins */}
                                  {isActive && (
                                    <div className="mt-1">
                                      <RunningTimer checkInTime={new Date(ci.timestamp)} />
                                    </div>
                                  )}
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
                            );
                          })}
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
        )}
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

      {/* Add Family Member Modal */}
      {showAddMemberModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900">Add Family Member</h3>
              <button
                onClick={() => setShowAddMemberModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="text-gray-400" size={20} />
                  </div>
                  <input
                    type="text"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="John Doe"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="text-gray-400" size={20} />
                  </div>
                  <input
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="john@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone (optional)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="text-gray-400" size={20} />
                  </div>
                  <input
                    type="tel"
                    value={newMemberPhone}
                    onChange={(e) => setNewMemberPhone(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="+33 6 12 34 56 78"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAddMemberModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={addingMember}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddFamilyMember}
                  disabled={addingMember}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                >
                  {addingMember ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
