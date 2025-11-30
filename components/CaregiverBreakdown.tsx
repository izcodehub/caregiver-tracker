'use client';

import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { User, Clock, Euro, CheckCircle, XCircle } from 'lucide-react';
import { decimalToHHMM, formatNumber } from '@/lib/time-utils';
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

type CaregiverSummary = {
  name: string;
  regularHours: number;
  holidayHours: number;
  totalHours: number;
  regularAmount: number;
  holidayAmount: number;
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

type CaregiverBreakdownProps = {
  checkIns: CheckInOut[];
  selectedMonth: Date;
  regularRate: number;
  holidayRate: number;
  currency: string;
  copayPercentage: number;
  caregiverColors: Map<string, string>;
};

export default function CaregiverBreakdown({
  checkIns,
  selectedMonth,
  regularRate,
  holidayRate,
  currency,
  copayPercentage,
  caregiverColors,
}: CaregiverBreakdownProps) {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? fr : enUS;

  // Get all unique caregiver names for color fallback
  const allCaregiverNames = Array.from(new Set(checkIns.map(ci => ci.caregiver_name)));

  const calculateHoursPerCaregiver = (): CaregiverSummary[] => {
    const caregiverMap = new Map<string, { regularHours: number; holidayHours: number }>();

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
          caregiverMap.set(caregiverName, { regularHours: 0, holidayHours: 0 });
        }

        const stats = caregiverMap.get(caregiverName)!;

        // Calculate holiday hours (simplified - just checking if after 8 PM or Sunday)
        // TODO: Add French holidays detection
        const dayOfWeek = start.getDay(); // 0 = Sunday
        const isSunday = dayOfWeek === 0;

        if (isSunday) {
          // All hours on Sunday are holiday
          stats.holidayHours += totalMinutes / 60;
        } else {
          // Check if shift crosses 8 PM (20:00)
          const startHour = start.getHours();
          const endHour = end.getHours();
          const endMinute = end.getMinutes();

          if (endHour >= 20 || (endHour === 19 && endMinute > 0)) {
            // Shift includes evening hours
            const eveningStart = new Date(start);
            eveningStart.setHours(20, 0, 0, 0);

            if (start < eveningStart && end > eveningStart) {
              // Shift crosses 8 PM boundary
              const regularMinutes = (eveningStart.getTime() - start.getTime()) / (1000 * 60);
              const holidayMinutes = (end.getTime() - eveningStart.getTime()) / (1000 * 60);
              stats.regularHours += regularMinutes / 60;
              stats.holidayHours += holidayMinutes / 60;
            } else if (start >= eveningStart) {
              // Entire shift is after 8 PM
              stats.holidayHours += totalMinutes / 60;
            } else {
              // Shift ends before 8 PM
              stats.regularHours += totalMinutes / 60;
            }
          } else {
            // Normal hours
            stats.regularHours += totalMinutes / 60;
          }
        }
      }
    });

    // Convert to array and calculate amounts
    const summaries: CaregiverSummary[] = [];
    caregiverMap.forEach((stats, name) => {
      const regularAmount = stats.regularHours * regularRate;
      const holidayAmount = stats.holidayHours * holidayRate;
      const totalAmount = regularAmount + holidayAmount;
      const totalHours = stats.regularHours + stats.holidayHours;

      summaries.push({
        name,
        regularHours: stats.regularHours,
        holidayHours: stats.holidayHours,
        totalHours,
        regularAmount,
        holidayAmount,
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
      holidayHours: acc.holidayHours + summary.holidayHours,
      totalHours: acc.totalHours + summary.totalHours,
      regularAmount: acc.regularAmount + summary.regularAmount,
      holidayAmount: acc.holidayAmount + summary.holidayAmount,
      totalAmount: acc.totalAmount + summary.totalAmount,
    }),
    { regularHours: 0, holidayHours: 0, totalHours: 0, regularAmount: 0, holidayAmount: 0, totalAmount: 0 }
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
              {language === 'fr' ? 'Montant Normal HT' : 'Regular Amount (Before Tax)'} - {currency}{formatNumber(regularRate, 2, language)}/h
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
                        <div>{language === 'fr' ? 'Normales' : 'Regular'}</div>
                      </div>
                      <div className="text-[10px] md:text-xs font-normal text-gray-500">({t('financial.decimal')} / {t('financial.timeFormat')})</div>
                    </th>
                    <th className="text-right py-2 md:py-3 px-1 md:px-2 font-semibold text-gray-700 text-xs md:text-sm">
                      <div className="md:whitespace-nowrap">
                        <div>{language === 'fr' ? 'Montant' : 'Amount'}</div>
                        <div>{language === 'fr' ? 'Normal' : 'Regular'}</div>
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
                      {language === 'fr' ? 'Total Heures' : 'Total Hours'}
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
                      {language === 'fr' ? 'TOTAL GÉNÉRAL' : 'GRAND TOTAL'}
                    </td>
                    <td className="py-3 md:py-4 px-1 md:px-2 text-right font-bold text-green-600 text-lg md:text-xl w-1 whitespace-nowrap">
                      {currency}{formatNumber(totals.regularAmount * 1.055, 2, language)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Holiday Hours Table - Only show if there are holiday hours */}
          {totals.holidayHours > 0 && (
            <div className="mb-6 bg-white rounded-lg shadow-lg p-4 md:p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                {language === 'fr' ? 'Montant Majoré HT' : 'Holiday Amount (Before Tax)'} - {currency}{formatNumber(holidayRate, 2, language)}/h
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
                          <div>{language === 'fr' ? 'Majorées' : 'Holiday'}</div>
                        </div>
                        <div className="text-[10px] md:text-xs font-normal text-gray-500">({t('financial.decimal')} / {t('financial.timeFormat')})</div>
                      </th>
                      <th className="text-right py-2 md:py-3 px-1 md:px-2 font-semibold text-gray-700 text-xs md:text-sm">
                        <div className="md:whitespace-nowrap">
                          <div>{language === 'fr' ? 'Montant' : 'Amount'}</div>
                          <div>{language === 'fr' ? 'Majoré' : 'Holiday'}</div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.filter(s => s.holidayHours > 0).map((summary, idx) => {
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
                          <div>{formatNumber(summary.holidayHours, 2, language)}h</div>
                          <div className="text-[10px] md:text-xs text-gray-500">{decimalToHHMM(summary.holidayHours)}</div>
                        </td>
                        <td className="py-2 md:py-3 px-1 md:px-2 text-right text-gray-700 text-xs md:text-sm w-1 whitespace-nowrap">
                          {currency}{formatNumber(summary.holidayAmount, 2, language)}
                        </td>
                      </tr>
                    );
                    })}
                    {/* Total Hours Row */}
                    <tr className="border-t border-gray-300 bg-blue-50">
                      <td className="py-2 md:py-3 px-1 md:px-2 font-semibold text-gray-800 text-xs md:text-sm sticky left-0 bg-blue-50 w-1 whitespace-nowrap">
                        {language === 'fr' ? 'Total Heures' : 'Total Hours'}
                      </td>
                      <td className="py-2 md:py-3 px-1 md:px-2 text-right font-semibold text-gray-800 text-xs md:text-sm w-1 whitespace-nowrap">
                        <div>{formatNumber(totals.holidayHours, 2, language)}h</div>
                        <div className="text-[10px] md:text-xs text-gray-600">{decimalToHHMM(totals.holidayHours)}</div>
                      </td>
                      <td className="py-2 md:py-3 px-1 md:px-2 text-right font-semibold text-gray-800 text-xs md:text-sm w-1 whitespace-nowrap">
                        {currency}{formatNumber(totals.holidayAmount, 2, language)}
                      </td>
                    </tr>
                    {/* TVA Row */}
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <td colSpan={2} className="py-2 md:py-3 px-1 md:px-2 text-right text-gray-600 text-xs md:text-sm whitespace-nowrap">
                        {language === 'fr' ? 'TVA (5,5%)' : 'VAT (5.5%)'}
                      </td>
                      <td className="py-2 md:py-3 px-1 md:px-2 text-right text-gray-700 text-xs md:text-sm w-1 whitespace-nowrap">
                        {currency}{formatNumber(totals.holidayAmount * 0.055, 2, language)}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    {/* Grand Total Row */}
                    <tr className="border-t-2 border-gray-400 bg-green-50">
                      <td colSpan={2} className="py-3 md:py-4 px-1 md:px-2 text-right font-bold text-gray-900 text-sm md:text-base whitespace-nowrap">
                        {language === 'fr' ? 'TOTAL GÉNÉRAL' : 'GRAND TOTAL'}
                      </td>
                      <td className="py-3 md:py-4 px-1 md:px-2 text-right font-bold text-green-600 text-lg md:text-xl w-1 whitespace-nowrap">
                        {currency}{formatNumber(totals.holidayAmount * 1.055, 2, language)}
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
          {copayPercentage > 0 && (
            <div className="mt-6 p-4 md:p-6 bg-blue-600 rounded-lg border-2 border-blue-700">
              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
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
                <div className="text-right">
                  <p className="text-2xl md:text-3xl font-bold text-white">
                    {currency}{formatNumber(totals.totalAmount * copayPercentage / 100, 2, language)}
                  </p>
                  <p className="text-xs md:text-sm text-blue-100 mt-1">
                    {language === 'fr'
                      ? `Assurance: ${currency}${formatNumber(totals.totalAmount * (100 - copayPercentage) / 100, 2, language)}`
                      : `Insurance: ${currency}${formatNumber(totals.totalAmount * (100 - copayPercentage) / 100, 2, language)}`
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 p-3 md:p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2 text-sm md:text-base">
              <Euro size={16} className="text-blue-600 md:w-5 md:h-5" />
              {t('financial.rateInfo')}
            </h3>
            <div className="grid md:grid-cols-2 gap-3 md:gap-4 text-xs md:text-sm">
              <div>
                <p className="text-gray-600">{t('financial.regularRate')}: <span className="font-semibold text-gray-800">{currency}{formatNumber(regularRate, 2, language)}{t('financial.perHour')}</span></p>
                <p className="text-gray-600 mt-1">{t('financial.appliedTo')}: {t('financial.weekdaysBefore8pm')}</p>
              </div>
              <div>
                <p className="text-gray-600">{t('financial.holidayRate')}: <span className="font-semibold text-gray-800">{currency}{formatNumber(holidayRate, 2, language)}{t('financial.perHour')}</span></p>
                <p className="text-gray-600 mt-1">{t('financial.appliedTo')}: {t('financial.sundaysHolidaysAfter8pm')}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 text-[10px] md:text-xs text-gray-500">
            <p>{t('financial.verificationNote')}</p>
            <p className="mt-1">{t('financial.holidayDetectionNote')}</p>
          </div>
        </>
      )}
    </div>
  );
}
