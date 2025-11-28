'use client';

import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { User, Clock, Euro } from 'lucide-react';
import { decimalToHHMM, formatNumber } from '@/lib/time-utils';
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

type CaregiverSummary = {
  name: string;
  regularHours: number;
  holidayHours: number;
  totalHours: number;
  regularAmount: number;
  holidayAmount: number;
  totalAmount: number;
};

type CaregiverBreakdownProps = {
  checkIns: CheckInOut[];
  selectedMonth: Date;
  regularRate: number;
  holidayRate: number;
  currency: string;
};

export default function CaregiverBreakdown({
  checkIns,
  selectedMonth,
  regularRate,
  holidayRate,
  currency,
}: CaregiverBreakdownProps) {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? fr : enUS;

  const calculateHoursPerCaregiver = (): CaregiverSummary[] => {
    const caregiverMap = new Map<string, { regularHours: number; holidayHours: number }>();

    // Group check-ins by caregiver
    const sorted = [...checkIns].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Calculate hours for each check-in/check-out pair
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].action === 'check-in' && sorted[i + 1].action === 'check-out') {
        const caregiverName = sorted[i].caregiver_name;
        const start = new Date(sorted[i].timestamp);
        const end = new Date(sorted[i + 1].timestamp);
        const totalMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

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
    }

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

  const summaries = calculateHoursPerCaregiver();
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
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">
        {t('financial.title')} - {format(selectedMonth, 'MMMM yyyy', { locale })}
      </h2>

      {summaries.length === 0 ? (
        <div className="text-center py-12">
          <User className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600">{t('financial.noCaregiverData')}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left py-3 px-2 font-semibold text-gray-700">{t('financial.caregiver')}</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-700">
                    {t('financial.regularHours')}
                    <div className="text-xs font-normal text-gray-500">({t('financial.decimal')} / {t('financial.timeFormat')})</div>
                  </th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-700">
                    {t('financial.holidayHours')}
                    <div className="text-xs font-normal text-gray-500">({t('financial.decimal')} / {t('financial.timeFormat')})</div>
                  </th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-700">
                    {t('financial.totalHours')}
                    <div className="text-xs font-normal text-gray-500">({t('financial.decimal')} / {t('financial.timeFormat')})</div>
                  </th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-700">{t('financial.regularAmount')}</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-700">{t('financial.holidayAmount')}</th>
                  <th className="text-right py-3 px-2 font-semibold text-gray-700">{t('financial.totalAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((summary, idx) => (
                  <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="py-3 px-2 font-medium text-gray-800">{summary.name}</td>
                    <td className="py-3 px-2 text-right text-gray-700">
                      <div>{formatNumber(summary.regularHours, 2, language)}h</div>
                      <div className="text-xs text-gray-500">{decimalToHHMM(summary.regularHours)}</div>
                    </td>
                    <td className="py-3 px-2 text-right text-gray-700">
                      <div>{formatNumber(summary.holidayHours, 2, language)}h</div>
                      <div className="text-xs text-gray-500">{decimalToHHMM(summary.holidayHours)}</div>
                    </td>
                    <td className="py-3 px-2 text-right font-semibold text-gray-800">
                      <div>{formatNumber(summary.totalHours, 2, language)}h</div>
                      <div className="text-xs text-gray-600">{decimalToHHMM(summary.totalHours)}</div>
                    </td>
                    <td className="py-3 px-2 text-right text-gray-700">
                      {currency}{formatNumber(summary.regularAmount, 2, language)}
                    </td>
                    <td className="py-3 px-2 text-right text-gray-700">
                      {currency}{formatNumber(summary.holidayAmount, 2, language)}
                    </td>
                    <td className="py-3 px-2 text-right font-semibold text-gray-800">
                      {currency}{formatNumber(summary.totalAmount, 2, language)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50">
                  <td className="py-3 px-2 font-bold text-gray-900">{t('financial.total')}</td>
                  <td className="py-3 px-2 text-right font-bold text-gray-900">
                    <div>{formatNumber(totals.regularHours, 2, language)}h</div>
                    <div className="text-xs font-semibold text-gray-600">{decimalToHHMM(totals.regularHours)}</div>
                  </td>
                  <td className="py-3 px-2 text-right font-bold text-gray-900">
                    <div>{formatNumber(totals.holidayHours, 2, language)}h</div>
                    <div className="text-xs font-semibold text-gray-600">{decimalToHHMM(totals.holidayHours)}</div>
                  </td>
                  <td className="py-3 px-2 text-right font-bold text-gray-900">
                    <div>{formatNumber(totals.totalHours, 2, language)}h</div>
                    <div className="text-xs font-semibold text-gray-600">{decimalToHHMM(totals.totalHours)}</div>
                  </td>
                  <td className="py-3 px-2 text-right font-bold text-gray-900">
                    {currency}{formatNumber(totals.regularAmount, 2, language)}
                  </td>
                  <td className="py-3 px-2 text-right font-bold text-gray-900">
                    {currency}{formatNumber(totals.holidayAmount, 2, language)}
                  </td>
                  <td className="py-3 px-2 text-right font-bold text-blue-600 text-lg">
                    {currency}{formatNumber(totals.totalAmount, 2, language)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
              <Euro size={20} className="text-blue-600" />
              {t('financial.rateInfo')}
            </h3>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
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

          <div className="mt-4 text-xs text-gray-500">
            <p>{t('financial.verificationNote')}</p>
            <p className="mt-1">{t('financial.holidayDetectionNote')}</p>
          </div>
        </>
      )}
    </div>
  );
}
