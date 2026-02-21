import { BeneficiaryRateHistory } from './supabase';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Gets the applicable rates for a beneficiary on a specific date.
 * Returns billing rate, conventioned rate, and APA monthly hours with the most recent effective_date that is <= the target date.
 *
 * @param rateHistory - Array of rate history records for the beneficiary
 * @param targetDate - The date to get the rate for (can be Date object or ISO string)
 * @param fallbackRate - Fallback rate if no history is found (default: 15)
 * @param timezone - Timezone for date comparison (default: 'Europe/Paris')
 * @returns Object with billingRate, conventionedRate, and apaMonthlyHours. If conventionedRate is not set in history, defaults to billingRate.
 */
export function getRateForDate(
  rateHistory: BeneficiaryRateHistory[],
  targetDate: Date | string,
  fallbackRate: number = 15,
  timezone: string = 'Europe/Paris'
): { billingRate: number; conventionedRate: number; apaMonthlyHours?: number } {
  // If no rate history, use fallback for both rates
  if (!rateHistory || rateHistory.length === 0) {
    return { billingRate: fallbackRate, conventionedRate: fallbackRate, apaMonthlyHours: undefined };
  }

  // Convert target date to YYYY-MM-DD string in the beneficiary's timezone
  const targetDateStr = typeof targetDate === 'string'
    ? targetDate
    : formatInTimeZone(targetDate, timezone, 'yyyy-MM-dd');

  // Filter rates where effective_date <= targetDate
  const applicableRates = rateHistory.filter(
    (r) => r.effective_date <= targetDateStr
  );

  // If no applicable rates found, use fallback
  if (applicableRates.length === 0) {
    return { billingRate: fallbackRate, conventionedRate: fallbackRate, apaMonthlyHours: undefined };
  }

  // Sort by effective_date descending and get the most recent
  const sortedRates = applicableRates.sort(
    (a, b) => b.effective_date.localeCompare(a.effective_date)
  );

  const mostRecentRate = sortedRates[0];
  return {
    billingRate: mostRecentRate.rate,
    conventionedRate: mostRecentRate.conventioned_rate ?? mostRecentRate.rate,
    apaMonthlyHours: mostRecentRate.apa_monthly_hours
  };
}

/**
 * Groups check-ins by their applicable rate.
 * This is useful for calculating totals when rates change mid-period.
 *
 * @param checkIns - Array of check-ins with dates
 * @param rateHistory - Array of rate history records
 * @param fallbackRate - Fallback rate if no history is found
 * @param timezone - Timezone for date comparison
 * @returns Map of rate -> check-ins with that rate
 */
export function groupCheckInsByRate<T extends { timestamp: string }>(
  checkIns: T[],
  rateHistory: BeneficiaryRateHistory[],
  fallbackRate: number = 15,
  timezone: string = 'Europe/Paris'
): Map<number, T[]> {
  const rateGroups = new Map<number, T[]>();

  for (const checkIn of checkIns) {
    const { billingRate } = getRateForDate(rateHistory, checkIn.timestamp, fallbackRate, timezone);

    if (!rateGroups.has(billingRate)) {
      rateGroups.set(billingRate, []);
    }
    rateGroups.get(billingRate)!.push(checkIn);
  }

  return rateGroups;
}

/**
 * Calculates the total cost for hours worked, accounting for rate changes.
 *
 * @param hours - Number of hours worked
 * @param workDate - The date the work was performed
 * @param rateHistory - Array of rate history records
 * @param fallbackRate - Fallback rate if no history is found
 * @param timezone - Timezone for date comparison
 * @returns The total cost (hours × applicable rate)
 */
export function calculateCostForDate(
  hours: number,
  workDate: Date | string,
  rateHistory: BeneficiaryRateHistory[],
  fallbackRate: number = 15,
  timezone: string = 'Europe/Paris'
): number {
  const { billingRate } = getRateForDate(rateHistory, workDate, fallbackRate, timezone);
  return hours * billingRate;
}
