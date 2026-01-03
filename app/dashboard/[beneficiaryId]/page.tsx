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
  CircleAlert,
} from 'lucide-react';
import QRCodeGenerator from '@/components/QRCodeGenerator';
import CalendarView from '@/components/CalendarView';
import CaregiverBreakdown from '@/components/CaregiverBreakdown';
import LanguageToggle from '@/components/LanguageToggle';
import NotificationPermissionButton from '@/components/NotificationPermissionButton';
import DailyNoteModal from '@/components/DailyNoteModal';
import { createColorMap, type CaregiverColor } from '@/lib/caregiver-colors';
import { getTimezoneForCountry, formatTimeWithDateFns, formatInBeneficiaryTimezone, convertToTimezone } from '@/lib/timezone-utils';

type CheckInOut = {
  id: string;
  beneficiary_id: string;
  caregiver_name: string;
  action: 'check-in' | 'check-out';
  timestamp: string;
  photo_url?: string;
  latitude?: number;
  longitude?: number;
  is_training?: boolean;
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
  has_push_subscription?: boolean;
};

type CurrentStatus = {
  is_checked_in: boolean;
  last_check_in: string | null;
  caregiver_name: string | null;
  hours_today: number;
};

type DailyNote = {
  id: string;
  beneficiary_id: string;
  date: string;
  note_type?: 'modification' | 'cancellation' | 'special_instruction' | 'general';
  original_time?: string;
  modified_time?: string;
  reason: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
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
  const [dailyNotes, setDailyNotes] = useState<DailyNote[]>([]);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [selectedNoteDate, setSelectedNoteDate] = useState<Date | null>(null);
  const [showPhoto, setShowPhoto] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'calendar' | 'history' | 'financial' | 'info'>('calendar');
  const [selectedDayView, setSelectedDayView] = useState<{ date: Date; checkIns: CheckInOut[] } | null>(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [caregiverColors, setCaregiverColors] = useState<Map<string, string>>(new Map());

  // Get beneficiary's timezone
  const timezone = elderly ? getTimezoneForCountry(elderly.country) : 'Europe/Paris';

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

      // Check subscription status for each family member
      if (familyData) {
        const familyWithStatus = await Promise.all(
          familyData.map(async (member) => {
            const { data: subscriptions } = await supabase
              .from('push_subscriptions')
              .select('id')
              .eq('family_member_id', member.id)
              .eq('is_active', true)
              .limit(1);

            return {
              ...member,
              has_push_subscription: (subscriptions && subscriptions.length > 0)
            };
          })
        );
        setFamilyMembers(familyWithStatus);
      } else {
        setFamilyMembers([]);
      }
    } catch (error) {
      console.error('Error loading family members:', error);
    }
  };

  const loadDailyNotes = async () => {
    try {
      const startDate = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('day_notes')
        .select('*')
        .eq('beneficiary_id', beneficiaryId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (error) {
        console.error('Error loading day notes:', error);
      } else {
        setDailyNotes(data || []);
      }
    } catch (error) {
      console.error('Error loading day notes:', error);
    }
  };

  const handleAddNote = (date: Date) => {
    setSelectedNoteDate(date);
    setNoteModalOpen(true);
  };

  const handleSaveNote = async (data: { note: string; noteType: string }) => {
    if (!selectedNoteDate) return;

    const dateStr = format(selectedNoteDate, 'yyyy-MM-dd');

    try {
      const response = await fetch('/api/daily-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beneficiary_id: beneficiaryId,
          date: dateStr,
          reason: data.note,
          note_type: data.noteType,
          created_by: user?.id,
        }),
      });

      if (response.ok) {
        await loadDailyNotes();
      } else {
        const errorData = await response.json();
        console.error('Failed to save note:', errorData);
        alert(`Failed to save note: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving note:', error);
      alert('Error saving note. Please try again.');
    }
  };

  const handleDeleteNote = async () => {
    if (!selectedNoteDate) return;

    const dateStr = format(selectedNoteDate, 'yyyy-MM-dd');

    const response = await fetch(`/api/daily-notes?beneficiary_id=${beneficiaryId}&date=${dateStr}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      await loadDailyNotes();
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

        // Load daily notes
        await loadDailyNotes();

        // Load caregiver colors
        const { data: caregiversData } = await supabase
          .from('caregivers')
          .select('id, name, color');

        if (caregiversData) {
          const colorMap = createColorMap(caregiversData as CaregiverColor[]);
          setCaregiverColors(colorMap);
        }

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

  const calculateDayHours = (dayCheckIns: CheckInOut[], includeTraining: boolean = true) => {
    let totalHours = 0;
    const sorted = [...dayCheckIns].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const processed = new Set<string>();

    sorted.forEach((ci) => {
      if (processed.has(ci.id)) return;

      if (ci.action === 'check-in') {
        // Skip or include training based on parameter
        if (!includeTraining && ci.is_training) return;
        if (includeTraining && !includeTraining && ci.is_training) return;

        // Find matching check-out (next check-out from same caregiver)
        const checkOut = sorted.find(
          (co) =>
            !processed.has(co.id) &&
            co.action === 'check-out' &&
            co.caregiver_name === ci.caregiver_name &&
            new Date(co.timestamp).getTime() > new Date(ci.timestamp).getTime()
        );

        if (checkOut) {
          const start = new Date(ci.timestamp).getTime();
          const end = new Date(checkOut.timestamp).getTime();
          totalHours += (end - start) / (1000 * 60 * 60);
          processed.add(ci.id);
          processed.add(checkOut.id);
        }
      }
    });

    return totalHours;
  };

  const calculateTrainingHours = (dayCheckIns: CheckInOut[]) => {
    let totalHours = 0;
    const sorted = [...dayCheckIns].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const processed = new Set<string>();

    sorted.forEach((ci) => {
      if (processed.has(ci.id)) return;

      if (ci.action === 'check-in' && ci.is_training) {
        const checkOut = sorted.find(
          (co) =>
            !processed.has(co.id) &&
            co.action === 'check-out' &&
            co.caregiver_name === ci.caregiver_name &&
            new Date(co.timestamp).getTime() > new Date(ci.timestamp).getTime()
        );

        if (checkOut) {
          const start = new Date(ci.timestamp).getTime();
          const end = new Date(checkOut.timestamp).getTime();
          totalHours += (end - start) / (1000 * 60 * 60);
          processed.add(ci.id);
          processed.add(checkOut.id);
        }
      }
    });

    return totalHours;
  };

  const groupByDate = () => {
    const grouped: { [key: string]: CheckInOut[] } = {};

    // Add days with check-ins
    checkIns.forEach(ci => {
      const date = formatInBeneficiaryTimezone(ci.timestamp, timezone, 'yyyy-MM-dd');
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(ci);
    });

    // Add days with notes but no check-ins
    dailyNotes.forEach(note => {
      if (!grouped[note.date]) {
        grouped[note.date] = [];
      }
    });

    return grouped;
  };

  // Helper function to parse a yyyy-MM-dd date string in the beneficiary's timezone
  const parseDateInTimezone = (dateStr: string): Date => {
    // Create a date at noon in the beneficiary's timezone to avoid midnight edge cases
    const [year, month, day] = dateStr.split('-').map(Number);
    const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return convertToTimezone(utcDate, timezone);
  };

  // Helper function to create a Date object from yyyy-MM-dd that won't shift when formatted
  const createDateFromString = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
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
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <h2 className="text-2xl font-semibold text-gray-800">{t('dashboard.monthlyView')}</h2>
          <div className="flex items-center gap-2">
            {/* Month Dropdown */}
            <select
              value={selectedMonth.getMonth()}
              onChange={(e) => {
                const newDate = new Date(selectedMonth);
                newDate.setMonth(parseInt(e.target.value));
                setSelectedMonth(newDate);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
            >
              {language === 'fr' ? (
                <>
                  <option value="0">Janvier</option>
                  <option value="1">Février</option>
                  <option value="2">Mars</option>
                  <option value="3">Avril</option>
                  <option value="4">Mai</option>
                  <option value="5">Juin</option>
                  <option value="6">Juillet</option>
                  <option value="7">Août</option>
                  <option value="8">Septembre</option>
                  <option value="9">Octobre</option>
                  <option value="10">Novembre</option>
                  <option value="11">Décembre</option>
                </>
              ) : (
                <>
                  <option value="0">January</option>
                  <option value="1">February</option>
                  <option value="2">March</option>
                  <option value="3">April</option>
                  <option value="4">May</option>
                  <option value="5">June</option>
                  <option value="6">July</option>
                  <option value="7">August</option>
                  <option value="8">September</option>
                  <option value="9">October</option>
                  <option value="10">November</option>
                  <option value="11">December</option>
                </>
              )}
            </select>

            {/* Year Dropdown */}
            <select
              value={selectedMonth.getFullYear()}
              onChange={(e) => {
                const newDate = new Date(selectedMonth);
                newDate.setFullYear(parseInt(e.target.value));
                setSelectedMonth(newDate);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
            >
              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
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
              caregiverColors={caregiverColors}
              timezone={timezone}
              dailyNotes={dailyNotes}
              onAddNote={handleAddNote}
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
              <div className="mt-4 flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Clock className="text-blue-600" size={20} />
                  <span className="text-gray-700">
                    {t('dashboard.totalHours')}: <span className="font-semibold">{calculateDayHours(selectedDayView.checkIns, false).toFixed(2)}h ({decimalToHHMM(calculateDayHours(selectedDayView.checkIns, false))})</span>
                  </span>
                </div>
                {calculateTrainingHours(selectedDayView.checkIns) > 0 && (
                  <div className="flex items-center gap-2">
                    <Clock className="text-amber-600" size={20} />
                    <span className="text-gray-700">
                      {language === 'fr' ? 'Formation' : 'Training'}: <span className="font-semibold text-amber-600">{calculateTrainingHours(selectedDayView.checkIns).toFixed(2)}h ({decimalToHHMM(calculateTrainingHours(selectedDayView.checkIns))})</span>
                    </span>
                  </div>
                )}
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
                {(() => {
                  // Sort chronologically for pairing
                  const sorted = [...selectedDayView.checkIns].sort((a, b) =>
                    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                  );

                  // Group check-in/check-out pairs
                  const pairs: { checkIn: CheckInOut; checkOut?: CheckInOut }[] = [];
                  const processed = new Set<string>();

                  sorted.forEach((ci) => {
                    if (processed.has(ci.id)) return;

                    if (ci.action === 'check-in') {
                      const checkOut = sorted.find(
                        (co) =>
                          !processed.has(co.id) &&
                          co.action === 'check-out' &&
                          co.caregiver_name === ci.caregiver_name &&
                          new Date(co.timestamp).getTime() > new Date(ci.timestamp).getTime()
                      );

                      pairs.push({ checkIn: ci, checkOut });
                      processed.add(ci.id);
                      if (checkOut) processed.add(checkOut.id);
                    } else if (!processed.has(ci.id)) {
                      pairs.push({ checkIn: ci });
                      processed.add(ci.id);
                    }
                  });

                  // Reverse to show most recent first
                  return pairs.reverse().map((pair, idx) => {
                    const isActive = pair.checkIn.action === 'check-in' && !pair.checkOut;

                    return (
                      <div key={idx} className="bg-white rounded-lg shadow-lg p-4 md:p-6">
                        {/* Mobile: Stacked layout */}
                        <div className="lg:hidden space-y-3">
                          <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border-l-4 border-green-500">
                            <CheckCircle className="text-green-600" size={24} />
                            <div className="flex-1">
                              <p className="font-semibold text-gray-800">{pair.checkIn.caregiver_name}</p>
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                <Clock size={14} />
                                <span>{formatInBeneficiaryTimezone(pair.checkIn.timestamp, timezone, 'HH:mm:ss')}</span>
                                {pair.checkIn.photo_url && (
                                  <>
                                    <span className="text-gray-400">•</span>
                                    <button
                                      onClick={() => setShowPhoto(pair.checkIn.photo_url!)}
                                      className="text-blue-600 hover:underline"
                                    >
                                      {language === 'fr' ? 'Voir photo' : 'View photo'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {pair.checkOut && (
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border-l-4 border-red-500">
                              <XCircle className="text-red-600" size={24} />
                              <div className="flex-1">
                                <p className="font-semibold text-gray-800">{pair.checkOut.caregiver_name}</p>
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  <Clock size={14} />
                                  <span>{formatInBeneficiaryTimezone(pair.checkOut.timestamp, timezone, 'HH:mm:ss')}</span>
                                  {pair.checkOut.photo_url && (
                                    <>
                                      <span className="text-gray-400">•</span>
                                      <button
                                        onClick={() => setShowPhoto(pair.checkOut!.photo_url!)}
                                        className="text-blue-600 hover:underline"
                                      >
                                        {language === 'fr' ? 'Voir photo' : 'View photo'}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {isActive && (
                            <div className="pl-3">
                              <RunningTimer checkInTime={new Date(pair.checkIn.timestamp)} />
                            </div>
                          )}
                        </div>

                        {/* Desktop: Check-in left, Check-out right */}
                        <div className="hidden lg:grid lg:grid-cols-[1fr_auto_1fr] gap-6 items-center">
                          {/* Left: Check-in */}
                          <div className="flex items-center gap-4 p-4 rounded-lg bg-green-50 border-l-4 border-green-500">
                            <CheckCircle className="text-green-600" size={28} />
                            <div className="flex-1">
                              <p className="text-lg font-semibold text-gray-800">{pair.checkIn.caregiver_name}</p>
                              <div className="flex items-center gap-2 text-gray-600 mt-1">
                                <Clock size={16} />
                                <span className="font-medium">{formatInBeneficiaryTimezone(pair.checkIn.timestamp, timezone, 'HH:mm:ss')}</span>
                                {pair.checkIn.photo_url && (
                                  <>
                                    <span className="text-gray-400">•</span>
                                    <button
                                      onClick={() => setShowPhoto(pair.checkIn.photo_url!)}
                                      className="text-blue-600 hover:underline"
                                    >
                                      {language === 'fr' ? 'Voir photo' : 'View photo'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Center: Duration */}
                          <div className="text-center px-4">
                            {pair.checkOut ? (
                              <div className="text-xl font-bold text-blue-600">
                                {(() => {
                                  const duration = (new Date(pair.checkOut.timestamp).getTime() - new Date(pair.checkIn.timestamp).getTime()) / (1000 * 60 * 60);
                                  return `${duration.toFixed(2)}h`;
                                })()}
                              </div>
                            ) : isActive ? (
                              <RunningTimer checkInTime={new Date(pair.checkIn.timestamp)} />
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </div>

                          {/* Right: Check-out */}
                          {pair.checkOut ? (
                            <div className="flex items-center gap-4 p-4 rounded-lg bg-red-50 border-l-4 border-red-500">
                              <XCircle className="text-red-600" size={28} />
                              <div className="flex-1">
                                <p className="text-lg font-semibold text-gray-800">{pair.checkOut.caregiver_name}</p>
                                <div className="flex items-center gap-2 text-gray-600 mt-1">
                                  <Clock size={16} />
                                  <span className="font-medium">{formatInBeneficiaryTimezone(pair.checkOut.timestamp, timezone, 'HH:mm:ss')}</span>
                                  {pair.checkOut.photo_url && (
                                    <>
                                      <span className="text-gray-400">•</span>
                                      <button
                                        onClick={() => setShowPhoto(pair.checkOut!.photo_url!)}
                                        className="text-blue-600 hover:underline"
                                      >
                                        {language === 'fr' ? 'Voir photo' : 'View photo'}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center p-4 rounded-lg bg-gray-100 border-l-4 border-gray-300">
                              <span className="text-gray-400 italic">No check-out</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
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
              caregiverColors={caregiverColors}
            />
          </div>
        )}

        {/* Info Tab */}
        {activeTab === 'info' && (
          <div className="grid lg:grid-cols-2 gap-6 mb-6 w-full overflow-hidden">
            {/* QR Code Section */}
            <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full overflow-hidden">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">QR Code</h2>
              <div className="flex flex-col items-center">
                <QRCodeGenerator
                  qrCode={elderly.qr_code}
                  elderlyName={elderly.name}
                />
                <p className="mt-4 text-sm text-gray-600 text-center">
                  Scan or click to check in/out (geolocation required)
                </p>
              </div>
            </div>

            {/* Beneficiary Information */}
            <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full overflow-hidden">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Beneficiary Information</h2>
              <div className="space-y-3 w-full">
                <div className="flex items-start gap-3 w-full">
                  <User className="text-blue-600 mt-1 flex-shrink-0" size={20} />
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="text-sm text-gray-600">Name</div>
                    <div className="font-semibold text-gray-900 break-words">{elderly.name}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 w-full">
                  <Home className="text-blue-600 mt-1 flex-shrink-0" size={20} />
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="text-sm text-gray-600">Address</div>
                    <div className="font-semibold text-gray-900 break-words">{elderly.address}</div>
                  </div>
                </div>
                {elderly.country && (
                  <div className="flex items-start gap-3">
                    <MapPin className="text-blue-600 mt-1 flex-shrink-0" size={20} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-600">Country</div>
                      <div className="font-semibold text-gray-900 break-words">{elderly.country}</div>
                    </div>
                  </div>
                )}
                {elderly.regular_rate && (
                  <div className="flex items-start gap-3">
                    <Euro className="text-blue-600 mt-1 flex-shrink-0" size={20} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-600">Rates</div>
                      <div className="font-semibold text-gray-900 break-words">
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
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <User className="text-gray-400 flex-shrink-0" size={16} />
                          <span className="font-semibold text-gray-900 break-words">{primaryContact.name}</span>
                        </div>
                        {primaryContact.email && (
                          <div className="flex items-center gap-2 text-sm min-w-0">
                            <Mail className="text-gray-400 flex-shrink-0" size={16} />
                            <a href={`mailto:${primaryContact.email}`} className="text-blue-600 hover:underline break-all">
                              {primaryContact.email}
                            </a>
                          </div>
                        )}
                        {primaryContact.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="text-gray-400 flex-shrink-0" size={16} />
                            <a href={`tel:${primaryContact.phone}`} className="text-blue-600 hover:underline break-words">
                              {primaryContact.phone}
                            </a>
                          </div>
                        )}
                        <div className="pt-2 border-t border-gray-100">
                          {user?.id === primaryContact.id ? (
                            <NotificationPermissionButton familyMemberId={primaryContact.id} />
                          ) : (
                            <div className="text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-700">Push Notifications</span>
                                {primaryContact.has_push_subscription ? (
                                  <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                                    <CheckCircle size={14} /> Enabled
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <XCircle size={14} /> Not enabled
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Family Members Section */}
            <div className="lg:col-span-2 bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h2 className="text-xl font-semibold text-gray-800">Additional Family Members</h2>
                <button
                  onClick={() => setShowAddMemberModal(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  <UserPlus size={20} />
                  <span className="text-sm sm:text-base">Add Family Member</span>
                </button>
              </div>
              {familyMembers.filter(m => m.role !== 'primary').length === 0 ? (
                <p className="text-gray-600 text-center py-8">No additional family members</p>
              ) : (
                <div className="grid md:grid-cols-2 gap-4 w-full">
                  {familyMembers.filter(m => m.role !== 'primary').map((member) => (
                    <div
                      key={member.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow w-full overflow-hidden"
                    >
                      <div className="flex items-start justify-between mb-3 gap-2 w-full">
                        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                          <User className="text-blue-600 flex-shrink-0" size={20} />
                          <div className="font-semibold text-gray-900 break-words truncate">{member.name}</div>
                        </div>
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full capitalize flex-shrink-0 whitespace-nowrap">
                          {member.role}
                        </span>
                      </div>
                      <div className="space-y-3 w-full">
                        {member.email && (
                          <div className="flex items-start gap-2 text-sm min-w-0 w-full overflow-hidden">
                            <Mail className="text-gray-400 flex-shrink-0 mt-0.5" size={16} />
                            <a href={`mailto:${member.email}`} className="text-blue-600 hover:underline break-all overflow-wrap-anywhere">
                              {member.email}
                            </a>
                          </div>
                        )}
                        {member.phone && (
                          <div className="flex items-start gap-2 text-sm w-full">
                            <Phone className="text-gray-400 flex-shrink-0 mt-0.5" size={16} />
                            <a href={`tel:${member.phone}`} className="text-blue-600 hover:underline break-words">
                              {member.phone}
                            </a>
                          </div>
                        )}
                        <div className="pt-2 border-t border-gray-100">
                          {user?.id === member.id ? (
                            <NotificationPermissionButton familyMemberId={member.id} />
                          ) : (
                            <div className="text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-700">Push Notifications</span>
                                {member.has_push_subscription ? (
                                  <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                                    <CheckCircle size={14} /> Enabled
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400 flex items-center gap-1">
                                    <XCircle size={14} /> Not enabled
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
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
          <div>
            {/* Check-ins List */}
            <div className="bg-white rounded-lg shadow-lg p-4 md:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
                <h2 className="text-xl font-semibold text-gray-800">{t('dashboard.checkInHistory')}</h2>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Clock className="text-blue-600" size={20} />
                    <span className="text-sm md:text-base text-gray-700">
                      {t('dashboard.totalHours')}: <span className="font-semibold">{(() => {
                        let total = 0;
                        Object.values(groupedCheckIns).forEach(dayCheckIns => {
                          total += calculateDayHours(dayCheckIns, false);
                        });
                        return `${total.toFixed(2)}h (${decimalToHHMM(total)})`;
                      })()}</span>
                    </span>
                  </div>
                  {(() => {
                    let trainingTotal = 0;
                    Object.values(groupedCheckIns).forEach(dayCheckIns => {
                      trainingTotal += calculateTrainingHours(dayCheckIns);
                    });
                    if (trainingTotal > 0) {
                      return (
                        <div className="flex items-center gap-2">
                          <Clock className="text-amber-600" size={20} />
                          <span className="text-sm md:text-base text-gray-700">
                            {language === 'fr' ? 'Formation' : 'Training'}: <span className="font-semibold text-amber-600">{trainingTotal.toFixed(2)}h ({decimalToHHMM(trainingTotal)})</span>
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>

              {Object.keys(groupedCheckIns).length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="mx-auto text-gray-400 mb-4" size={48} />
                  <p className="text-gray-600">{t('dashboard.noCheckInsMonth')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(groupedCheckIns)
                    .sort(([dateA], [dateB]) => dateB.localeCompare(dateA)) // Sort by date descending
                    .map(([date, dayCheckIns]) => {
                    const chargedHours = calculateDayHours(dayCheckIns, false);
                    const trainingHours = calculateTrainingHours(dayCheckIns);
                    const hasTraining = dayCheckIns.some(ci => ci.is_training);

                    const dayNote = dailyNotes.find(note => note.date === date);

                    return (
                      <div key={date} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Calendar size={18} className="text-gray-600" />
                            <span className="font-semibold text-gray-800">
                              {format(parseDateInTimezone(date), 'EEEE, MMMM d, yyyy', {
                                locale: language === 'fr' ? fr : enUS
                              })}
                            </span>
                            {hasTraining && (
                              <div className="relative group">
                                <CircleAlert className="text-orange-500" size={18} />
                                <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                                  {language === 'fr' ? 'Formation ce jour' : 'Training this day'}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-gray-600">
                            <span>{chargedHours.toFixed(2)}h ({decimalToHHMM(chargedHours)})</span>
                            {trainingHours > 0 && (
                              <span className="text-amber-600">
                                +{trainingHours.toFixed(2)}h ({decimalToHHMM(trainingHours)}) {language === 'fr' ? 'Formation' : 'Training'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Daily Note - Orange Card */}
                        {dayNote && (
                          <div className="mb-3 bg-orange-50 border-l-4 border-orange-500 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <div className="flex-shrink-0 mt-0.5">
                                <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                                  <span className="text-white text-xs font-bold">!</span>
                                </div>
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-orange-900 mb-1">
                                  {language === 'fr' ? 'Note' : 'Note'}
                                </p>
                                <p className="text-sm text-orange-800">{dayNote.reason}</p>
                              </div>
                              <button
                                onClick={() => handleAddNote(createDateFromString(date))}
                                className="text-orange-600 hover:text-orange-700 text-xs underline"
                              >
                                {language === 'fr' ? 'Modifier' : 'Edit'}
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                          {(() => {
                            // Sort by timestamp chronologically (oldest first) for pairing
                            const sorted = [...dayCheckIns].sort((a, b) =>
                              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                            );

                            // Group check-in/check-out pairs
                            const pairs: { checkIn: CheckInOut; checkOut?: CheckInOut }[] = [];
                            const processed = new Set<string>();

                            sorted.forEach((ci) => {
                              if (processed.has(ci.id)) return;

                              if (ci.action === 'check-in') {
                                // Find matching check-out (next check-out from same caregiver)
                                const checkOut = sorted.find(
                                  (co) =>
                                    !processed.has(co.id) &&
                                    co.action === 'check-out' &&
                                    co.caregiver_name === ci.caregiver_name &&
                                    new Date(co.timestamp).getTime() > new Date(ci.timestamp).getTime()
                                );

                                pairs.push({ checkIn: ci, checkOut });
                                processed.add(ci.id);
                                if (checkOut) processed.add(checkOut.id);
                              } else if (!processed.has(ci.id)) {
                                // Orphan check-out
                                pairs.push({ checkIn: ci });
                                processed.add(ci.id);
                              }
                            });

                            // Reverse to show most recent first
                            return pairs.reverse().map((pair, idx) => {
                              const isActive = pair.checkIn.action === 'check-in' && !pair.checkOut;

                              return (
                                <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                  {/* Mobile: Stacked layout */}
                                  <div className="lg:hidden space-y-2">
                                    <div className="flex items-center justify-between p-2 rounded bg-green-50">
                                      <div className="flex items-center gap-2 flex-1">
                                        <CheckCircle className="text-green-600" size={16} />
                                        <div className="flex-1">
                                          <p className="font-medium text-gray-800 text-sm">{pair.checkIn.caregiver_name}</p>
                                          <div className="flex items-center gap-2 text-xs text-gray-600">
                                            <Clock size={12} />
                                            <span>{formatInBeneficiaryTimezone(pair.checkIn.timestamp, timezone, 'HH:mm:ss')}</span>
                                            {pair.checkIn.photo_url && (
                                              <>
                                                <span className="text-gray-400">•</span>
                                                <button
                                                  onClick={() => setShowPhoto(pair.checkIn.photo_url!)}
                                                  className="text-blue-600 hover:underline"
                                                >
                                                  {language === 'fr' ? 'Photo' : 'Photo'}
                                                </button>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-200 text-green-800">
                                        In
                                      </span>
                                    </div>

                                    {pair.checkOut && (
                                      <div className="flex items-center justify-between p-2 rounded bg-red-50">
                                        <div className="flex items-center gap-2 flex-1">
                                          <XCircle className="text-red-600" size={16} />
                                          <div className="flex-1">
                                            <p className="font-medium text-gray-800 text-sm">{pair.checkOut.caregiver_name}</p>
                                            <div className="flex items-center gap-2 text-xs text-gray-600">
                                              <Clock size={12} />
                                              <span>{formatInBeneficiaryTimezone(pair.checkOut.timestamp, timezone, 'HH:mm:ss')}</span>
                                              {pair.checkOut.photo_url && (
                                                <>
                                                  <span className="text-gray-400">•</span>
                                                  <button
                                                    onClick={() => setShowPhoto(pair.checkOut!.photo_url!)}
                                                    className="text-blue-600 hover:underline"
                                                  >
                                                    {language === 'fr' ? 'Photo' : 'Photo'}
                                                  </button>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-200 text-red-800">
                                          Out
                                        </span>
                                      </div>
                                    )}

                                    {isActive && (
                                      <div className="pl-2">
                                        <RunningTimer checkInTime={new Date(pair.checkIn.timestamp)} />
                                      </div>
                                    )}
                                  </div>

                                  {/* Desktop: Check-in left, Check-out right */}
                                  <div className="hidden lg:grid lg:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                                    {/* Left: Check-in */}
                                    <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border-l-4 border-green-500">
                                      <CheckCircle className="text-green-600" size={20} />
                                      <div className="flex-1">
                                        <p className="font-medium text-gray-800">{pair.checkIn.caregiver_name}</p>
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                          <Clock size={14} />
                                          <span>{formatInBeneficiaryTimezone(pair.checkIn.timestamp, timezone, 'HH:mm:ss')}</span>
                                          {pair.checkIn.photo_url && (
                                            <>
                                              <span className="text-gray-400">•</span>
                                              <button
                                                onClick={() => setShowPhoto(pair.checkIn.photo_url!)}
                                                className="text-blue-600 hover:underline"
                                              >
                                                {language === 'fr' ? 'Photo' : 'Photo'}
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Center: Duration or status */}
                                    <div className="text-center px-4">
                                      {pair.checkOut ? (
                                        <div className="text-base font-bold text-blue-600">
                                          {(() => {
                                            const duration = (new Date(pair.checkOut.timestamp).getTime() - new Date(pair.checkIn.timestamp).getTime()) / (1000 * 60 * 60);
                                            return `${duration.toFixed(2)}h`;
                                          })()}
                                        </div>
                                      ) : isActive ? (
                                        <RunningTimer checkInTime={new Date(pair.checkIn.timestamp)} />
                                      ) : (
                                        <span className="text-sm text-gray-400">—</span>
                                      )}
                                    </div>

                                    {/* Right: Check-out */}
                                    {pair.checkOut ? (
                                      <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border-l-4 border-red-500">
                                        <XCircle className="text-red-600" size={20} />
                                        <div className="flex-1">
                                          <p className="font-medium text-gray-800">{pair.checkOut.caregiver_name}</p>
                                          <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <Clock size={14} />
                                            <span>{formatInBeneficiaryTimezone(pair.checkOut.timestamp, timezone, 'HH:mm:ss')}</span>
                                            {pair.checkOut.photo_url && (
                                              <>
                                                <span className="text-gray-400">•</span>
                                                <button
                                                  onClick={() => setShowPhoto(pair.checkOut!.photo_url!)}
                                                  className="text-blue-600 hover:underline"
                                                >
                                                  {language === 'fr' ? 'Photo' : 'Photo'}
                                                </button>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center p-3 rounded-lg bg-gray-100 border-l-4 border-gray-300">
                                        <span className="text-sm text-gray-400 italic">No check-out</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
          <div className="relative max-w-3xl max-h-[90vh] w-auto" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowPhoto(null)}
              className="absolute -top-3 -right-3 bg-white rounded-full p-2 hover:bg-gray-100 shadow-lg z-10"
              aria-label="Close"
            >
              <X size={24} className="text-gray-700" />
            </button>
            <img src={showPhoto} alt="Check-in photo" className="max-w-full max-h-[90vh] rounded-lg object-contain" />
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
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
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
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
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
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
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

      {/* Daily Note Modal */}
      {selectedNoteDate && (() => {
        const existingNote = dailyNotes.find(
          (note) => note.date === format(selectedNoteDate, 'yyyy-MM-dd')
        );
        return (
          <DailyNoteModal
            isOpen={noteModalOpen}
            onClose={() => setNoteModalOpen(false)}
            beneficiaryId={beneficiaryId}
            date={selectedNoteDate}
            existingNote={existingNote?.reason}
            existingNoteType={existingNote?.note_type as 'modification' | 'cancellation' | 'special_instruction' | 'general' | undefined}
            onSave={handleSaveNote}
            onDelete={existingNote ? handleDeleteNote : undefined}
          />
        );
      })()}

    </div>
  );
}
