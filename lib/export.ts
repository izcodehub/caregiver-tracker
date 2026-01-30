import { format } from 'date-fns';
import { BeneficiaryRateHistory } from './supabase';
import { getRateForDate } from './rate-utils';

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

type CaregiverSummary = {
  name: string;
  regularHours: number;
  holidayHours: number;
  totalHours: number;
  regularAmount: number;
  holidayAmount: number;
  totalAmount: number;
};

function calculateCaregiverSummaries(
  checkIns: CheckInOut[],
  regularRate: number,
  holidayRate: number,
  rateHistory?: BeneficiaryRateHistory[],
  timezone: string = 'Europe/Paris'
): CaregiverSummary[] {
  const caregiverMap = new Map<string, {
    regularHours: number;
    holidayHours: number;
    regularAmount: number;
    holidayAmount: number;
  }>();

  const sorted = [...checkIns].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].action === 'check-in' && sorted[i + 1].action === 'check-out') {
      const caregiverName = sorted[i].caregiver_name;
      const start = new Date(sorted[i].timestamp);
      const end = new Date(sorted[i + 1].timestamp);
      const totalMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

      // Get the applicable rate for this check-in date
      const applicableRegularRate = rateHistory && rateHistory.length > 0
        ? getRateForDate(rateHistory, start, regularRate, timezone)
        : regularRate;
      const applicableHolidayRate = applicableRegularRate * 1.25; // Holiday rate is always 25% more

      if (!caregiverMap.has(caregiverName)) {
        caregiverMap.set(caregiverName, {
          regularHours: 0,
          holidayHours: 0,
          regularAmount: 0,
          holidayAmount: 0
        });
      }

      const stats = caregiverMap.get(caregiverName)!;
      const dayOfWeek = start.getDay();
      const isSunday = dayOfWeek === 0;

      if (isSunday) {
        const hours = totalMinutes / 60;
        stats.holidayHours += hours;
        stats.holidayAmount += hours * applicableHolidayRate;
      } else {
        const endHour = end.getHours();
        const endMinute = end.getMinutes();

        if (endHour >= 20 || (endHour === 19 && endMinute > 0)) {
          const eveningStart = new Date(start);
          eveningStart.setHours(20, 0, 0, 0);

          if (start < eveningStart && end > eveningStart) {
            const regularMinutes = (eveningStart.getTime() - start.getTime()) / (1000 * 60);
            const holidayMinutes = (end.getTime() - eveningStart.getTime()) / (1000 * 60);
            const regularHours = regularMinutes / 60;
            const holidayHours = holidayMinutes / 60;

            stats.regularHours += regularHours;
            stats.holidayHours += holidayHours;
            stats.regularAmount += regularHours * applicableRegularRate;
            stats.holidayAmount += holidayHours * applicableHolidayRate;
          } else if (start >= eveningStart) {
            const hours = totalMinutes / 60;
            stats.holidayHours += hours;
            stats.holidayAmount += hours * applicableHolidayRate;
          } else {
            const hours = totalMinutes / 60;
            stats.regularHours += hours;
            stats.regularAmount += hours * applicableRegularRate;
          }
        } else {
          const hours = totalMinutes / 60;
          stats.regularHours += hours;
          stats.regularAmount += hours * applicableRegularRate;
        }
      }
    }
  }

  const summaries: CaregiverSummary[] = [];
  caregiverMap.forEach((stats, name) => {
    const totalAmount = stats.regularAmount + stats.holidayAmount;
    const totalHours = stats.regularHours + stats.holidayHours;

    summaries.push({
      name,
      regularHours: stats.regularHours,
      holidayHours: stats.holidayHours,
      totalHours,
      regularAmount: stats.regularAmount,
      holidayAmount: stats.holidayAmount,
      totalAmount,
    });
  });

  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

export function exportFinancialSummaryToCSV(
  checkIns: CheckInOut[],
  elderlyName: string,
  selectedMonth: Date,
  regularRate: number,
  holidayRate: number,
  currency: string,
  rateHistory?: BeneficiaryRateHistory[],
  timezone: string = 'Europe/Paris'
): void {
  const summaries = calculateCaregiverSummaries(checkIns, regularRate, holidayRate, rateHistory, timezone);

  if (summaries.length === 0) {
    alert('No data to export');
    return;
  }

  const period = format(selectedMonth, 'MMMM yyyy');

  const headers = [
    'Client',
    'Period',
    'Caregiver',
    'Regular Hours',
    'Holiday Hours',
    'Total Hours',
    'Regular Rate',
    'Holiday Rate',
    'Regular Amount',
    'Holiday Amount',
    'Total'
  ];

  const rows = summaries.map(summary => [
    elderlyName,
    period,
    summary.name,
    summary.regularHours.toFixed(2),
    summary.holidayHours.toFixed(2),
    summary.totalHours.toFixed(2),
    `${currency}${regularRate.toFixed(2)}`,
    `${currency}${holidayRate.toFixed(2)}`,
    `${currency}${summary.regularAmount.toFixed(2)}`,
    `${currency}${summary.holidayAmount.toFixed(2)}`,
    `${currency}${summary.totalAmount.toFixed(2)}`,
  ]);

  // Calculate totals
  const totals = summaries.reduce(
    (acc, s) => ({
      regularHours: acc.regularHours + s.regularHours,
      holidayHours: acc.holidayHours + s.holidayHours,
      totalHours: acc.totalHours + s.totalHours,
      regularAmount: acc.regularAmount + s.regularAmount,
      holidayAmount: acc.holidayAmount + s.holidayAmount,
      totalAmount: acc.totalAmount + s.totalAmount,
    }),
    { regularHours: 0, holidayHours: 0, totalHours: 0, regularAmount: 0, holidayAmount: 0, totalAmount: 0 }
  );

  const totalRow = [
    '',
    '',
    'TOTAL',
    totals.regularHours.toFixed(2),
    totals.holidayHours.toFixed(2),
    totals.totalHours.toFixed(2),
    '',
    '',
    `${currency}${totals.regularAmount.toFixed(2)}`,
    `${currency}${totals.holidayAmount.toFixed(2)}`,
    `${currency}${totals.totalAmount.toFixed(2)}`,
  ];

  const csv = [headers, ...rows, totalRow].map(row => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `financial-summary-${elderlyName.replace(/\s+/g, '-')}-${format(selectedMonth, 'yyyy-MM')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export function exportDetailedCheckInsToCSV(
  checkIns: CheckInOut[],
  elderlyName: string,
  selectedMonth: Date
): void {
  if (!checkIns.length) {
    alert('No data to export');
    return;
  }

  const headers = ['Date', 'Time', 'Caregiver', 'Action', 'Latitude', 'Longitude'];
  const rows = checkIns.map(ci => [
    format(new Date(ci.timestamp), 'yyyy-MM-dd'),
    format(new Date(ci.timestamp), 'HH:mm:ss'),
    ci.caregiver_name,
    ci.action,
    ci.latitude?.toFixed(6) || '',
    ci.longitude?.toFixed(6) || '',
  ]);

  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `checkins-detail-${elderlyName.replace(/\s+/g, '-')}-${format(selectedMonth, 'yyyy-MM')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
