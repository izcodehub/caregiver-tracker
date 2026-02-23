// This file contains the new financial summary structure
// TODO: Integrate this into CaregiverBreakdown.tsx

import { formatNumber, decimalToHHMM } from '@/lib/time-utils';

type FinancialSummaryProps = {
  selectedMonth: Date;
  totalHours: number;
  regularHours: number;
  holiday25Hours: number;
  holiday100Hours: number;
  regularAmount: number;
  holiday25Amount: number;
  holiday100Amount: number;
  totalAmount: number;
  billingRate: number;        // e.g., 23.76 HT for 2026
  conventionedRate: number;    // e.g., 23.70 HT for 2026
  copayPercentage: number;     // e.g., 22.22
  apaMonthlyHours?: number;    // e.g., 47
  currency: string;
  language: 'fr' | 'en';
  caregiverBreakdown: {
    regular: { name: string; hours: number; amount: number }[];
    holiday25: { name: string; hours: number; amount: number; dates: string[] }[];
    holiday100: { name: string; hours: number; amount: number; dates: string[] }[];
  };
};

export function FinancialSummaryNew(props: FinancialSummaryProps) {
  const {
    selectedMonth,
    totalHours,
    regularHours,
    holiday25Hours,
    holiday100Hours,
    regularAmount,
    holiday25Amount,
    holiday100Amount,
    totalAmount,
    billingRate,
    conventionedRate,
    copayPercentage,
    apaMonthlyHours,
    currency,
    language,
    caregiverBreakdown
  } = props;

  // Calculate per-hour rates
  const rate25 = billingRate * 1.25;
  const rate100 = billingRate * 2.0;

  // APA coverage (constant per hour)
  const apaPerHour = conventionedRate * (1 - copayPercentage / 100);

  // Beneficiary per hour
  const rateExcess = Math.max(0, billingRate - conventionedRate);
  const benefCopay = conventionedRate * (copayPercentage / 100);
  const benefNormal = benefCopay + rateExcess;
  const benef25 = benefNormal + (billingRate * 0.25);
  const benef100 = benefNormal + (billingRate * 1.0);

  // Totals
  const totalTTC = totalAmount * 1.055;
  const totalTVA = totalAmount * 0.055;

  // APA/Beneficiary split
  const totalCalendarHours = regularHours + holiday25Hours + holiday100Hours;
  const conventionedBaseHT = totalCalendarHours * conventionedRate;
  const apaHT = conventionedBaseHT * (1 - copayPercentage / 100);
  const benefHT = totalAmount - apaHT;

  // APA allowance
  const apaAllowanceValue = apaMonthlyHours ? apaMonthlyHours * conventionedRate : undefined;
  const apaHoursRemaining = apaMonthlyHours ? apaMonthlyHours - totalHours : undefined;
  const apaValueConsumed = conventionedBaseHT;
  const apaValueRemaining = apaAllowanceValue ? apaAllowanceValue - apaValueConsumed : undefined;
  const apaUsagePercent = apaMonthlyHours ? (totalHours / apaMonthlyHours) * 100 : undefined;

  const monthName = selectedMonth.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="mt-6 space-y-6">
      {/* RATE CARD */}
      <div className="p-4 md:p-6 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border-2 border-blue-300">
        <h3 className="text-lg font-bold text-blue-900 mb-3">
          {language === 'fr' ? '📋 TARIFS APPLICABLES' : '📋 APPLICABLE RATES'}
        </h3>

        {apaMonthlyHours && (
          <div className="text-sm text-blue-800 mb-4">
            <strong>{language === 'fr' ? 'Plan d\'aide APA:' : 'APA plan:'}</strong> {apaMonthlyHours}h/{language === 'fr' ? 'mois' : 'month'} à {formatNumber(conventionedRate * 1.055, 2, language)}€ TTC/h ({formatNumber(conventionedRate, 2, language)}€ HT/h)
            <br/>
            {language === 'fr' ? 'Couverture APA:' : 'APA coverage:'} {formatNumber(100 - copayPercentage, 2, language)}% {language === 'fr' ? 'du tarif conventionné' : 'of conventioned rate'}
            <br/>
            {language === 'fr' ? 'Ticket modérateur bénéficiaire:' : 'Beneficiary copay:'} {formatNumber(copayPercentage, 2, language)}%
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs md:text-sm bg-white rounded">
            <thead>
              <tr className="border-b-2 border-blue-300 bg-blue-200">
                <th className="text-left p-2 font-semibold">{language === 'fr' ? 'Type d\'heure' : 'Hour type'}</th>
                <th className="text-right p-2 font-semibold">{language === 'fr' ? 'Vitalliance facture' : 'Company bills'}</th>
                <th className="text-right p-2 font-semibold">{language === 'fr' ? 'APA couvre¹' : 'APA covers¹'}</th>
                <th className="text-right p-2 font-semibold">{language === 'fr' ? 'Bénéficiaire paie' : 'Beneficiary pays'}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-blue-200">
                <td className="p-2">Normal</td>
                <td className="text-right p-2 font-mono">{formatNumber(billingRate, 2, language)}€</td>
                <td className="text-right p-2 font-mono">{formatNumber(apaPerHour, 2, language)}€</td>
                <td className="text-right p-2 font-mono">{formatNumber(benefNormal, 2, language)}€²</td>
              </tr>
              <tr className="border-b border-blue-200">
                <td className="p-2">{language === 'fr' ? 'Majoré +25%' : 'Premium +25%'}</td>
                <td className="text-right p-2 font-mono">{formatNumber(rate25, 2, language)}€</td>
                <td className="text-right p-2 font-mono">{formatNumber(apaPerHour, 2, language)}€</td>
                <td className="text-right p-2 font-mono">{formatNumber(benef25, 2, language)}€³</td>
              </tr>
              <tr>
                <td className="p-2">{language === 'fr' ? 'Majoré +100%' : 'Premium +100%'}</td>
                <td className="text-right p-2 font-mono">{formatNumber(rate100, 2, language)}€</td>
                <td className="text-right p-2 font-mono">{formatNumber(apaPerHour, 2, language)}€</td>
                <td className="text-right p-2 font-mono">{formatNumber(benef100, 2, language)}€⁴</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-[10px] md:text-xs text-blue-700 space-y-1">
          <div>¹ APA {language === 'fr' ? 'couvre' : 'covers'}: {formatNumber(100 - copayPercentage, 2, language)}% × {formatNumber(conventionedRate, 2, language)}€ = {formatNumber(apaPerHour, 2, language)}€/h ({language === 'fr' ? 'limite' : 'limit'}: {apaMonthlyHours}h/{language === 'fr' ? 'mois' : 'month'})</div>
          <div>² {language === 'fr' ? 'Bénéficiaire' : 'Beneficiary'}: ({formatNumber(copayPercentage, 2, language)}% × {formatNumber(conventionedRate, 2, language)}€) + {language === 'fr' ? 'hausse' : 'increase'} {formatNumber(rateExcess, 2, language)}€ = {formatNumber(benefNormal, 2, language)}€/h</div>
          <div>³ {language === 'fr' ? 'Bénéficiaire' : 'Beneficiary'}: {formatNumber(benefNormal, 2, language)}€ + {language === 'fr' ? 'majoration' : 'premium'} +25% ({formatNumber(billingRate * 0.25, 2, language)}€) = {formatNumber(benef25, 2, language)}€/h</div>
          <div>⁴ {language === 'fr' ? 'Bénéficiaire' : 'Beneficiary'}: {formatNumber(benefNormal, 2, language)}€ + {language === 'fr' ? 'majoration' : 'premium'} +100% ({formatNumber(billingRate, 2, language)}€) = {formatNumber(benef100, 2, language)}€/h</div>
        </div>
      </div>

      {/* HOUR DETAILS - Continue in next section... */}
      <div className="text-sm text-gray-500">
        [Hour details section to be implemented]
      </div>
    </div>
  );
}
