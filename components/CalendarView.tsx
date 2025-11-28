'use client';

import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek } from 'date-fns';
import { useState, useEffect } from 'react';
import { getHolidayType } from '@/lib/holidays';
import { PartyPopper } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

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

type CalendarViewProps = {
  selectedMonth: Date;
  checkIns: CheckInOut[];
  onDayClick: (date: Date, dayCheckIns: CheckInOut[]) => void;
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

export default function CalendarView({ selectedMonth, checkIns, onDayClick }: CalendarViewProps) {
  const { language } = useLanguage();

  // French calendar starts on Monday (weekStartsOn: 1), English starts on Sunday (weekStartsOn: 0)
  const weekStartsOn = language === 'fr' ? 1 : 0;

  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getDayCheckIns = (date: Date) => {
    return checkIns.filter(ci =>
      isSameDay(new Date(ci.timestamp), date)
    );
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
      const time = format(new Date(ci.timestamp), 'HH:mm');
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

    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].action === 'check-in' && sorted[i + 1]?.action === 'check-out') {
        const checkIn = new Date(sorted[i].timestamp).getTime();
        const checkOut = new Date(sorted[i + 1].timestamp).getTime();
        totalHours += (checkOut - checkIn) / (1000 * 60 * 60);
      }
    }
    return totalHours;
  };

  const calculateMonthTotalHours = (): number => {
    const monthCheckIns = checkIns.filter(ci =>
      isSameMonth(new Date(ci.timestamp), selectedMonth)
    );

    let totalHours = 0;
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    days.forEach(day => {
      const dayCheckIns = getDayCheckIns(day);
      totalHours += calculateDayHours(dayCheckIns);
    });

    return totalHours;
  };

  const formatHours = (hours: number): string => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h${m.toString().padStart(2, '0')}`;
  };

  const monthTotalHours = calculateMonthTotalHours();

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">
          {format(selectedMonth, 'MMMM yyyy')}
        </h2>
        <div className="text-right">
          <div className="text-sm text-gray-600">Total du mois</div>
          <div className="text-lg font-bold text-blue-600">
            {formatHours(monthTotalHours)} ({monthTotalHours.toFixed(2)}h)
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {/* Day headers */}
        {(language === 'fr'
          ? ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
          : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        ).map(day => (
          <div key={day} className="text-center font-semibold text-gray-600 text-sm py-2">
            {day}
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

          return (
            <div
              key={day.toISOString()}
              className={`min-h-24 p-2 rounded-lg cursor-pointer transition-all hover:shadow-md relative ${getCellStyle(status)} ${
                !isCurrentMonth ? 'opacity-40' : ''
              }`}
              onClick={() => dayCheckIns.length > 0 && onDayClick(day, dayCheckIns)}
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

              <div className="flex justify-between items-start mb-1">
                <div className={`text-sm font-semibold ${
                  isSameDay(day, new Date()) ? 'text-blue-600' : 'text-gray-700'
                }`}>
                  {format(day, 'd')}
                </div>
                {dayHours > 0 && (
                  <div className="text-xs font-semibold text-blue-600">
                    {formatHours(dayHours)}
                  </div>
                )}
              </div>

              {dayCheckIns.length > 0 && (
                <div className="space-y-1">
                  {caregivers.map((name, idx) => (
                    <div key={idx} className="text-xs font-medium text-gray-800 truncate">
                      {name}
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-1">
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
                    <div className="mt-1">
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
          <span className="text-gray-600">Caregiver Present</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-white border-2 border-red-500 rounded"></div>
          <span className="text-gray-600">Caregiver Left</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-white border border-gray-200 rounded"></div>
          <span className="text-gray-600">No Check-in</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
            <PartyPopper size={12} className="text-white" />
          </div>
          <span className="text-gray-600">Public Holiday</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
            <PartyPopper size={12} className="text-white" />
          </div>
          <span className="text-gray-600">Sunday</span>
        </div>
      </div>
    </div>
  );
}
