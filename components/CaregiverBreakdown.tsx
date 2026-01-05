'use client';

import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { User, Clock, Euro, CheckCircle, XCircle } from 'lucide-react';
import { decimalToHHMM, formatNumber } from '@/lib/time-utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { getColor, hexToRgba } from '@/lib/caregiver-colors';
import { getHolidayMajoration } from '@/lib/holiday-rates';

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

type CaregiverSummary = {
  name: string;
  regularHours: number;
  holiday25Hours: number;
  holiday100Hours: number;
  totalHours: number;
  regularAmount: number;
  holiday25Amount: number;
  holiday100Amount: number;
  totalAmount: number;
};

type TrainingSession = {
  date: Date;
  checkIn: Date;
  checkOut: Date;
  hours: number;
};

type TrainingSummary = {
  name: string;
  sessions: TrainingSession[];
  totalHours: number;
};

type DailyNote = {
  id: string;
  beneficiary_id: string;
  date: string;
  note_type?: string;
  reason: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
};

type CaregiverBreakdownProps = {
  checkIns: CheckInOut[];
  selectedMonth: Date;
  regularRate: number;
  currency: string;
  copayPercentage: number;
  caregiverColors: Map<string, string>;
  dailyNotes: DailyNote[];
  timezone: string;
};

export default function CaregiverBreakdown({
  checkIns,
  selectedMonth,
  regularRate,
  currency,
  copayPercentage,
  caregiverColors,
  dailyNotes,
  timezone,
}: CaregiverBreakdownProps) {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? fr : enUS;

  // Calculate dynamic rates
  const rate25 = regularRate * 1.25;
  const rate100 = regularRate * 2.0;

  // Get all unique caregiver names for color fallback
  const allCaregiverNames = Array.from(new Set(checkIns.map(ci => ci.caregiver_name)));

  const calculateHoursPerCaregiver = (): CaregiverSummary[] => {
    const caregiverMap = new Map<string, { regularHours: number; holiday25Hours: number; holiday100Hours: number }>();

    // Group check-ins by caregiver
    const sorted = [...checkIns].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const processed = new Set<string>();

    // Calculate hours for each check-in/check-out pair
    sorted.forEach((ci) => {
      if (processed.has(ci.id)) return;

      if (ci.action === 'check-in') {
        // Skip training sessions (Binome ADV) - not charged
        if (ci.is_training) return;

        // Find matching check-out (next check-out from same caregiver)
        const checkOut = sorted.find(
          (co) =>
            !processed.has(co.id) &&
            co.action === 'check-out' &&
            co.caregiver_name === ci.caregiver_name &&
            new Date(co.timestamp).getTime() > new Date(ci.timestamp).getTime()
        );

        if (!checkOut) return;

        const caregiverName = ci.caregiver_name;
        const start = new Date(ci.timestamp);
        const end = new Date(checkOut.timestamp);
        const totalMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

        // Mark both as processed
        processed.add(ci.id);
        processed.add(checkOut.id);

        if (!caregiverMap.has(caregiverName)) {
          caregiverMap.set(caregiverName, { regularHours: 0, holiday25Hours: 0, holiday100Hours: 0 });
        }

        const stats = caregiverMap.get(caregiverName)!;

        // Check for holiday majoration
        const dateStr = format(start, 'yyyy-MM-dd');
        const publicHolidayMajoration = getHolidayMajoration(dateStr);
        const isSunday = start.getDay() === 0;

        // If it's May 1st or Dec 25th (100% majoration holidays)
        if (publicHolidayMajoration === 1.0) {
          stats.holiday100Hours += totalMinutes / 60;
        }
        // If it's another public holiday or Sunday (25% majoration)
        else if (publicHolidayMajoration === 0.25 || isSunday) {
          stats.holiday25Hours += totalMinutes / 60;
        }
        // Otherwise, check for after 8pm (20:00) hours
        else {
          const eveningStart = new Date(start);
          eveningStart.setHours(20, 0, 0, 0);

          if (start < eveningStart && end > eveningStart) {
            // Shift crosses 8 PM boundary
            const regularMinutes = (eveningStart.getTime() - start.getTime()) / (1000 * 60);
            const holiday25Minutes = (end.getTime() - eveningStart.getTime()) / (1000 * 60);
            stats.regularHours += regularMinutes / 60;
            stats.holiday25Hours += holiday25Minutes / 60;
          } else if (start >= eveningStart) {
            // Entire shift is after 8 PM (25% majoration)
            stats.holiday25Hours += totalMinutes / 60;
          } else {
            // Regular hours (ends before 8 PM)
            stats.regularHours += totalMinutes / 60;
          }
        }
      }
    });

    // Convert to array and calculate amounts
    const summaries: CaregiverSummary[] = [];
    caregiverMap.forEach((stats, name) => {
      const regularAmount = stats.regularHours * regularRate;
      const holiday25Amount = stats.holiday25Hours * rate25;
      const holiday100Amount = stats.holiday100Hours * rate100;
      const totalAmount = regularAmount + holiday25Amount + holiday100Amount;
      const totalHours = stats.regularHours + stats.holiday25Hours + stats.holiday100Hours;

      summaries.push({
        name,
        regularHours: stats.regularHours,
        holiday25Hours: stats.holiday25Hours,
        holiday100Hours: stats.holiday100Hours,
        totalHours,
        regularAmount,
        holiday25Amount,
        holiday100Amount,
        totalAmount,
      });
    });

    return summaries.sort((a, b) => a.name.localeCompare(b.name));
  };

  const calculateTrainingSessions = (): TrainingSummary[] => {
    const trainingMap = new Map<string, TrainingSession[]>();

    // Group check-ins by caregiver
    const sorted = [...checkIns].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const processed = new Set<string>();

    // Find training session pairs
    sorted.forEach((ci) => {
      if (processed.has(ci.id)) return;

      if (ci.action === 'check-in' && ci.is_training) {
        // Find matching check-out (next check-out from same caregiver)
        const checkOut = sorted.find(
          (co) =>
            !processed.has(co.id) &&
            co.action === 'check-out' &&
            co.caregiver_name === ci.caregiver_name &&
            new Date(co.timestamp).getTime() > new Date(ci.timestamp).getTime()
        );

        if (!checkOut) return;

        const caregiverName = ci.caregiver_name;
        const checkInTime = new Date(ci.timestamp);
        const checkOutTime = new Date(checkOut.timestamp);
        const hours = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

        // Mark both as processed
        processed.add(ci.id);
        processed.add(checkOut.id);

        if (!trainingMap.has(caregiverName)) {
          trainingMap.set(caregiverName, []);
        }

        trainingMap.get(caregiverName)!.push({
          date: checkInTime,
          checkIn: checkInTime,
          checkOut: checkOutTime,
          hours,
        });
      }
    });

    // Convert to array
    const trainingSummaries: TrainingSummary[] = [];
    trainingMap.forEach((sessions, name) => {
      const totalHours = sessions.reduce((sum, session) => sum + session.hours, 0);
      trainingSummaries.push({
        name,
        sessions,
        totalHours,
      });
    });

    return trainingSummaries.sort((a, b) => a.name.localeCompare(b.name));
  };

  const summaries = calculateHoursPerCaregiver();
  const trainingSummaries = calculateTrainingSessions();
  const totals = summaries.reduce(
    (acc, summary) => ({
      regularHours: acc.regularHours + summary.regularHours,
      holiday25Hours: acc.holiday25Hours + summary.holiday25Hours,
      holiday100Hours: acc.holiday100Hours + summary.holiday100Hours,
      totalHours: acc.totalHours + summary.totalHours,
      regularAmount: acc.regularAmount + summary.regularAmount,
      holiday25Amount: acc.holiday25Amount + summary.holiday25Amount,
      holiday100Amount: acc.holiday100Amount + summary.holiday100Amount,
      totalAmount: acc.totalAmount + summary.totalAmount,
    }),
    { regularHours: 0, holiday25Hours: 0, holiday100Hours: 0, totalHours: 0, regularAmount: 0, holiday25Amount: 0, holiday100Amount: 0, totalAmount: 0 }
  );

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 md:p-6">
      <h2 className="text-lg md:text-xl font-semibold text-gray-800 mb-4">
        {t('financial.title')} - {format(selectedMonth, 'MMMM yyyy', { locale })}
      </h2>

      {summaries.length === 0 ? (
        <div className="text-center py-12">
          <User className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600">{t('financial.noCaregiverData')}</p>
        </div>
      ) : (
        <>
          {/* Regular Hours Table */}
          <div className="mb-6 bg-white rounded-lg shadow-lg p-4 md:p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              {language === 'fr' ? 'Heures Normales HT' : 'Regular Hours (Before Tax)'} - {currency}{formatNumber(regularRate, 2, language)}/h
            </h3>

            <div className="md:hidden text-xs text-gray-500 mb-2 text-center">
              ← Swipe to see all columns →
            </div>

            <div className="overflow-x-auto">
              <table className="w-full md:min-w-[600px]">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-2 md:py-3 px-1 md:px-2 font-semibold text-gray-700 text-xs md:text-sm sticky left-0 bg-white z-10">
                      {t('financial.caregiver')}
                    </th>
                    <th className="text-right py-2 md:py-3 px-1 md:px-2 font-semibold text-gray-700 text-xs md:text-sm">
                      <div className="md:whitespace-nowrap">
                        <div>{language === 'fr' ? 'Heures' : 'Hours'}</div>
                      </div>
                      <div className="text-[10px] md:text-xs font-normal text-gray-500">({t('financial.decimal')} / {t('financial.timeFormat')})</div>
                    </th>
                    <th className="text-right py-2 md:py-3 px-1 md:px-2 font-semibold text-gray-700 text-xs md:text-sm">
                      <div className="md:whitespace-nowrap">
                        <div>{language === 'fr' ? 'Montant' : 'Amount'}</div>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.filter(s => s.regularHours > 0).map((summary, idx) => {
                    const color = getColor(summary.name, caregiverColors, allCaregiverNames);
                    return (
                      <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-2 md:py-3 px-1 md:px-2 font-medium text-xs md:text-sm sticky left-0 bg-white w-1 whitespace-nowrap">
                          <span
                            className="px-2 py-1 rounded font-semibold"
                            style={{
                              color: color,
                              backgroundColor: hexToRgba(color, 0.15)
                            }}
                          >
                            {summary.name}
                          </span>
                        </td>
                      <td className="py-2 md:py-3 px-1 md:px-2 text-right text-gray-700 text-xs md:text-sm w-1 whitespace-nowrap">
                        <div>{formatNumber(summary.regularHours, 2, language)}h</div>
                        <div className="text-[10px] md:text-xs text-gray-500">{decimalToHHMM(summary.regularHours)}</div>
                      </td>
                      <td className="py-2 md:py-3 px-1 md:px-2 text-right text-gray-700 text-xs md:text-sm w-1 whitespace-nowrap">
                        {currency}{formatNumber(summary.regularAmount, 2, language)}
                      </td>
                    </tr>
                  );
                  })}
                  {/* Total Hours Row */}
                  <tr className="border-t border-gray-300 bg-blue-50">
                    <td className="py-2 md:py-3 px-1 md:px-2 font-semibold text-gray-800 text-xs md:text-sm sticky left-0 bg-blue-50 w-1 whitespace-nowrap">
                      {language === 'fr' ? 'Total' : 'Total'}
                    </td>
                    <td className="py-2 md:py-3 px-1 md:px-2 text-right font-semibold text-gray-800 text-xs md:text-sm w-1 whitespace-nowrap">
                      <div>{formatNumber(totals.regularHours, 2, language)}h</div>
                      <div className="text-[10px] md:text-xs text-gray-600">{decimalToHHMM(totals.regularHours)}</div>
                    </td>
                    <td className="py-2 md:py-3 px-1 md:px-2 text-right font-semibold text-gray-800 text-xs md:text-sm w-1 whitespace-nowrap">
                      {currency}{formatNumber(totals.regularAmount, 2, language)}
                    </td>
                  </tr>
                  {/* TVA Row */}
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <td colSpan={2} className="py-2 md:py-3 px-1 md:px-2 text-right text-gray-600 text-xs md:text-sm whitespace-nowrap">
                      {language === 'fr' ? 'TVA (5,5%)' : 'VAT (5.5%)'}
                    </td>
                    <td className="py-2 md:py-3 px-1 md:px-2 text-right text-gray-700 text-xs md:text-sm w-1 whitespace-nowrap">
                      {currency}{formatNumber(totals.regularAmount * 0.055, 2, language)}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  {/* Grand Total Row */}
                  <tr className="border-t-2 border-gray-400 bg-green-50">
                    <td colSpan={2} className="py-3 md:py-4 px-1 md:px-2 text-right font-bold text-gray-900 text-sm md:text-base whitespace-nowrap">
                      {language === 'fr' ? 'TOTAL TTC' : 'TOTAL INC. VAT'}
                    </td>
                    <td className="py-3 md:py-4 px-1 md:px-2 text-right font-bold text-green-600 text-lg md:text-xl w-1 whitespace-nowrap">
                      {currency}{formatNumber(totals.regularAmount * 1.055, 2, language)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Holiday 25% Hours Table - Only show if there are holiday25 hours */}
          {totals.holiday25Hours > 0 && (
            <div className="mb-6 bg-white rounded-lg shadow-lg p-4 md:p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                {language === 'fr' ? 'Heures Majorées +25% HT' : 'Holiday Hours +25% (Before Tax)'} - {currency}{formatNumber(rate25, 2, language)}/h
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                {language === 'fr'
                  ? 'Jours fériés, dimanches et après 20h00'
                  : 'Public holidays, Sundays, and after 8:00 PM'}
              </p>

              <div className="md:hidden text-xs text-gray-500 mb-2 text-center">
                ← Swipe to see all columns →
              </div>

              <div className="overflow-x-auto">
                <table className="w-full md:min-w-[600px]">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left py-2 md:py-3 px-1 md:px-2 font-semibold text-gray-700 text-xs md:text-sm sticky left-0 bg-white z-10">
                        {t('financial.caregiver')}
                      </th>
                      <th className="text-right py-2 md:py-3 px-1 md:px-2 font-semibold text-gray-700 text-xs md:text-sm">
                        <div className="md:whitespace-nowrap">
                          <div>{language === 'fr' ? 'Heures' : 'Hours'}</div>
                        </div>
                        <div className="text-[10px] md:text-xs font-normal text-gray-500">({t('financial.decimal')} / {t('financial.timeFormat')})</div>
                      </th>
                      <th className="text-right py-2 md:py-3 px-1 md:px-2 font-semibold text-gray-700 text-xs md:text-sm">
                        <div className="md:whitespace-nowrap">
                          <div>{language === 'fr' ? 'Montant' : 'Amount'}</div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.filter(s => s.holiday25Hours > 0).map((summary, idx) => {
                      const color = getColor(summary.name, caregiverColors, allCaregiverNames);
                      return (
                        <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                          <td className="py-2 md:py-3 px-1 md:px-2 font-medium text-xs md:text-sm sticky left-0 bg-white w-1 whitespace-nowrap">
                            <span
                              className="px-2 py-1 rounded font-semibold"
                              style={{
                                color: color,
                                backgroundColor: hexToRgba(color, 0.15)
                              }}
                            >
                              {summary.name}
                            </span>
                          </td>
                        <td className="py-2 md:py-3 px-1 md:px-2 text-right text-gray-700 text-xs md:text-sm w-1 whitespace-nowrap">
                          <div>{formatNumber(summary.holiday25Hours, 2, language)}h</div>
                          <div className="text-[10px] md:text-xs text-gray-500">{decimalToHHMM(summary.holiday25Hours)}</div>
                        </td>
                        <td className="py-2 md:py-3 px-1 md:px-2 text-right text-gray-700 text-xs md:text-sm w-1 whitespace-nowrap">
                          {currency}{formatNumber(summary.holiday25Amount, 2, language)}
                        </td>
                      </tr>
                    );
                    })}
                    {/* Total Hours Row */}
                    <tr className="border-t border-gray-300 bg-yellow-50">
                      <td className="py-2 md:py-3 px-1 md:px-2 font-semibold text-gray-800 text-xs md:text-sm sticky left-0 bg-yellow-50 w-1 whitespace-nowrap">
                        {language === 'fr' ? 'Total' : 'Total'}
                      </td>
                      <td className="py-2 md:py-3 px-1 md:px-2 text-right font-semibold text-gray-800 text-xs md:text-sm w-1 whitespace-nowrap">
                        <div>{formatNumber(totals.holiday25Hours, 2, language)}h</div>
                        <div className="text-[10px] md:text-xs text-gray-600">{decimalToHHMM(totals.holiday25Hours)}</div>
                      </td>
                      <td className="py-2 md:py-3 px-1 md:px-2 text-right font-semibold text-gray-800 text-xs md:text-sm w-1 whitespace-nowrap">
                        {currency}{formatNumber(totals.holiday25Amount, 2, language)}
                      </td>
                    </tr>
                    {/* TVA Row */}
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <td colSpan={2} className="py-2 md:py-3 px-1 md:px-2 text-right text-gray-600 text-xs md:text-sm whitespace-nowrap">
                        {language === 'fr' ? 'TVA (5,5%)' : 'VAT (5.5%)'}
                      </td>
                      <td className="py-2 md:py-3 px-1 md:px-2 text-right text-gray-700 text-xs md:text-sm w-1 whitespace-nowrap">
                        {currency}{formatNumber(totals.holiday25Amount * 0.055, 2, language)}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    {/* Grand Total Row */}
                    <tr className="border-t-2 border-gray-400 bg-green-50">
                      <td colSpan={2} className="py-3 md:py-4 px-1 md:px-2 text-right font-bold text-gray-900 text-sm md:text-base whitespace-nowrap">
                        {language === 'fr' ? 'TOTAL TTC' : 'TOTAL INC. VAT'}
                      </td>
                      <td className="py-3 md:py-4 px-1 md:px-2 text-right font-bold text-green-600 text-lg md:text-xl w-1 whitespace-nowrap">
                        {currency}{formatNumber(totals.holiday25Amount * 1.055, 2, language)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Holiday 100% Hours Table - Only show if there are holiday100 hours */}
          {totals.holiday100Hours > 0 && (
            <div className="mb-6 bg-white rounded-lg shadow-lg p-4 md:p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                {language === 'fr' ? 'Heures Majorées +100% HT' : 'Holiday Hours +100% (Before Tax)'} - {currency}{formatNumber(rate100, 2, language)}/h
              </h3>
              <p className="text-sm text-gray-600 mb-3">
                {language === 'fr'
                  ? '1er mai et 25 décembre uniquement'
                  : 'May 1st and December 25th only'}
              </p>

              <div className="md:hidden text-xs text-gray-500 mb-2 text-center">
                ← Swipe to see all columns →
              </div>

              <div className="overflow-x-auto">
                <table className="w-full md:min-w-[600px]">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left py-2 md:py-3 px-1 md:px-2 font-semibold text-gray-700 text-xs md:text-sm sticky left-0 bg-white z-10">
                        {t('financial.caregiver')}
                      </th>
                      <th className="text-right py-2 md:py-3 px-1 md:px-2 font-semibold text-gray-700 text-xs md:text-sm">
                        <div className="md:whitespace-nowrap">
                          <div>{language === 'fr' ? 'Heures' : 'Hours'}</div>
                        </div>
                        <div className="text-[10px] md:text-xs font-normal text-gray-500">({t('financial.decimal')} / {t('financial.timeFormat')})</div>
                      </th>
                      <th className="text-right py-2 md:py-3 px-1 md:px-2 font-semibold text-gray-700 text-xs md:text-sm">
                        <div className="md:whitespace-nowrap">
                          <div>{language === 'fr' ? 'Montant' : 'Amount'}</div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.filter(s => s.holiday100Hours > 0).map((summary, idx) => {
                      const color = getColor(summary.name, caregiverColors, allCaregiverNames);
                      return (
                        <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                          <td className="py-2 md:py-3 px-1 md:px-2 font-medium text-xs md:text-sm sticky left-0 bg-white w-1 whitespace-nowrap">
                            <span
                              className="px-2 py-1 rounded font-semibold"
                              style={{
                                color: color,
                                backgroundColor: hexToRgba(color, 0.15)
                              }}
                            >
                              {summary.name}
                            </span>
                          </td>
                        <td className="py-2 md:py-3 px-1 md:px-2 text-right text-gray-700 text-xs md:text-sm w-1 whitespace-nowrap">
                          <div>{formatNumber(summary.holiday100Hours, 2, language)}h</div>
                          <div className="text-[10px] md:text-xs text-gray-500">{decimalToHHMM(summary.holiday100Hours)}</div>
                        </td>
                        <td className="py-2 md:py-3 px-1 md:px-2 text-right text-gray-700 text-xs md:text-sm w-1 whitespace-nowrap">
                          {currency}{formatNumber(summary.holiday100Amount, 2, language)}
                        </td>
                      </tr>
                    );
                    })}
                    {/* Total Hours Row */}
                    <tr className="border-t border-gray-300 bg-red-50">
                      <td className="py-2 md:py-3 px-1 md:px-2 font-semibold text-gray-800 text-xs md:text-sm sticky left-0 bg-red-50 w-1 whitespace-nowrap">
                        {language === 'fr' ? 'Total' : 'Total'}
                      </td>
                      <td className="py-2 md:py-3 px-1 md:px-2 text-right font-semibold text-gray-800 text-xs md:text-sm w-1 whitespace-nowrap">
                        <div>{formatNumber(totals.holiday100Hours, 2, language)}h</div>
                        <div className="text-[10px] md:text-xs text-gray-600">{decimalToHHMM(totals.holiday100Hours)}</div>
                      </td>
                      <td className="py-2 md:py-3 px-1 md:px-2 text-right font-semibold text-gray-800 text-xs md:text-sm w-1 whitespace-nowrap">
                        {currency}{formatNumber(totals.holiday100Amount, 2, language)}
                      </td>
                    </tr>
                    {/* TVA Row */}
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <td colSpan={2} className="py-2 md:py-3 px-1 md:px-2 text-right text-gray-600 text-xs md:text-sm whitespace-nowrap">
                        {language === 'fr' ? 'TVA (5,5%)' : 'VAT (5.5%)'}
                      </td>
                      <td className="py-2 md:py-3 px-1 md:px-2 text-right text-gray-700 text-xs md:text-sm w-1 whitespace-nowrap">
                        {currency}{formatNumber(totals.holiday100Amount * 0.055, 2, language)}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    {/* Grand Total Row */}
                    <tr className="border-t-2 border-gray-400 bg-green-50">
                      <td colSpan={2} className="py-3 md:py-4 px-1 md:px-2 text-right font-bold text-gray-900 text-sm md:text-base whitespace-nowrap">
                        {language === 'fr' ? 'TOTAL TTC' : 'TOTAL INC. VAT'}
                      </td>
                      <td className="py-3 md:py-4 px-1 md:px-2 text-right font-bold text-green-600 text-lg md:text-xl w-1 whitespace-nowrap">
                        {currency}{formatNumber(totals.holiday100Amount * 1.055, 2, language)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Training Sessions (Binôme ADV) */}
          {trainingSummaries.length > 0 && (
            <div className="mt-6 bg-white rounded-lg shadow-lg p-4 md:p-6">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2 text-lg">
                <Clock size={20} className="text-amber-600" />
                {language === 'fr' ? 'Formation - Gratuite' : 'Training - Free'}
              </h3>

              <div className="space-y-4">
                {trainingSummaries.map((trainer, idx) => {
                  const color = getColor(trainer.name, caregiverColors, allCaregiverNames);
                  return (
                    <div key={idx}>
                      {/* Caregiver Header with Total */}
                      <div className="flex items-center justify-between mb-3 px-4 py-2 rounded-lg border-l-4"
                           style={{
                             backgroundColor: hexToRgba(color, 0.1),
                             borderColor: color
                           }}>
                        <h4 className="font-semibold" style={{ color: color }}>{trainer.name}</h4>
                        <span className="text-sm text-gray-600">
                          {formatNumber(trainer.totalHours, 2, language)}h ({decimalToHHMM(trainer.totalHours)})
                        </span>
                      </div>

                    {/* Sessions by Date */}
                    <div className="space-y-2">
                      {trainer.sessions.map((session, sessionIdx) => (
                        <div key={sessionIdx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                          {/* Mobile: Stacked layout */}
                          <div className="lg:hidden space-y-2">
                            <div className="flex items-center justify-between p-2 rounded bg-green-50">
                              <div className="flex items-center gap-2 flex-1">
                                <CheckCircle className="text-green-600" size={16} />
                                <div className="flex-1">
                                  <p className="font-medium text-gray-800 text-sm">
                                    {format(session.date, 'EEEE, MMMM d, yyyy', { locale })}
                                  </p>
                                  <div className="flex items-center gap-1 text-xs text-gray-600">
                                    <Clock size={12} />
                                    <span>{format(session.checkIn, 'HH:mm:ss')}</span>
                                  </div>
                                </div>
                              </div>
                              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-200 text-green-800">
                                In
                              </span>
                            </div>

                            <div className="flex items-center justify-between p-2 rounded bg-red-50">
                              <div className="flex items-center gap-2 flex-1">
                                <XCircle className="text-red-600" size={16} />
                                <div className="flex-1">
                                  <div className="flex items-center gap-1 text-xs text-gray-600">
                                    <Clock size={12} />
                                    <span>{format(session.checkOut, 'HH:mm:ss')}</span>
                                  </div>
                                </div>
                              </div>
                              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-200 text-red-800">
                                Out
                              </span>
                            </div>
                          </div>

                          {/* Desktop: Check-in left, Check-out right */}
                          <div className="hidden lg:grid lg:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                            {/* Left: Check-in */}
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border-l-4 border-green-500">
                              <CheckCircle className="text-green-600" size={20} />
                              <div className="flex-1">
                                <p className="font-medium text-gray-800">
                                  {format(session.date, 'EEEE, MMMM d, yyyy', { locale })}
                                </p>
                                <div className="flex items-center gap-1 text-sm text-gray-600">
                                  <Clock size={14} />
                                  <span>{format(session.checkIn, 'HH:mm:ss')}</span>
                                </div>
                              </div>
                            </div>

                            {/* Center: Duration */}
                            <div className="text-center px-4">
                              <div className="text-base font-bold text-blue-600">
                                {formatNumber(session.hours, 2, language)}h
                              </div>
                            </div>

                            {/* Right: Check-out */}
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border-l-4 border-red-500">
                              <XCircle className="text-red-600" size={20} />
                              <div className="flex-1">
                                <div className="flex items-center gap-1 text-sm text-gray-600">
                                  <Clock size={14} />
                                  <span>{format(session.checkOut, 'HH:mm:ss')}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
                })}
              </div>
            </div>
          )}

          {/* Reste à charge (Patient's share) */}
          {copayPercentage > 0 && (() => {
            const totalBeforeTax = totals.totalAmount;
            const copayBeforeTax = totalBeforeTax * copayPercentage / 100;
            const coverageBeforeTax = totalBeforeTax * (100 - copayPercentage) / 100;
            const copayVAT = copayBeforeTax * 0.055;
            const coverageVAT = coverageBeforeTax * 0.055;
            const copayWithVAT = copayBeforeTax + copayVAT;
            const coverageWithVAT = coverageBeforeTax + coverageVAT;

            return (
              <div className="mt-6 p-4 md:p-6 bg-blue-600 rounded-lg border-2 border-blue-700">
                <div className="flex flex-col gap-4">
                  {/* Header */}
                  <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3">
                    <div>
                      <h3 className="text-base md:text-lg font-semibold text-white">
                        {language === 'fr' ? 'Reste à Charge' : 'Patient\'s Share'}
                      </h3>
                      <p className="text-xs md:text-sm text-blue-100 mt-1">
                        {language === 'fr'
                          ? `Ticket Modérateur: ${formatNumber(copayPercentage, 2, language)}%`
                          : `Co-payment: ${formatNumber(copayPercentage, 2, language)}%`
                        }
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-2xl md:text-3xl font-bold text-white">
                        {currency}{formatNumber(copayWithVAT, 2, language)}
                      </p>
                      <p className="text-xs text-blue-100">
                        {language === 'fr' ? 'Avec TVA' : 'With VAT'}
                      </p>
                    </div>
                  </div>

                  {/* Breakdown Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-blue-500">
                    {/* Copay Column */}
                    <div>
                      <p className="text-xs font-semibold text-blue-100 mb-2">
                        {language === 'fr' ? 'Reste à Charge' : 'Patient\'s Share'}
                      </p>
                      <div className="space-y-1 text-xs text-white">
                        <div className="flex justify-between">
                          <span className="text-blue-200">{language === 'fr' ? 'Hors TVA:' : 'Before VAT:'}</span>
                          <span className="font-semibold">{currency}{formatNumber(copayBeforeTax, 2, language)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-200">TVA 5.5%:</span>
                          <span className="font-semibold">{currency}{formatNumber(copayVAT, 2, language)}</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-blue-500">
                          <span className="text-blue-200">{language === 'fr' ? 'Avec TVA:' : 'With VAT:'}</span>
                          <span className="font-bold">{currency}{formatNumber(copayWithVAT, 2, language)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Coverage Column */}
                    <div>
                      <p className="text-xs font-semibold text-blue-100 mb-2">
                        {language === 'fr' ? 'Prise en Charge' : 'Coverage'}
                      </p>
                      <div className="space-y-1 text-xs text-white">
                        <div className="flex justify-between">
                          <span className="text-blue-200">{language === 'fr' ? 'Hors TVA:' : 'Before VAT:'}</span>
                          <span className="font-semibold">{currency}{formatNumber(coverageBeforeTax, 2, language)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-200">TVA 5.5%:</span>
                          <span className="font-semibold">{currency}{formatNumber(coverageVAT, 2, language)}</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-blue-500">
                          <span className="text-blue-200">{language === 'fr' ? 'Avec TVA:' : 'With VAT:'}</span>
                          <span className="font-bold">{currency}{formatNumber(coverageWithVAT, 2, language)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Notes Summary */}
          {dailyNotes.length > 0 && (() => {
            // Count notes by type
            const notesByType: Record<string, number> = {};
            dailyNotes.forEach(note => {
              const type = note.note_type || 'general';
              notesByType[type] = (notesByType[type] || 0) + 1;
            });

            // Translation mapping and order
            const noteTypesOrdered = [
              { key: 'complaint', fr: 'Plainte', en: 'Complaint' },
              { key: 'no-show', fr: 'Aucune présence', en: 'No Show' },
              { key: 'late-arrival', fr: 'Arrivé en retard', en: 'Late Arrival' },
              { key: 'modification', fr: 'Modification', en: 'Modification' },
              { key: 'cancellation', fr: 'Annulation', en: 'Cancellation' },
              { key: 'general', fr: 'Général', en: 'General' },
              { key: 'special_instruction', fr: 'Instruction spéciale', en: 'Special Instruction' },
            ];

            return (
              <div className="mt-6 p-4 md:p-6 bg-orange-50 rounded-lg border-2 border-orange-200">
                <h3 className="text-base md:text-lg font-semibold text-orange-900 mb-3">
                  {language === 'fr' ? 'Résumé des Notes' : 'Notes Summary'}
                </h3>
                <p className="text-xs md:text-sm text-orange-700 mb-4">
                  {language === 'fr'
                    ? `${dailyNotes.length} note${dailyNotes.length > 1 ? 's' : ''} pour ce mois`
                    : `${dailyNotes.length} note${dailyNotes.length > 1 ? 's' : ''} for this month`
                  }
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {noteTypesOrdered
                    .filter(noteType => notesByType[noteType.key] > 0)
                    .map(noteType => {
                      const count = notesByType[noteType.key];
                      return (
                        <div key={noteType.key} className="bg-white rounded-lg p-3 border border-orange-200">
                          <div className="flex items-baseline gap-1.5 mb-2">
                            <span className="text-2xl font-bold text-orange-600">{count}</span>
                            <span className="text-xs text-gray-900">
                              {language === 'fr'
                                ? `jour${count > 1 ? 's' : ''}`
                                : `day${count > 1 ? 's' : ''}`
                              }
                            </span>
                          </div>
                          <div className="text-base font-semibold text-orange-600">
                            {language === 'fr' ? noteType.fr : noteType.en}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })()}

          <div className="mt-6 p-3 md:p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2 text-sm md:text-base">
              <Euro size={16} className="text-blue-600 md:w-5 md:h-5" />
              {t('financial.rateInfo')}
            </h3>
            <div className="grid md:grid-cols-3 gap-3 md:gap-4 text-xs md:text-sm">
              <div>
                <p className="text-gray-600">
                  {language === 'fr' ? 'Tarif Normal (HT)' : 'Regular Rate (Before VAT)'}:
                  <span className="font-semibold text-gray-800 ml-1">{currency}{formatNumber(regularRate, 2, language)}/h</span>
                </p>
                <p className="text-gray-600 mt-1">
                  {language === 'fr' ? 'Appliqué à' : 'Applied to'}: {language === 'fr' ? 'Jours de semaine avant 20h' : 'Weekdays before 8 PM'}
                </p>
              </div>
              <div>
                <p className="text-gray-600">
                  {language === 'fr' ? 'Tarif Majoré +25% (HT)' : 'Holiday Rate +25% (Before VAT)'}:
                  <span className="font-semibold text-gray-800 ml-1">{currency}{formatNumber(rate25, 2, language)}/h</span>
                </p>
                <p className="text-gray-600 mt-1">
                  {language === 'fr' ? 'Appliqué à' : 'Applied to'}: {language === 'fr' ? 'Jours fériés, dimanches, après 20h' : 'Holidays, Sundays, after 8 PM'}
                </p>
              </div>
              <div>
                <p className="text-gray-600">
                  {language === 'fr' ? 'Tarif Majoré +100% (HT)' : 'Holiday Rate +100% (Before VAT)'}:
                  <span className="font-semibold text-gray-800 ml-1">{currency}{formatNumber(rate100, 2, language)}/h</span>
                </p>
                <p className="text-gray-600 mt-1">
                  {language === 'fr' ? 'Appliqué à' : 'Applied to'}: {language === 'fr' ? '1er mai et 25 décembre' : 'May 1st and Dec 25th'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 text-[10px] md:text-xs text-gray-500">
            <p>{t('financial.verificationNote')}</p>
            <p className="mt-1">
              {language === 'fr'
                ? 'Les jours fériés français pris en compte : 1er janvier, 1er mai, 8 mai, 14 juillet, 15 août, 1er novembre, 11 novembre, 25 décembre.'
                : 'French public holidays accounted for: January 1, May 1, May 8, July 14, August 15, November 1, November 11, December 25.'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
