'use client';

import { format } from 'date-fns';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { fr, enUS } from 'date-fns/locale';
import { User, Clock, Euro, CheckCircle, XCircle } from 'lucide-react';
import { decimalToHHMM, formatNumber } from '@/lib/time-utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { getColor, hexToRgba } from '@/lib/caregiver-colors';
import { getHolidayMajoration } from '@/lib/holiday-rates';
import { getRateForDate } from '@/lib/rate-utils';
import { BeneficiaryRateHistory } from '@/lib/supabase';

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
  rateHistory?: BeneficiaryRateHistory[]; // Optional for backward compatibility
  conventionedRate?: number; // Tarif de référence conventionné (HT); copay% applies only up to this rate
  apaMonthlyHours?: number; // APA monthly hours allowance (plan d'aide)
  currency: string;
  copayPercentage: number;
  caregiverColors: Map<string, string>;
  dailyNotes: DailyNote[];
  timezone: string;
  beneficiaryName?: string;
};

export default function CaregiverBreakdown({
  checkIns,
  selectedMonth,
  regularRate,
  rateHistory,
  conventionedRate,
  apaMonthlyHours,
  currency,
  copayPercentage,
  caregiverColors,
  dailyNotes,
  timezone,
  beneficiaryName,
}: CaregiverBreakdownProps) {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? fr : enUS;

  // Calculate display rates for UI based on the selected month
  // Use the rate that was effective at the start of the selected month
  let displayRate: number;
  let displayConventionedRate: number;
  let displayApaMonthlyHours: number | undefined;

  if (rateHistory && rateHistory.length > 0) {
    const rateData = getRateForDate(rateHistory, selectedMonth, regularRate, timezone);
    displayRate = rateData.billingRate;
    displayConventionedRate = rateData.conventionedRate;
    displayApaMonthlyHours = rateData.apaMonthlyHours;
  } else {
    displayRate = regularRate;
    displayConventionedRate = conventionedRate ?? regularRate;
    displayApaMonthlyHours = apaMonthlyHours;
  }

  console.log('[DEBUG CaregiverBreakdown] Rates:', {
    regularRate,
    displayRate,
    displayConventionedRate,
    conventionedRateProp: conventionedRate,
    hasRateHistory: rateHistory && rateHistory.length > 0,
    rateHistoryCount: rateHistory?.length || 0,
    selectedMonth: selectedMonth.toISOString()
  });

  const rate25 = displayRate * 1.25;
  const rate100 = displayRate * 2.0;

  // Check if rates vary within the selected month (rate change mid-month)
  const startOfSelectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  const endOfSelectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
  const { billingRate: startMonthRate } = rateHistory && rateHistory.length > 0
    ? getRateForDate(rateHistory, startOfSelectedMonth, regularRate, timezone)
    : { billingRate: regularRate };
  const { billingRate: endMonthRate } = rateHistory && rateHistory.length > 0
    ? getRateForDate(rateHistory, endOfSelectedMonth, regularRate, timezone)
    : { billingRate: regularRate };
  const ratesVaryInMonth = startMonthRate !== endMonthRate;

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

        // Check for holiday majoration using beneficiary's local timezone
        const dateStr = formatInTimeZone(start, timezone, 'yyyy-MM-dd');
        const publicHolidayMajoration = getHolidayMajoration(dateStr);

        // If it's May 1st or Dec 25th (100% majoration holidays)
        if (publicHolidayMajoration === 1.0) {
          stats.holiday100Hours += totalMinutes / 60;
        }
        // If it's another public holiday or Sunday (25% majoration)
        else if (publicHolidayMajoration === 0.25) {
          stats.holiday25Hours += totalMinutes / 60;
        }
        // Otherwise, check for time-of-day rates (8 AM - 8 PM regular, before/after 25%)
        else {
          // Convert to beneficiary's local timezone for time-of-day calculations
          const startLocal = toZonedTime(start, timezone);
          const endLocal = toZonedTime(end, timezone);

          // Create 8 AM and 8 PM boundaries in beneficiary's local time
          const morningStart = new Date(startLocal);
          morningStart.setHours(8, 0, 0, 0);
          const eveningStart = new Date(startLocal);
          eveningStart.setHours(20, 0, 0, 0);

          // Calculate minutes in each time period
          let earlyMorningMinutes = 0;  // Before 8 AM local (25%)
          let regularMinutes = 0;        // 8 AM - 8 PM local (regular)
          let eveningMinutes = 0;        // After 8 PM local (25%)

          // If shift starts before 8 AM local
          if (startLocal < morningStart) {
            if (endLocal <= morningStart) {
              // Entire shift before 8 AM
              earlyMorningMinutes = totalMinutes;
            } else {
              // Shift crosses 8 AM boundary
              earlyMorningMinutes = (morningStart.getTime() - startLocal.getTime()) / (1000 * 60);

              // Check if it also crosses 8 PM
              if (endLocal > eveningStart) {
                regularMinutes = (eveningStart.getTime() - morningStart.getTime()) / (1000 * 60);
                eveningMinutes = (endLocal.getTime() - eveningStart.getTime()) / (1000 * 60);
              } else {
                regularMinutes = (endLocal.getTime() - morningStart.getTime()) / (1000 * 60);
              }
            }
          }
          // If shift starts between 8 AM and 8 PM local
          else if (startLocal >= morningStart && startLocal < eveningStart) {
            if (endLocal <= eveningStart) {
              // Entire shift in regular hours
              regularMinutes = totalMinutes;
            } else {
              // Shift crosses 8 PM boundary
              regularMinutes = (eveningStart.getTime() - startLocal.getTime()) / (1000 * 60);
              eveningMinutes = (endLocal.getTime() - eveningStart.getTime()) / (1000 * 60);
            }
          }
          // If shift starts after 8 PM local
          else {
            eveningMinutes = totalMinutes;
          }

          stats.holiday25Hours += (earlyMorningMinutes + eveningMinutes) / 60;
          stats.regularHours += regularMinutes / 60;
        }
      }
    });

    // Convert to array and calculate amounts using time-based rates
    const summaries: CaregiverSummary[] = [];
    caregiverMap.forEach((stats, name) => {
      // If no rate history, use the single regular rate (backward compatibility)
      if (!rateHistory || rateHistory.length === 0) {
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
      } else {
        // With rate history, we need to recalculate by going through check-ins again
        // to use the correct rate for each time period
        // For now, we'll use a weighted average approach by recalculating with date-specific rates
        const caregiverCheckIns = sorted.filter(ci =>
          ci.caregiver_name === name &&
          ci.action === 'check-in' &&
          !ci.is_training
        );

        let regularAmount = 0;
        let holiday25Amount = 0;
        let holiday100Amount = 0;

        caregiverCheckIns.forEach((ci) => {
          const checkOut = sorted.find(
            (co) =>
              co.action === 'check-out' &&
              co.caregiver_name === ci.caregiver_name &&
              new Date(co.timestamp).getTime() > new Date(ci.timestamp).getTime()
          );

          if (!checkOut) return;

          const start = new Date(ci.timestamp);
          const end = new Date(checkOut.timestamp);
          const totalMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

          // Get the rate that was effective on this check-in date
          const { billingRate: applicableRate } = getRateForDate(rateHistory, start, regularRate, timezone);
          const rate25 = applicableRate * 1.25;
          const rate100 = applicableRate * 2.0;

          // Determine which rate category this check-in falls into
          const dateStr = formatInTimeZone(start, timezone, 'yyyy-MM-dd');
          const publicHolidayMajoration = getHolidayMajoration(dateStr);

          if (publicHolidayMajoration === 1.0) {
            const hours = totalMinutes / 60;
            holiday100Amount += hours * rate100;
          } else if (publicHolidayMajoration === 0.25) {
            const hours = totalMinutes / 60;
            holiday25Amount += hours * rate25;
          } else {
            // Time-of-day calculation (same as before)
            const startLocal = toZonedTime(start, timezone);
            const endLocal = toZonedTime(end, timezone);
            const morningStart = new Date(startLocal);
            morningStart.setHours(8, 0, 0, 0);
            const eveningStart = new Date(startLocal);
            eveningStart.setHours(20, 0, 0, 0);

            let earlyMorningMinutes = 0;
            let regularMinutes = 0;
            let eveningMinutes = 0;

            if (startLocal < morningStart) {
              if (endLocal <= morningStart) {
                earlyMorningMinutes = totalMinutes;
              } else {
                earlyMorningMinutes = (morningStart.getTime() - startLocal.getTime()) / (1000 * 60);
                if (endLocal > eveningStart) {
                  regularMinutes = (eveningStart.getTime() - morningStart.getTime()) / (1000 * 60);
                  eveningMinutes = (endLocal.getTime() - eveningStart.getTime()) / (1000 * 60);
                } else {
                  regularMinutes = (endLocal.getTime() - morningStart.getTime()) / (1000 * 60);
                }
              }
            } else if (startLocal >= morningStart && startLocal < eveningStart) {
              if (endLocal <= eveningStart) {
                regularMinutes = totalMinutes;
              } else {
                regularMinutes = (eveningStart.getTime() - startLocal.getTime()) / (1000 * 60);
                eveningMinutes = (endLocal.getTime() - eveningStart.getTime()) / (1000 * 60);
              }
            } else {
              eveningMinutes = totalMinutes;
            }

            const regularHours = regularMinutes / 60;
            const majoredHours = (earlyMorningMinutes + eveningMinutes) / 60;
            regularAmount += regularHours * applicableRate;
            holiday25Amount += majoredHours * rate25;
          }
        });

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
      }
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
      <h2 className="text-lg md:text-xl font-semibold text-gray-800 mb-4 uppercase">
        {t('financial.title')} - {format(selectedMonth, 'MMMM yyyy', { locale })} [v2]
      </h2>

      {summaries.length === 0 ? (
        <div className="text-center py-12">
          <User className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600">{t('financial.noCaregiverData')}</p>
        </div>
      ) : (
        <>
{/* RÉSUMÉ FINANCIER */}
{copayPercentage > 0 && (() => {
  // Calculate per-hour rates for display
  const rate25 = displayRate * 1.25;
  const rate100 = displayRate * 2.0;

  // APA coverage per hour (constant regardless of majoration)
  const apaPerHour = displayConventionedRate * (1 - copayPercentage / 100);

  // Beneficiary per hour calculations
  const rateExcess = Math.max(0, displayRate - displayConventionedRate);
  const benefCopay = displayConventionedRate * (copayPercentage / 100);
  const benefNormal = benefCopay + rateExcess;
  const benef25 = benefNormal + (displayRate * 0.25);
  const benef100 = benefNormal + (displayRate * 1.0);

  // Total calculations
  const totalCalendarHours = totals.regularHours + totals.holiday25Hours + totals.holiday100Hours;
  const conventionedBaseHT = totalCalendarHours * displayConventionedRate;
  const apaHT = conventionedBaseHT * (1 - copayPercentage / 100);
  const benefHT = totals.totalAmount - apaHT;

  // Format helper
  const f = (ht: number) => ({
    ht: formatNumber(ht, 2, language),
    tva: formatNumber(ht * 0.055, 2, language),
    ttc: formatNumber(ht * 1.055, 2, language),
  });

  const totalFmt = f(totals.totalAmount);
  const apaFmt = f(apaHT);
  const benefFmt = f(benefHT);

  // APA allowance calculations
  const apaAllowanceValue = displayApaMonthlyHours ? displayApaMonthlyHours * displayConventionedRate : undefined;
  const apaHoursRemaining = displayApaMonthlyHours ? displayApaMonthlyHours - totals.totalHours : undefined;
  const apaValueConsumed = conventionedBaseHT;
  const apaValueRemaining = apaAllowanceValue ? apaAllowanceValue - apaValueConsumed : undefined;
  const apaUsagePercent = displayApaMonthlyHours ? (totals.totalHours / displayApaMonthlyHours) * 100 : undefined;

  // Group caregivers by hour type
  const caregiversByType = {
    regular: [] as { name: string; hours: number; amount: number }[],
    holiday25: [] as { name: string; hours: number; amount: number; dates: string[] }[],
    holiday100: [] as { name: string; hours: number; amount: number; dates: string[] }[],
  };

  calculateHoursPerCaregiver().forEach(cg => {
    if (cg.regularHours > 0) {
      caregiversByType.regular.push({
        name: cg.name,
        hours: cg.regularHours,
        amount: cg.regularAmount,
      });
    }
    if (cg.holiday25Hours > 0) {
      caregiversByType.holiday25.push({
        name: cg.name,
        hours: cg.holiday25Hours,
        amount: cg.holiday25Amount,
        dates: [], // TODO: extract dates from check-ins
      });
    }
    if (cg.holiday100Hours > 0) {
      caregiversByType.holiday100.push({
        name: cg.name,
        hours: cg.holiday100Hours,
        amount: cg.holiday100Amount,
        dates: [], // TODO: extract dates from check-ins
      });
    }
  });

  const monthName = format(selectedMonth, 'MMMM yyyy', { locale });

  return (
    <div className="mt-6 space-y-6">
      {/* DÉTAIL DES HEURES SECTION */}
      <div className="border-t-4 border-gray-400 pt-4">
        <h2 className="text-xl font-bold text-gray-800 uppercase mb-4">
          {language === 'fr' ? 'DÉTAIL DES HEURES' : 'HOUR DETAILS'}
        </h2>
      </div>

      {/* HOUR DETAILS TABLES - Full width */}
      <div className="space-y-4">
          {/* REGULAR HOURS - Always shown on top */}
          {caregiversByType.regular.length > 0 && (
            <div className="overflow-x-auto -mx-4 md:-mx-6 px-4 md:px-6">
              <div className="bg-teal-100 px-3 py-2 font-semibold text-gray-800 border-b-2 border-teal-200">
                {language === 'fr' ? 'HEURES NORMALES' : 'NORMAL HOURS'} - {formatNumber(displayRate, 2, language)}€ HT/h
              </div>
              <table className="w-full text-xs md:text-sm table-fixed min-w-[600px]">
                <colgroup>
                  <col className="w-auto" />
                  <col className="w-32" />
                  <col className="w-28" />
                  <col className="w-28" />
                  <col className="w-28" />
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-300 bg-teal-50 text-gray-800">
                    <th className="text-left p-2">{language === 'fr' ? 'Aide-soignant' : 'Caregiver'}</th>
                    <th className="text-right p-2">{language === 'fr' ? 'Heures' : 'Hours'}</th>
                    <th className="text-right p-2">{language === 'fr' ? 'Facturé' : 'Billed'}</th>
                    <th className="text-right p-2">APA</th>
                    <th className="text-right p-2">{language === 'fr' ? 'Bénéfic.' : 'Benef.'}</th>
                  </tr>
                </thead>
                <tbody className="text-gray-800">
                  {caregiversByType.regular.map((cg, idx) => (
                    <tr key={idx} className="border-b border-gray-200 bg-white">
                      <td className="p-2">{cg.name}</td>
                      <td className="text-right p-2 font-mono">
                        {formatNumber(cg.hours, 2, language)}h<br/>
                        <span className="text-[10px] text-gray-500">{decimalToHHMM(cg.hours)}</span>
                      </td>
                      <td className="text-right p-2 font-mono">{formatNumber(cg.amount, 2, language)}€</td>
                      <td className="text-right p-2 font-mono">{formatNumber(cg.hours * apaPerHour, 2, language)}€</td>
                      <td className="text-right p-2 font-mono">{formatNumber(cg.hours * benefNormal, 2, language)}€</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-teal-200 bg-teal-100 text-gray-800 font-semibold">
                    <td className="p-2">{language === 'fr' ? 'SOUS-TOTAL' : 'SUBTOTAL'}</td>
                    <td className="text-right p-2 font-mono">
                      {formatNumber(totals.regularHours, 2, language)}h<br/>
                      <span className="text-[10px]">{decimalToHHMM(totals.regularHours)}</span>
                    </td>
                    <td className="text-right p-2 font-mono">{formatNumber(totals.regularAmount, 2, language)}€</td>
                    <td className="text-right p-2 font-mono">{formatNumber(totals.regularHours * apaPerHour, 2, language)}€</td>
                    <td className="text-right p-2 font-mono">{formatNumber(totals.regularHours * benefNormal, 2, language)}€</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* +25% hours - only show if there are any */}
          {caregiversByType.holiday25.length > 0 && totals.holiday25Hours > 0 && (
            <div className="overflow-x-auto -mx-4 md:-mx-6 px-4 md:px-6">
              <div className="bg-teal-600 px-3 py-2 text-white border-b-2 border-teal-700 font-semibold">
                {language === 'fr' ? 'HEURES MAJORÉES +25%' : 'PREMIUM HOURS +25%'} - {formatNumber(rate25, 2, language)}€ HT/h
                <span className="text-xs font-normal ml-2">
                  ({language === 'fr' ? 'Dimanches, jours fériés, avant 8h ou après 20h' : 'Sundays, holidays, before 8 AM or after 8 PM'})
                </span>
              </div>
              <table className="w-full text-xs md:text-sm table-fixed min-w-[600px]">
                <colgroup>
                  <col className="w-auto" />
                  <col className="w-32" />
                  <col className="w-28" />
                  <col className="w-28" />
                  <col className="w-28" />
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-300 bg-teal-500 text-white">
                    <th className="text-left p-2">{language === 'fr' ? 'Aide-soignant' : 'Caregiver'}</th>
                    <th className="text-right p-2">{language === 'fr' ? 'Heures' : 'Hours'}</th>
                    <th className="text-right p-2">{language === 'fr' ? 'Facturé' : 'Billed'}</th>
                    <th className="text-right p-2">APA</th>
                    <th className="text-right p-2">{language === 'fr' ? 'Bénéfic.' : 'Benef.'}</th>
                  </tr>
                </thead>
                <tbody className="text-gray-800">
                  {caregiversByType.holiday25.map((cg, idx) => (
                    <tr key={idx} className="border-b border-gray-200 bg-white">
                      <td className="p-2 align-top">
                        {cg.name}
                        {cg.dates.length > 0 && (
                          <div className="text-[10px] text-gray-500 mt-1">
                            📅 {cg.dates.map((d, i) => <div key={i}>{d}</div>)}
                          </div>
                        )}
                      </td>
                      <td className="text-right p-2 font-mono align-top">
                        {formatNumber(cg.hours, 2, language)}h<br/>
                        <span className="text-[10px] text-gray-500">{decimalToHHMM(cg.hours)}</span>
                      </td>
                      <td className="text-right p-2 font-mono align-top">{formatNumber(cg.amount, 2, language)}€</td>
                      <td className="text-right p-2 font-mono align-top">{formatNumber(cg.hours * apaPerHour, 2, language)}€</td>
                      <td className="text-right p-2 font-mono align-top">{formatNumber(cg.hours * benef25, 2, language)}€</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-teal-700 bg-teal-600 text-white font-semibold">
                    <td className="p-2">{language === 'fr' ? 'SOUS-TOTAL' : 'SUBTOTAL'}</td>
                    <td className="text-right p-2 font-mono">
                      {formatNumber(totals.holiday25Hours, 2, language)}h<br/>
                      <span className="text-[10px]">{decimalToHHMM(totals.holiday25Hours)}</span>
                    </td>
                    <td className="text-right p-2 font-mono">{formatNumber(totals.holiday25Amount, 2, language)}€</td>
                    <td className="text-right p-2 font-mono">{formatNumber(totals.holiday25Hours * apaPerHour, 2, language)}€</td>
                    <td className="text-right p-2 font-mono">{formatNumber(totals.holiday25Hours * benef25, 2, language)}€</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* +100% hours - only show if there are any */}
          {caregiversByType.holiday100.length > 0 && totals.holiday100Hours > 0 && (
            <div className="overflow-x-auto -mx-4 md:-mx-6 px-4 md:px-6">
              <div className="bg-teal-700 px-3 py-2 text-white border-b-2 border-teal-800 font-semibold">
                {language === 'fr' ? 'HEURES MAJORÉES +100%' : 'PREMIUM HOURS +100%'} - {formatNumber(rate100, 2, language)}€ HT/h
                <span className="text-xs font-normal ml-2">
                  ({language === 'fr' ? '1er mai et 25 décembre uniquement' : 'May 1st and December 25th only'})
                </span>
              </div>
              <table className="w-full text-xs md:text-sm table-fixed min-w-[600px]">
                <colgroup>
                  <col className="w-auto" />
                  <col className="w-32" />
                  <col className="w-28" />
                  <col className="w-28" />
                  <col className="w-28" />
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-300 bg-teal-600 text-white">
                    <th className="text-left p-2">{language === 'fr' ? 'Aide-soignant' : 'Caregiver'}</th>
                    <th className="text-right p-2">{language === 'fr' ? 'Heures' : 'Hours'}</th>
                    <th className="text-right p-2">{language === 'fr' ? 'Facturé' : 'Billed'}</th>
                    <th className="text-right p-2">APA</th>
                    <th className="text-right p-2">{language === 'fr' ? 'Bénéfic.' : 'Benef.'}</th>
                  </tr>
                </thead>
                <tbody className="text-gray-800">
                  {caregiversByType.holiday100.map((cg, idx) => (
                    <tr key={idx} className="border-b border-gray-200 bg-white">
                      <td className="p-2 align-top">
                        {cg.name}
                        {cg.dates.length > 0 && (
                          <div className="text-[10px] text-gray-500 mt-1">
                            📅 {cg.dates.map((d, i) => <div key={i}>{d}</div>)}
                          </div>
                        )}
                      </td>
                      <td className="text-right p-2 font-mono align-top">
                        {formatNumber(cg.hours, 2, language)}h<br/>
                        <span className="text-[10px] text-gray-500">{decimalToHHMM(cg.hours)}</span>
                      </td>
                      <td className="text-right p-2 font-mono align-top">{formatNumber(cg.amount, 2, language)}€</td>
                      <td className="text-right p-2 font-mono align-top">{formatNumber(cg.hours * apaPerHour, 2, language)}€</td>
                      <td className="text-right p-2 font-mono align-top">{formatNumber(cg.hours * benef100, 2, language)}€</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-teal-800 bg-teal-700 text-white font-semibold">
                    <td className="p-2">{language === 'fr' ? 'SOUS-TOTAL' : 'SUBTOTAL'}</td>
                    <td className="text-right p-2 font-mono">
                      {formatNumber(totals.holiday100Hours, 2, language)}h<br/>
                      <span className="text-[10px]">{decimalToHHMM(totals.holiday100Hours)}</span>
                    </td>
                    <td className="text-right p-2 font-mono">{formatNumber(totals.holiday100Amount, 2, language)}€</td>
                    <td className="text-right p-2 font-mono">{formatNumber(totals.holiday100Hours * apaPerHour, 2, language)}€</td>
                    <td className="text-right p-2 font-mono">{formatNumber(totals.holiday100Hours * benef100, 2, language)}€</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

        {/* TOTAL TABLE */}
        <div className="mt-4 overflow-x-auto -mx-4 md:-mx-6 px-4 md:px-6">
          <table className="w-full text-xs md:text-sm table-fixed min-w-[600px]">
            <colgroup>
              <col className="w-auto" />
              <col className="w-32" />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-28" />
            </colgroup>
            <tbody>
              <tr className="border-b border-slate-300 bg-slate-200 text-gray-900 font-semibold">
                <td className="p-2">{language === 'fr' ? 'TOTAL HT' : 'TOTAL (excl. VAT)'}</td>
                <td className="text-right p-2 font-mono">{formatNumber(totals.totalHours, 2, language)}h</td>
                <td className="text-right p-2 font-mono">{totalFmt.ht}€</td>
                <td className="text-right p-2 font-mono">{apaFmt.ht}€</td>
                <td className="text-right p-2 font-mono">{benefFmt.ht}€</td>
              </tr>
              <tr className="border-b border-slate-300 bg-slate-100 text-gray-700">
                <td className="p-2">{language === 'fr' ? 'TVA (5,5%)' : 'VAT (5.5%)'}</td>
                <td className="text-right p-2 font-mono"></td>
                <td className="text-right p-2 font-mono">{totalFmt.tva}€</td>
                <td className="text-right p-2 font-mono">{apaFmt.tva}€</td>
                <td className="text-right p-2 font-mono">{benefFmt.tva}€</td>
              </tr>
              <tr className="bg-slate-600 text-white font-bold">
                <td className="p-2">{language === 'fr' ? 'TOTAL TTC' : 'TOTAL (incl. VAT)'}</td>
                <td className="text-right p-2 font-mono"></td>
                <td className="text-right p-2 font-mono">{totalFmt.ttc}€</td>
                <td className="text-right p-2 font-mono">{apaFmt.ttc}€</td>
                <td className="text-right p-2 font-mono">{benefFmt.ttc}€</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* PAYMENT BOX */}
      <div className="bg-blue-50 p-6 rounded border-2 border-blue-200 text-center">
        <p className="text-sm md:text-base font-bold text-gray-800 mb-2">
          {language === 'fr'
            ? `${beneficiaryName ? beneficiaryName.toUpperCase() : 'LE BÉNÉFICIAIRE'} DOIT PAYER POUR ${monthName.toUpperCase()}`
            : `${beneficiaryName ? beneficiaryName.toUpperCase() : 'BENEFICIARY'} MUST PAY FOR ${monthName.toUpperCase()}`}
        </p>
        <p className="text-3xl md:text-4xl font-bold text-gray-800">
          {benefFmt.ttc}€
        </p>
      </div>

      {/* TRACKING SECTION */}
      <div className="border-t-4 border-gray-400 pt-4">
        <h3 className="text-lg font-bold text-gray-800 mb-4">
          {language === 'fr' ? 'SUIVI' : 'TRACKING'}
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* TARIFS APPLICABLES - Left */}
          <div>
            <div className="bg-slate-50 p-4 md:p-6 rounded space-y-2 text-sm md:text-base border-2 border-slate-200 h-full">
              <h3 className="text-base md:text-lg font-semibold text-slate-800 mb-3">
                {language === 'fr'
                  ? `TARIFS HORAIRE HT ${format(selectedMonth, 'MMMM yyyy', { locale }).toUpperCase()}`
                  : `HOURLY RATES (excl. VAT) ${format(selectedMonth, 'MMMM yyyy', { locale }).toUpperCase()}`}
                {ratesVaryInMonth && (
                  <span className="text-xs font-normal text-amber-700 ml-2">
                    ⚠ {language === 'fr' ? 'Variables ce mois' : 'Variable this month'}
                  </span>
                )}
              </h3>
              <table className="w-full text-xs md:text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-600 bg-slate-600 text-white">
                    <th className="text-left p-2">{language === 'fr' ? 'Type d\'heure' : 'Hour type'}</th>
                    <th className="text-right p-2">{language === 'fr' ? 'Vitalliance facture' : 'Company bills'}</th>
                    <th className="text-right p-2">{language === 'fr' ? 'APA couvre' : 'APA covers'}</th>
                    <th className="text-right p-2">{language === 'fr' ? 'Bénéficiaire paie' : 'Beneficiary pays'}</th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  <tr className="border-b border-slate-300 bg-white">
                    <td className="p-2">
                      <div className="font-medium">{language === 'fr' ? 'Normal' : 'Normal'}</div>
                      <div className="text-[10px] text-slate-600">{language === 'fr' ? 'Jours de semaine 8h-20h' : 'Weekdays 8am-8pm'}</div>
                    </td>
                    <td className="text-right p-2 font-mono">{formatNumber(displayRate, 2, language)}€</td>
                    <td className="text-right p-2 font-mono">{formatNumber(apaPerHour, 2, language)}€</td>
                    <td className="text-right p-2 font-mono">{formatNumber(benefNormal, 2, language)}€</td>
                  </tr>
                  <tr className="border-b border-slate-300 bg-slate-50">
                    <td className="p-2">
                      <div className="font-medium">{language === 'fr' ? 'Majoré +25%' : 'Premium +25%'}</div>
                      <div className="text-[10px] text-slate-600">{language === 'fr' ? 'Jours fériés, dimanches, avant 8h ou après 20h' : 'Holidays, Sundays, before 8am or after 8pm'}</div>
                    </td>
                    <td className="text-right p-2 font-mono">{formatNumber(rate25, 2, language)}€</td>
                    <td className="text-right p-2 font-mono">{formatNumber(apaPerHour, 2, language)}€</td>
                    <td className="text-right p-2 font-mono">
                      <div>{formatNumber(benef25, 2, language)}€</div>
                      <div className="text-[10px] text-slate-500">({formatNumber(benefNormal, 2, language)} + {formatNumber(displayRate * 0.25, 2, language)})</div>
                    </td>
                  </tr>
                  <tr className="border-b border-slate-300 bg-white">
                    <td className="p-2">
                      <div className="font-medium">{language === 'fr' ? 'Majoré +100%' : 'Premium +100%'}</div>
                      <div className="text-[10px] text-slate-600">{language === 'fr' ? '1er mai et 25 décembre' : 'May 1st and December 25th'}</div>
                    </td>
                    <td className="text-right p-2 font-mono">{formatNumber(rate100, 2, language)}€</td>
                    <td className="text-right p-2 font-mono">{formatNumber(apaPerHour, 2, language)}€</td>
                    <td className="text-right p-2 font-mono">
                      <div>{formatNumber(benef100, 2, language)}€</div>
                      <div className="text-[10px] text-slate-500">({formatNumber(benefNormal, 2, language)} + {formatNumber(displayRate, 2, language)})</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Right column - APA and NOTES stacked */}
          <div className="space-y-6">
            {/* APA ALLOWANCE */}
            {displayApaMonthlyHours && (
              <div>
              <div className="bg-slate-50 p-4 md:p-6 rounded space-y-3 text-sm md:text-base border-2 border-slate-200 text-slate-800 h-full">
                <h3 className="text-base md:text-lg font-semibold text-slate-800 mb-3">
                  {language === 'fr' ? 'UTILISATION MENSUELLE DU PLAN D\'AIDE APA' : 'MONTHLY APA ALLOWANCE USAGE'}
                </h3>
                <div className="flex justify-between items-center">
                  <span className="font-semibold">{language === 'fr' ? 'Heures utilisées:' : 'Hours used:'}</span>
                  <span className="font-mono text-lg">
                    {formatNumber(totals.totalHours, 2, language)}h / {formatNumber(displayApaMonthlyHours, 2, language)}h
                    {apaUsagePercent && <span className="text-sm text-slate-600 ml-2">({formatNumber(apaUsagePercent, 1, language)}%)</span>}
                  </span>
                </div>

                {apaHoursRemaining !== undefined && (
                  <div className="flex justify-between text-sm">
                    <span>{language === 'fr' ? 'Heures restantes:' : 'Remaining hours:'}</span>
                    <span className="font-mono">{formatNumber(apaHoursRemaining, 2, language)}h <span className="text-slate-500">({language === 'fr' ? 'non reportables au mois suivant' : 'not rollover to next month'})</span></span>
                  </div>
                )}

                <div className="border-t border-slate-300 pt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{language === 'fr' ? 'Tarif référence:' : 'Reference rate:'}</span>
                    <span className="font-mono">{formatNumber(displayConventionedRate * 1.055, 2, language)}€ TTC/h ({formatNumber(displayConventionedRate, 2, language)}€ HT/h)</span>
                  </div>
                  {apaAllowanceValue && (
                    <div className="flex justify-between text-sm">
                      <span>{language === 'fr' ? 'Valeur du plan:' : 'Plan value:'}</span>
                      <span className="font-mono">{formatNumber(apaAllowanceValue * 1.055, 2, language)}€ TTC ({formatNumber(apaAllowanceValue, 2, language)}€ HT)</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span>{language === 'fr' ? 'Consommé¹:' : 'Consumed¹:'}</span>
                    <span className="font-mono">{formatNumber(apaValueConsumed * 1.055, 2, language)}€ TTC ({formatNumber(apaValueConsumed, 2, language)}€ HT)</span>
                  </div>
                  {apaValueRemaining !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span>{language === 'fr' ? 'Non consommé:' : 'Not consumed:'}</span>
                      <span className="font-mono">{formatNumber(apaValueRemaining * 1.055, 2, language)}€ TTC ({formatNumber(apaValueRemaining, 2, language)}€ HT)</span>
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-slate-600 border-t border-slate-200 pt-2">
                  ¹ {language === 'fr' ? 'Basé sur' : 'Based on'} {formatNumber(totals.totalHours, 2, language)}h × {formatNumber(displayConventionedRate, 2, language)}€ HT ({language === 'fr' ? 'tarif conventionné' : 'conventioned rate'})
                </div>
              </div>
            </div>
          )}

          {/* NOTES SUMMARY - Compact single line */}
          <div>
          {dailyNotes.length > 0 && (() => {
            // Count notes by type
            const notesByType: Record<string, number> = {};
            dailyNotes.forEach(note => {
              const type = note.note_type || 'general';
              notesByType[type] = (notesByType[type] || 0) + 1;
            });

            // Translation mapping and order with colors
            const noteTypesOrdered = [
              { key: 'complaint', fr: 'Plainte', en: 'Complaint', color: 'bg-red-600' },
              { key: 'no-show', fr: 'Aucune présence', en: 'No Show', color: 'bg-orange-600' },
              { key: 'late-arrival', fr: 'Arrivé en retard', en: 'Late Arrival', color: 'bg-pink-600' },
              { key: 'cancellation', fr: 'Annulation', en: 'Cancellation', color: 'bg-purple-600' },
              { key: 'modification', fr: 'Modification', en: 'Modification', color: 'bg-blue-600' },
              { key: 'special_instruction', fr: 'Instruction spéciale', en: 'Special Instruction', color: 'bg-green-600' },
              { key: 'general', fr: 'Général', en: 'General', color: 'bg-gray-600' },
            ];

            return (
              <div className="p-4 bg-slate-50 rounded-lg border-2 border-slate-200 h-full flex items-center">
                <div className="w-full">
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">
                    {language === 'fr' ? 'NOTES' : 'NOTES'}
                  </h3>
                  <div className="flex flex-wrap gap-2 items-center text-xs">
                    {noteTypesOrdered
                      .filter(noteType => notesByType[noteType.key] > 0)
                      .map((noteType, idx) => {
                        const count = notesByType[noteType.key];
                        return (
                          <span key={noteType.key} className="inline-flex items-center gap-1">
                            <span className="font-semibold text-slate-700">{language === 'fr' ? noteType.fr : noteType.en}:</span>
                            <span className={`${noteType.color} text-white px-2 py-0.5 rounded-full font-bold`}>{count}</span>
                          </span>
                        );
                      })}
                  </div>
                </div>
              </div>
            );
          })()}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
})()}
        </>
      )}
    </div>
  );
}
