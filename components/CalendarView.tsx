'use client';

import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { useState, useEffect } from 'react';
import { getHolidayType } from '@/lib/holidays';
import { PartyPopper, StickyNote } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getColor, hexToRgba } from '@/lib/caregiver-colors';

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

type DailyNote = {
  id: string;
  beneficiary_id: string;
  date: string;
  note_type?: string;
  original_time?: string;
  modified_time?: string;
  reason: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
};

type CalendarViewProps = {
  selectedMonth: Date;
  checkIns: CheckInOut[];
  caregiverColors: Map<string, string>;
  onDayClick: (date: Date, dayCheckIns: CheckInOut[]) => void;
  timezone: string;
  dailyNotes?: DailyNote[];
  onAddNote?: (date: Date) => void;
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

export default function CalendarView({ selectedMonth, checkIns, caregiverColors, onDayClick, timezone, dailyNotes = [], onAddNote }: CalendarViewProps) {
  const { language } = useLanguage();

  const getNoteForDate = (date: Date): DailyNote | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return dailyNotes.find(note => note.date === dateStr);
  };

  // Get all unique caregiver names for color fallback
  const allCaregiverNames = Array.from(new Set(checkIns.map(ci => ci.caregiver_name)));

  // French calendar starts on Monday (weekStartsOn: 1), English starts on Sunday (weekStartsOn: 0)
  const weekStartsOn = language === 'fr' ? 1 : 0;

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getDayCheckIns = (date: Date) => {
    return checkIns.filter(ci => {
      // Convert timestamp to beneficiary's timezone before comparing dates
      const ciDateInTz = toZonedTime(new Date(ci.timestamp), timezone);
      return isSameDay(ciDateInTz, date);
    });
  };

  const getDayStatus = (date: Date, dayCheckIns: CheckInOut[]) => {
    if (dayCheckIns.length === 0) return 'empty';

    // Sort by timestamp
    const sorted = [...dayCheckIns].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Check if last action is check-in (currently present) or check-out (left)
    const lastAction = sorted[sorted.length - 1];

    // Only mark as "present" if it's today and last action was check-in
    const isToday = isSameDay(date, new Date());
    if (isToday && lastAction.action === 'check-in') {
      return 'present';
    }

    // If there are any check-ins, they left (checked out)
    return 'left';
  };

  const getCellStyle = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-100 border-2 border-green-500';
      case 'left':
        return 'bg-white border-2 border-red-500';
      case 'empty':
        return 'bg-white border border-gray-200';
      default:
        return 'bg-white border border-gray-200';
    }
  };

  const getUniqueCaregivers = (dayCheckIns: CheckInOut[]) => {
    const names = new Set(dayCheckIns.map(ci => ci.caregiver_name));
    return Array.from(names);
  };

  const getCheckInOutTimes = (dayCheckIns: CheckInOut[]) => {
    const sorted = [...dayCheckIns].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const times: string[] = [];
    for (const ci of sorted) {
      const time = formatInTimeZone(new Date(ci.timestamp), timezone, 'HH:mm');
      const icon = ci.action === 'check-in' ? '→' : '←';
      times.push(`${icon}${time}`);
    }
    return times;
  };

  const getActiveCheckIn = (dayCheckIns: CheckInOut[]): Date | null => {
    const sorted = [...dayCheckIns].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const lastAction = sorted[sorted.length - 1];
    if (lastAction && lastAction.action === 'check-in') {
      return new Date(lastAction.timestamp);
    }
    return null;
  };

  const calculateDayHours = (dayCheckIns: CheckInOut[]): number => {
    let totalHours = 0;
    const sorted = [...dayCheckIns].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

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

        if (checkOut) {
          const checkIn = new Date(ci.timestamp).getTime();
          const checkOutTime = new Date(checkOut.timestamp).getTime();
          totalHours += (checkOutTime - checkIn) / (1000 * 60 * 60);
          processed.add(ci.id);
          processed.add(checkOut.id);
        }
      }
    });

    return totalHours;
  };

  const calculateTrainingHours = (dayCheckIns: CheckInOut[]): number => {
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
          const checkIn = new Date(ci.timestamp).getTime();
          const checkOutTime = new Date(checkOut.timestamp).getTime();
          totalHours += (checkOutTime - checkIn) / (1000 * 60 * 60);
          processed.add(ci.id);
          processed.add(checkOut.id);
        }
      }
    });

    return totalHours;
  };

  const calculateMonthTotalHours = (includeTraining: boolean = true): number => {
    let totalHours = 0;
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    days.forEach(day => {
      const dayCheckIns = getDayCheckIns(day);
      const sorted = [...dayCheckIns].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const processed = new Set<string>();

      sorted.forEach((ci) => {
        if (processed.has(ci.id)) return;

        if (ci.action === 'check-in') {
          // Skip or include training based on parameter
          if (!includeTraining && ci.is_training) return;

          const checkOut = sorted.find(
            (co) =>
              !processed.has(co.id) &&
              co.action === 'check-out' &&
              co.caregiver_name === ci.caregiver_name &&
              new Date(co.timestamp).getTime() > new Date(ci.timestamp).getTime()
          );

          if (checkOut) {
            const checkIn = new Date(ci.timestamp).getTime();
            const checkOutTime = new Date(checkOut.timestamp).getTime();
            totalHours += (checkOutTime - checkIn) / (1000 * 60 * 60);
            processed.add(ci.id);
            processed.add(checkOut.id);
          }
        }
      });
    });

    return totalHours;
  };

  const calculateMonthTrainingHours = (): number => {
    let totalHours = 0;
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    days.forEach(day => {
      const dayCheckIns = getDayCheckIns(day);
      totalHours += calculateTrainingHours(dayCheckIns);
    });

    return totalHours;
  };

  const formatHours = (hours: number): string => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h${m.toString().padStart(2, '0')}`;
  };

  const monthChargedHours = calculateMonthTotalHours(false);
  const monthTrainingHours = calculateMonthTrainingHours();

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-3">
        <h2 className="text-xl font-semibold text-gray-800">
          {format(selectedMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex flex-wrap items-center gap-4 text-sm sm:text-base">
          <div className="text-right">
            <div className="text-xs sm:text-sm text-gray-600">{language === 'fr' ? 'Heures facturées' : 'Charged Hours'}</div>
            <div className="text-base sm:text-lg font-bold text-blue-600">
              {formatHours(monthChargedHours)} ({monthChargedHours.toFixed(2)}h)
            </div>
          </div>
          {monthTrainingHours > 0 && (
            <div className="text-right">
              <div className="text-xs sm:text-sm text-gray-600">{language === 'fr' ? 'Formation' : 'Training'}</div>
              <div className="text-base sm:text-lg font-bold text-amber-600">
                {formatHours(monthTrainingHours)} ({monthTrainingHours.toFixed(2)}h)
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {/* Day headers */}
        {(language === 'fr'
          ? ['L', 'M', 'M', 'J', 'V', 'S', 'D']
          : ['S', 'M', 'T', 'W', 'T', 'F', 'S']
        ).map((day, idx) => (
          <div key={idx} className="text-center font-semibold text-gray-600 text-xs sm:text-sm py-1 sm:py-2">
            <span className="sm:hidden">{day}</span>
            <span className="hidden sm:inline">
              {language === 'fr'
                ? ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'][idx]
                : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][idx]
              }
            </span>
          </div>
        ))}

        {/* Calendar days */}
        {days.map(day => {
          const dayCheckIns = getDayCheckIns(day);
          const status = getDayStatus(day, dayCheckIns);
          const isCurrentMonth = isSameMonth(day, selectedMonth);
          const caregivers = getUniqueCaregivers(dayCheckIns);
          const times = getCheckInOutTimes(dayCheckIns);
          const holidayInfo = getHolidayType(day);
          const dayHours = calculateDayHours(dayCheckIns);
          const activeCheckIn = getActiveCheckIn(dayCheckIns);
          const dayNote = getNoteForDate(day);

          return (
            <div
              key={day.toISOString()}
              className={`group min-h-16 sm:min-h-24 p-1 sm:p-2 rounded-lg cursor-pointer transition-all hover:shadow-md relative ${getCellStyle(status)} ${
                !isCurrentMonth ? 'opacity-40' : ''
              }`}
              onClick={() => {
                if (dayCheckIns.length > 0) {
                  onDayClick(day, dayCheckIns);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onAddNote?.(day);
              }}
            >
              {/* Holiday indicator badge - always visible in top right */}
              {holidayInfo && (
                <div
                  className="absolute -top-1 -right-1 z-10"
                  title={holidayInfo.name}
                >
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full ${
                    holidayInfo.type === 'holiday'
                      ? 'bg-purple-600 text-white'
                      : 'bg-amber-500 text-white'
                  } shadow-md`}>
                    <PartyPopper size={12} />
                  </div>
                </div>
              )}

              <div className="flex justify-between items-start mb-0.5 sm:mb-1">
                <div className="flex items-center gap-1">
                  <div className={`text-xs sm:text-sm font-semibold ${
                    isSameDay(day, new Date()) ? 'text-blue-600' : 'text-gray-700'
                  }`}>
                    {format(day, 'd')}
                  </div>
                  {/* Note icon next to date */}
                  {onAddNote && (
                    <div className="relative group/note">
                      {dayNote ? (
                        // Existing note - white icon on orange background
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddNote(day);
                          }}
                          className="flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                          title={dayNote.reason}
                        >
                          <StickyNote size={10} className="sm:w-3 sm:h-3" />
                        </button>
                      ) : (
                        // No note - orange icon on white background
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddNote(day);
                          }}
                          className="flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white border border-orange-500 text-orange-500 hover:bg-orange-50 transition-colors opacity-0 group-hover:opacity-100"
                          title={language === 'fr' ? 'Ajouter une note' : 'Add note'}
                        >
                          <StickyNote size={10} className="sm:w-3 sm:h-3" />
                        </button>
                      )}
                      {/* Tooltip for existing note */}
                      {dayNote && (
                        <div className="absolute left-0 top-full mt-1 hidden group-hover/note:block bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap shadow-lg z-30 max-w-[200px] whitespace-normal">
                          {dayNote.reason}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {dayHours > 0 && (
                    <div className="text-[10px] sm:text-xs font-semibold text-blue-600">
                      {formatHours(dayHours)}
                    </div>
                  )}
                </div>
              </div>

              {dayCheckIns.length > 0 && (
                <div className="space-y-0.5 sm:space-y-1">
                  {/* Hide caregiver names on mobile, show on desktop */}
                  <div className="hidden sm:block">
                    {caregivers.map((name, idx) => {
                      const color = getColor(name, caregiverColors, allCaregiverNames);
                      return (
                        <div
                          key={idx}
                          className="text-xs font-medium truncate px-1 py-0.5 rounded"
                          style={{
                            color: color,
                            backgroundColor: hexToRgba(color, 0.1)
                          }}
                        >
                          {name}
                        </div>
                      );
                    })}
                  </div>
                  {/* Show just a dot indicator on mobile */}
                  <div className="sm:hidden flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                    <span className="text-[10px] text-gray-600">{dayCheckIns.length}</span>
                  </div>
                  {/* Times - simplified on mobile */}
                  <div className="hidden sm:flex flex-wrap gap-1">
                    {times.slice(0, 2).map((time, idx) => (
                      <span key={idx} className="text-xs text-gray-600">
                        {time}
                      </span>
                    ))}
                    {times.length > 2 && (
                      <span className="text-xs text-gray-500">+{times.length - 2}</span>
                    )}
                  </div>
                  {/* Show running timer for active check-ins */}
                  {activeCheckIn && (
                    <div className="mt-0.5 sm:mt-1">
                      <RunningTimer checkInTime={activeCheckIn} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-100 border-2 border-green-500 rounded"></div>
          <span className="text-gray-600">{language === 'fr' ? 'Aide-soignant présent' : 'Caregiver Present'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-white border-2 border-red-500 rounded"></div>
          <span className="text-gray-600">{language === 'fr' ? 'Aide-soignant parti' : 'Caregiver Left'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-white border border-gray-200 rounded"></div>
          <span className="text-gray-600">{language === 'fr' ? 'Aucun pointage' : 'No Check-in'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
            <StickyNote size={12} className="text-white" />
          </div>
          <span className="text-gray-600">{language === 'fr' ? 'Note du jour' : 'Daily Note'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
            <PartyPopper size={12} className="text-white" />
          </div>
          <span className="text-gray-600">{language === 'fr' ? 'Jour férié' : 'Public Holiday'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
            <PartyPopper size={12} className="text-white" />
          </div>
          <span className="text-gray-600">{language === 'fr' ? 'Dimanche' : 'Sunday'}</span>
        </div>
      </div>
    </div>
  );
}
