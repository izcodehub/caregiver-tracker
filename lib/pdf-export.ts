import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { getHolidayMajoration, isPublicHoliday } from './holiday-rates';
import { getRateForDate } from './rate-utils';
import { BeneficiaryRateHistory } from './supabase';

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
  reason: string;
};

export function exportFinancialSummaryToPDF(
  checkIns: CheckInOut[],
  beneficiaryName: string,
  selectedMonth: Date,
  regularRate: number,
  currency: string,
  copayPercentage: number,
  dailyNotes: DailyNote[],
  language: 'fr' | 'en' = 'fr',
  timezone: string = 'Europe/Paris',
  rateHistory?: BeneficiaryRateHistory[],
  conventionedRate?: number,
  apaMonthlyHours?: number
) {
  const doc = new jsPDF();

  // Get rate information
  const { billingRate: displayRate, conventionedRate: displayConventionedRate, apaMonthlyHours: displayApaMonthlyHours } =
    rateHistory && rateHistory.length > 0
      ? getRateForDate(rateHistory, selectedMonth, regularRate, timezone)
      : { billingRate: regularRate, conventionedRate: conventionedRate ?? regularRate, apaMonthlyHours: apaMonthlyHours };

  const rate25 = displayRate * 1.25;
  const rate100 = displayRate * 2.0;
  const effectiveConventionedRate = displayConventionedRate;
  const rateExcess = displayRate - effectiveConventionedRate;

  // APA calculations
  const apaPercentage = 100 - copayPercentage;
  const apaPerHour = effectiveConventionedRate * (apaPercentage / 100);
  const benefNormal = (effectiveConventionedRate * (copayPercentage / 100)) + rateExcess;
  const benef25 = benefNormal + (displayRate * 0.25);
  const benef100 = benefNormal + displayRate;

  // Main title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  const monthName = format(selectedMonth, 'MMMM yyyy', { locale: language === 'fr' ? fr : enUS });
  doc.text(
    `${language === 'fr' ? 'Résumé Financier' : 'Financial Summary'} - ${monthName}`,
    105,
    15,
    { align: 'center' }
  );

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(beneficiaryName, 105, 23, { align: 'center' });

  let yPos = 35;

  // Calculate totals
  const { totals, caregiversByType } = calculateTotals(checkIns, regularRate, timezone, rateHistory);

  const totalAmount = totals.normalAmount + totals.holiday25Amount + totals.holiday100Amount;
  const vatAmount = totalAmount * 0.055;
  const totalWithVAT = totalAmount + vatAmount;

  const apaAmount = (totals.normalHours + totals.holiday25Hours + totals.holiday100Hours) * apaPerHour;
  const apaVAT = apaAmount * 0.055;
  const apaWithVAT = apaAmount + apaVAT;

  const beneficiaryAmount = totalAmount - apaAmount;
  const beneficiaryVAT = beneficiaryAmount * 0.055;
  const beneficiaryWithVAT = beneficiaryAmount + beneficiaryVAT;

  // ========== DÉTAIL DES HEURES ==========
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(language === 'fr' ? 'DÉTAIL DES HEURES' : 'HOUR DETAILS', 14, yPos);
  yPos += 7;

  // HEURES NORMALES table
  if (caregiversByType.normal.length > 0) {
    const normalData = caregiversByType.normal.map(c => [
      c.name,
      `${c.hours.toFixed(2)}h`,
      `${c.amount.toFixed(2)}€`,
      `${(c.hours * apaPerHour).toFixed(2)}€`,
      `${(c.hours * benefNormal).toFixed(2)}€`
    ]);

    // Add subtotal row
    normalData.push([
      language === 'fr' ? 'SOUS-TOTAL' : 'SUBTOTAL',
      `${totals.normalHours.toFixed(2)}h`,
      `${totals.normalAmount.toFixed(2)}€`,
      `${(totals.normalHours * apaPerHour).toFixed(2)}€`,
      `${(totals.normalHours * benefNormal).toFixed(2)}€`
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [[
        `${language === 'fr' ? 'HEURES NORMALES' : 'NORMAL HOURS'} - ${displayRate.toFixed(2)}€ HT/h`,
        language === 'fr' ? 'Heures' : 'Hours',
        language === 'fr' ? 'Facturation' : 'Billing',
        'APA',
        language === 'fr' ? 'Bénéficiaire' : 'Beneficiary'
      ]],
      body: normalData,
      headStyles: { fillColor: [204, 251, 241], textColor: [31, 41, 55], fontSize: 7, fontStyle: 'bold' }, // teal-100 with gray-800 text
      bodyStyles: { fontSize: 7, textColor: [31, 41, 55] },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 28, halign: 'right' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 28, halign: 'right' }
      },
      margin: { left: 14, right: 14 },
      tableWidth: 182,
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.row.index === normalData.length - 1) {
          // Subtotal row - same color as header
          data.cell.styles.fillColor = [204, 251, 241]; // teal-100
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [31, 41, 55]; // gray-800
        }
      }
    });
    yPos = (doc as any).lastAutoTable.finalY + 4;
  }

  // HEURES MAJORÉES +25% table
  if (caregiversByType.holiday25.length > 0) {
    const holiday25Data = caregiversByType.holiday25.map(c => [
      c.name,
      `${c.hours.toFixed(2)}h`,
      `${c.amount.toFixed(2)}€`,
      `${(c.hours * apaPerHour).toFixed(2)}€`,
      `${(c.hours * benef25).toFixed(2)}€`
    ]);

    // Add subtotal row
    holiday25Data.push([
      language === 'fr' ? 'SOUS-TOTAL' : 'SUBTOTAL',
      `${totals.holiday25Hours.toFixed(2)}h`,
      `${totals.holiday25Amount.toFixed(2)}€`,
      `${(totals.holiday25Hours * apaPerHour).toFixed(2)}€`,
      `${(totals.holiday25Hours * benef25).toFixed(2)}€`
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [[
        `${language === 'fr' ? 'HEURES MAJORÉES +25%' : 'PREMIUM HOURS +25%'} - ${rate25.toFixed(2)}€ HT/h`,
        language === 'fr' ? 'Heures' : 'Hours',
        language === 'fr' ? 'Facturation' : 'Billing',
        'APA',
        language === 'fr' ? 'Bénéficiaire' : 'Beneficiary'
      ]],
      body: holiday25Data,
      headStyles: { fillColor: [8, 145, 178], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' }, // teal-600
      bodyStyles: { fontSize: 7, textColor: [31, 41, 55] }, // gray-800 text for caregiver rows
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 28, halign: 'right' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 28, halign: 'right' }
      },
      margin: { left: 14, right: 14 },
      tableWidth: 182,
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.row.index === holiday25Data.length - 1) {
          // Subtotal row - same color as header
          data.cell.styles.fillColor = [8, 145, 178]; // teal-600
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [255, 255, 255];
        }
      }
    });
    yPos = (doc as any).lastAutoTable.finalY + 4;
  }

  // HEURES MAJORÉES +100% table
  if (caregiversByType.holiday100.length > 0) {
    const holiday100Data = caregiversByType.holiday100.map(c => [
      c.name,
      `${c.hours.toFixed(2)}h`,
      `${c.amount.toFixed(2)}€`,
      `${(c.hours * apaPerHour).toFixed(2)}€`,
      `${(c.hours * benef100).toFixed(2)}€`
    ]);

    // Add subtotal row
    holiday100Data.push([
      language === 'fr' ? 'SOUS-TOTAL' : 'SUBTOTAL',
      `${totals.holiday100Hours.toFixed(2)}h`,
      `${totals.holiday100Amount.toFixed(2)}€`,
      `${(totals.holiday100Hours * apaPerHour).toFixed(2)}€`,
      `${(totals.holiday100Hours * benef100).toFixed(2)}€`
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [[
        `${language === 'fr' ? 'HEURES MAJORÉES +100%' : 'PREMIUM HOURS +100%'} - ${rate100.toFixed(2)}€ HT/h`,
        language === 'fr' ? 'Heures' : 'Hours',
        language === 'fr' ? 'Facturation' : 'Billing',
        'APA',
        language === 'fr' ? 'Bénéficiaire' : 'Beneficiary'
      ]],
      body: holiday100Data,
      headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold' }, // teal-700
      bodyStyles: { fontSize: 7, textColor: [31, 41, 55] }, // gray-800 text for caregiver rows
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 28, halign: 'right' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 28, halign: 'right' }
      },
      margin: { left: 14, right: 14 },
      tableWidth: 182,
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.row.index === holiday100Data.length - 1) {
          // Subtotal row - same color as header
          data.cell.styles.fillColor = [15, 118, 110]; // teal-700
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [255, 255, 255];
        }
      }
    });
    yPos = (doc as any).lastAutoTable.finalY + 4;
  }

  // TOTAL table
  const totalData = [
    [
      language === 'fr' ? 'TOTAL HT' : 'TOTAL (excl. VAT)',
      `${totals.totalHours.toFixed(2)}h`,
      `${totalAmount.toFixed(2)}€`,
      `${apaAmount.toFixed(2)}€`,
      `${beneficiaryAmount.toFixed(2)}€`
    ],
    [
      language === 'fr' ? 'TVA (5,5%)' : 'VAT (5.5%)',
      '',
      `${vatAmount.toFixed(2)}€`,
      `${apaVAT.toFixed(2)}€`,
      `${beneficiaryVAT.toFixed(2)}€`
    ],
    [
      language === 'fr' ? 'TOTAL TTC' : 'TOTAL (incl. VAT)',
      '',
      `${totalWithVAT.toFixed(2)}€`,
      `${apaWithVAT.toFixed(2)}€`,
      `${beneficiaryWithVAT.toFixed(2)}€`
    ]
  ];

  autoTable(doc, {
    startY: yPos,
    body: totalData,
    bodyStyles: { fontSize: 7, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 28, halign: 'right' },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' }
    },
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    didParseCell: (data: any) => {
      if (data.section !== 'body') return;

      if (data.row.index === 0) {
        // TOTAL HT row
        data.cell.styles.fillColor = [226, 232, 240]; // slate-200
        data.cell.styles.textColor = [15, 23, 42]; // slate-900
      } else if (data.row.index === 1) {
        // TVA row
        data.cell.styles.fillColor = [241, 245, 249]; // slate-100
        data.cell.styles.textColor = [51, 65, 85]; // slate-700
      } else if (data.row.index === 2) {
        // TOTAL TTC row
        data.cell.styles.fillColor = [71, 85, 105]; // slate-600
        data.cell.styles.textColor = [255, 255, 255];
      }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + 8;

  // Highlighted payment section - bigger with light blue background
  doc.setFillColor(239, 246, 255); // blue-50
  doc.rect(14, yPos - 2, 182, 18, 'F');
  doc.setDrawColor(191, 219, 254); // blue-200
  doc.setLineWidth(1);
  doc.rect(14, yPos - 2, 182, 18, 'S');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0); // black
  const paymentText = language === 'fr'
    ? `${beneficiaryName.toUpperCase()} DOIT PAYER POUR ${monthName.toUpperCase()}`
    : `${beneficiaryName.toUpperCase()} MUST PAY FOR ${monthName.toUpperCase()}`;
  doc.text(
    paymentText,
    105,
    yPos + 4,
    { align: 'center' }
  );
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0); // black
  // Euro symbol AFTER the number
  doc.text(`${beneficiaryWithVAT.toFixed(2)}€`, 105, yPos + 12, { align: 'center' });

  doc.setTextColor(0, 0, 0); // reset to black
  doc.setLineWidth(0.1); // reset line width
  yPos += 24;

  // TARIFS APPLICABLES table
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const tarifMonthYear = format(selectedMonth, 'MMMM yyyy', { locale: language === 'fr' ? fr : enUS });
  doc.text(
    language === 'fr' ? `TARIFS HORAIRE HT ${tarifMonthYear.toUpperCase()}` : `HOURLY RATES (excl. VAT) ${tarifMonthYear.toUpperCase()}`,
    14,
    yPos
  );
  yPos += 5;

  const tarifData = [
    [
      language === 'fr' ? 'Normal\nJours de semaine 8h-20h' : 'Normal\nWeekdays 8am-8pm',
      `${displayRate.toFixed(2)}€`,
      `${apaPerHour.toFixed(2)}€`,
      `${benefNormal.toFixed(2)}€`
    ],
    [
      language === 'fr' ? 'Majoré +25%\nJours fériés, dimanches,\navant 8h ou après 20h' : 'Premium +25%\nHolidays, Sundays,\nbefore 8am or after 8pm',
      `${rate25.toFixed(2)}€`,
      `${apaPerHour.toFixed(2)}€`,
      `${benef25.toFixed(2)}€\n(${benefNormal.toFixed(2)} + ${(displayRate * 0.25).toFixed(2)})`
    ],
    [
      language === 'fr' ? 'Majoré +100%\n1er mai et 25 décembre' : 'Premium +100%\nMay 1st and Dec 25th',
      `${rate100.toFixed(2)}€`,
      `${apaPerHour.toFixed(2)}€`,
      `${benef100.toFixed(2)}€\n(${benefNormal.toFixed(2)} + ${displayRate.toFixed(2)})`
    ]
  ];

  autoTable(doc, {
    startY: yPos,
    head: [[
      language === 'fr' ? 'Type d\'heure' : 'Hour type',
      language === 'fr' ? 'Vitalliance\nfacture' : 'Company\nbills',
      language === 'fr' ? 'APA\ncouvre' : 'APA\ncovers',
      language === 'fr' ? 'Bénéficiaire\npaie' : 'Beneficiary\npays'
    ]],
    body: tarifData,
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' }, // slate-600
    bodyStyles: { fontSize: 8, textColor: [51, 65, 85] }, // slate-800
    columnStyles: {
      0: { cellWidth: 75 },
      1: { cellWidth: 37, halign: 'right' },
      2: { cellWidth: 37, halign: 'right' },
      3: { cellWidth: 37, halign: 'right' }
    },
    margin: { left: 14, right: 14 },
    theme: 'striped',
    alternateRowStyles: { fillColor: [248, 250, 252] } // slate-50
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // APA USAGE
  if (displayApaMonthlyHours) {
    const apaUsagePercent = (totals.totalHours / displayApaMonthlyHours) * 100;
    const apaHoursRemaining = displayApaMonthlyHours - totals.totalHours;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(language === 'fr' ? 'UTILISATION MENSUELLE DU PLAN D\'AIDE APA' : 'MONTHLY APA ALLOWANCE USAGE', 14, yPos);
    yPos += 6;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`${language === 'fr' ? 'Heures utilisées:' : 'Hours used:'}`, 14, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(`${totals.totalHours.toFixed(2)}h / ${displayApaMonthlyHours.toFixed(2)}h (${apaUsagePercent.toFixed(1)}%)`, 196, yPos, { align: 'right' });
    yPos += 5;

    doc.setFont('helvetica', 'normal');
    doc.text(`${language === 'fr' ? 'Heures restantes:' : 'Remaining hours:'}`, 14, yPos);
    doc.text(`${apaHoursRemaining.toFixed(2)}h`, 196, yPos, { align: 'right' });
    yPos += 6;

    // Complete APA details
    const tarifReferenceTTC = effectiveConventionedRate * 1.055;
    const tarifReferenceHT = effectiveConventionedRate;
    const valeurPlanTTC = displayApaMonthlyHours * tarifReferenceTTC;
    const valeurPlanHT = displayApaMonthlyHours * tarifReferenceHT;
    const consommeHT = totals.totalHours * tarifReferenceHT;
    const consommeTTC = consommeHT * 1.055;
    const nonConsommeHT = valeurPlanHT - consommeHT;
    const nonConsommeTTC = nonConsommeHT * 1.055;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${language === 'fr' ? 'Tarif référence:' : 'Reference rate:'}`, 14, yPos);
    doc.text(`${tarifReferenceTTC.toFixed(2)}€ TTC/h (${tarifReferenceHT.toFixed(2)}€ HT/h)`, 196, yPos, { align: 'right' });
    yPos += 4;

    doc.text(`${language === 'fr' ? 'Valeur du plan:' : 'Plan value:'}`, 14, yPos);
    doc.text(`${valeurPlanTTC.toFixed(2)}€ TTC (${valeurPlanHT.toFixed(2)}€ HT)`, 196, yPos, { align: 'right' });
    yPos += 4;

    doc.text(`${language === 'fr' ? 'Consommé¹:' : 'Consumed¹:'}`, 14, yPos);
    doc.text(`${consommeTTC.toFixed(2)}€ TTC (${consommeHT.toFixed(2)}€ HT)`, 196, yPos, { align: 'right' });
    yPos += 4;

    doc.text(`${language === 'fr' ? 'Non consommé:' : 'Not consumed:'}`, 14, yPos);
    doc.text(`${nonConsommeTTC.toFixed(2)}€ TTC (${nonConsommeHT.toFixed(2)}€ HT)`, 196, yPos, { align: 'right' });
    yPos += 5;

    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.text(
      language === 'fr'
        ? `¹ Basé sur ${totals.totalHours.toFixed(2)}h × ${tarifReferenceHT.toFixed(2)}€ HT (tarif conventionné)`
        : `¹ Based on ${totals.totalHours.toFixed(2)}h × ${tarifReferenceHT.toFixed(2)}€ excl. VAT (conventioned rate)`,
      14,
      yPos
    );
    yPos += 8;
  }

  // NOTES SUMMARY
  if (dailyNotes.length > 0) {
    const notesByType: Record<string, number> = {};
    dailyNotes.forEach(note => {
      const type = note.note_type || 'general';
      notesByType[type] = (notesByType[type] || 0) + 1;
    });

    const noteTypesOrdered = [
      { key: 'complaint', fr: 'Plainte', en: 'Complaint' },
      { key: 'no-show', fr: 'Aucune présence', en: 'No Show' },
      { key: 'late-arrival', fr: 'Arrivé en retard', en: 'Late Arrival' },
      { key: 'modification', fr: 'Modification', en: 'Modification' },
      { key: 'cancellation', fr: 'Annulation', en: 'Cancellation' },
      { key: 'general', fr: 'Général', en: 'General' },
      { key: 'special_instruction', fr: 'Instruction spéciale', en: 'Special Instruction' },
    ];

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTES', 14, yPos);
    yPos += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');

    noteTypesOrdered
      .filter(noteType => notesByType[noteType.key] > 0)
      .forEach(noteType => {
        const count = notesByType[noteType.key];
        doc.text(
          `${language === 'fr' ? noteType.fr : noteType.en}: ${count} jour${count > 1 ? 's' : ''}`,
          14,
          yPos
        );
        yPos += 4;
      });
  }

  // Save PDF
  const fileName = `financial-summary-${beneficiaryName.replace(/\s+/g, '-')}-${format(selectedMonth, 'yyyy-MM')}.pdf`;
  doc.save(fileName);
}

// Helper function to calculate totals
function calculateTotals(checkIns: CheckInOut[], regularRate: number, timezone: string, rateHistory?: BeneficiaryRateHistory[]) {
  const caregiverNormalStats: Record<string, { hours: number; amount: number }> = {};
  const caregiver25HolidayStats: Record<string, { hours: number; amount: number }> = {};
  const caregiver100HolidayStats: Record<string, { hours: number; amount: number }> = {};

  const grouped = groupCheckInsByDate(checkIns, timezone);

  Object.entries(grouped).forEach(([date, dayCheckIns]) => {
    const pairs = pairCheckInOuts(dayCheckIns);

    pairs.forEach(pair => {
      if (pair.checkOut && !pair.checkIn.is_training) {
        const start = new Date(pair.checkIn.timestamp);
        const end = new Date(pair.checkOut.timestamp);
        const totalMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
        const name = pair.checkIn.caregiver_name;

        const { billingRate: applicableRegularRate } = rateHistory && rateHistory.length > 0
          ? getRateForDate(rateHistory, start, regularRate, timezone)
          : { billingRate: regularRate };
        const applicableRate25 = applicableRegularRate * 1.25;
        const applicableRate100 = applicableRegularRate * 2.0;

        const majoration = getHolidayMajoration(date);

        if (majoration === 1.0) {
          if (!caregiver100HolidayStats[name]) {
            caregiver100HolidayStats[name] = { hours: 0, amount: 0 };
          }
          const hours = totalMinutes / 60;
          caregiver100HolidayStats[name].hours += hours;
          caregiver100HolidayStats[name].amount += hours * applicableRate100;
        } else if (majoration === 0.25) {
          if (!caregiver25HolidayStats[name]) {
            caregiver25HolidayStats[name] = { hours: 0, amount: 0 };
          }
          const hours = totalMinutes / 60;
          caregiver25HolidayStats[name].hours += hours;
          caregiver25HolidayStats[name].amount += hours * applicableRate25;
        } else {
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
          const majoredMinutes = earlyMorningMinutes + eveningMinutes;
          const majoredHours = majoredMinutes / 60;

          if (regularMinutes > 0) {
            if (!caregiverNormalStats[name]) {
              caregiverNormalStats[name] = { hours: 0, amount: 0 };
            }
            caregiverNormalStats[name].hours += regularHours;
            caregiverNormalStats[name].amount += regularHours * applicableRegularRate;
          }

          if (majoredMinutes > 0) {
            if (!caregiver25HolidayStats[name]) {
              caregiver25HolidayStats[name] = { hours: 0, amount: 0 };
            }
            caregiver25HolidayStats[name].hours += majoredHours;
            caregiver25HolidayStats[name].amount += majoredHours * applicableRate25;
          }
        }
      }
    });
  });

  const totalNormalHours = Object.values(caregiverNormalStats).reduce((sum, stats) => sum + stats.hours, 0);
  const totalNormalAmount = Object.values(caregiverNormalStats).reduce((sum, stats) => sum + stats.amount, 0);
  const total25HolidayHours = Object.values(caregiver25HolidayStats).reduce((sum, stats) => sum + stats.hours, 0);
  const total25HolidayAmount = Object.values(caregiver25HolidayStats).reduce((sum, stats) => sum + stats.amount, 0);
  const total100HolidayHours = Object.values(caregiver100HolidayStats).reduce((sum, stats) => sum + stats.hours, 0);
  const total100HolidayAmount = Object.values(caregiver100HolidayStats).reduce((sum, stats) => sum + stats.amount, 0);

  return {
    totals: {
      normalHours: totalNormalHours,
      normalAmount: totalNormalAmount,
      holiday25Hours: total25HolidayHours,
      holiday25Amount: total25HolidayAmount,
      holiday100Hours: total100HolidayHours,
      holiday100Amount: total100HolidayAmount,
      totalHours: totalNormalHours + total25HolidayHours + total100HolidayHours
    },
    caregiversByType: {
      normal: Object.entries(caregiverNormalStats).map(([name, stats]) => ({ name, ...stats })),
      holiday25: Object.entries(caregiver25HolidayStats).map(([name, stats]) => ({ name, ...stats })),
      holiday100: Object.entries(caregiver100HolidayStats).map(([name, stats]) => ({ name, ...stats }))
    }
  };
}

function groupCheckInsByDate(checkIns: CheckInOut[], timezone: string = 'Europe/Paris'): Record<string, CheckInOut[]> {
  const grouped: Record<string, CheckInOut[]> = {};

  checkIns.forEach(checkIn => {
    const date = formatInTimeZone(new Date(checkIn.timestamp), timezone, 'yyyy-MM-dd');
    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(checkIn);
  });

  return grouped;
}

function pairCheckInOuts(checkIns: CheckInOut[]): Array<{ checkIn: CheckInOut; checkOut?: CheckInOut }> {
  const sorted = [...checkIns].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const pairs: Array<{ checkIn: CheckInOut; checkOut?: CheckInOut }> = [];
  const processed = new Set<string>();

  sorted.forEach(ci => {
    if (processed.has(ci.id)) return;

    if (ci.action === 'check-in') {
      const checkOut = sorted.find(
        co =>
          !processed.has(co.id) &&
          co.action === 'check-out' &&
          co.caregiver_name === ci.caregiver_name &&
          new Date(co.timestamp).getTime() > new Date(ci.timestamp).getTime()
      );

      pairs.push({ checkIn: ci, checkOut });
      processed.add(ci.id);
      if (checkOut) processed.add(checkOut.id);
    }
  });

  return pairs;
}

export function exportDetailedCheckInsToPDF(
  checkIns: CheckInOut[],
  beneficiaryName: string,
  selectedMonth: Date,
  language: 'fr' | 'en' = 'fr',
  dailyNotes?: DailyNote[],
  regularRate?: number,
  currency?: string,
  copayPercentage?: number,
  timezone: string = 'Europe/Paris',
  rateHistory?: BeneficiaryRateHistory[],
  conventionedRate?: number  // Tarif de référence conventionné (HT); copay% applies only up to this
) {
  // Get conventioned rate from rate history based on selected month
  // This overrides the conventionedRate parameter if rate history is available
  const { conventionedRate: historicalConventionedRate2 } = rateHistory && rateHistory.length > 0 && regularRate
    ? getRateForDate(rateHistory, selectedMonth, regularRate, timezone)
    : { conventionedRate: conventionedRate };
  const effectiveConventionedRate2 = historicalConventionedRate2 !== regularRate
    ? historicalConventionedRate2
    : conventionedRate;  // Use historical rate, or fall back to prop if no difference

  const doc = new jsPDF();

  // Title
  doc.setFontSize(18);
  doc.text(
    language === 'fr' ? 'Historique des Pointages' : 'Check-In History',
    14,
    20
  );

  // Beneficiary and Month
  doc.setFontSize(12);
  doc.text(`${beneficiaryName}`, 14, 30);
  doc.text(
    format(selectedMonth, 'MMMM yyyy', { locale: language === 'fr' ? fr : enUS }),
    14,
    37
  );

  // Calculate total hours
  const grouped = groupCheckInsByDate(checkIns, timezone);
  let totalHours = 0;
  Object.values(grouped).forEach(dayCheckIns => {
    const pairs = pairCheckInOuts(dayCheckIns);
    pairs.forEach(pair => {
      if (pair.checkOut && !pair.checkIn.is_training) {
        const hours = (new Date(pair.checkOut.timestamp).getTime() - new Date(pair.checkIn.timestamp).getTime()) / (1000 * 60 * 60);
        totalHours += hours;
      }
    });
  });

  // Display total hours
  doc.setFontSize(10);
  const hours = Math.floor(totalHours);
  const minutes = Math.round((totalHours - hours) * 60);
  doc.text(
    `${language === 'fr' ? 'Total' : 'Total'}: ${hours}h${minutes.toString().padStart(2, '0')} (${totalHours.toFixed(2)}h)`,
    14,
    45
  );

  // Collect all dates from check-ins and notes
  const allDates = new Set<string>();
  Object.keys(grouped).forEach(date => allDates.add(date));
  if (dailyNotes) {
    dailyNotes.forEach(note => allDates.add(note.date));
  }

  const tableData: any[] = [];

  // Sort dates ascending (oldest first)
  Array.from(allDates)
    .sort((a, b) => a.localeCompare(b))
    .forEach(dateStr => {
      const dayCheckIns = grouped[dateStr] || [];
      const dayNote = dailyNotes?.find(note => note.date === dateStr);
      const pairs = pairCheckInOuts(dayCheckIns);

      // Add date row
      tableData.push([
        { content: format(new Date(dateStr + 'T12:00:00'), 'EEEE, MMMM d, yyyy', { locale: language === 'fr' ? fr : enUS }), colSpan: 4, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }
      ]);

      // Add note if exists
      if (dayNote) {
        tableData.push([
          { content: `${language === 'fr' ? 'Note' : 'Note'}: ${dayNote.reason}`, colSpan: 4, styles: { fillColor: [255, 237, 213], textColor: [194, 65, 12] } }
        ]);
      }

      // Add check-ins/outs
      if (pairs.length > 0) {
        pairs.forEach(pair => {
          const checkInTime = formatInTimeZone(new Date(pair.checkIn.timestamp), timezone, 'HH:mm:ss');
          const checkOutTime = pair.checkOut ? formatInTimeZone(new Date(pair.checkOut.timestamp), timezone, 'HH:mm:ss') : '-';
          const hours = pair.checkOut
            ? ((new Date(pair.checkOut.timestamp).getTime() - new Date(pair.checkIn.timestamp).getTime()) / (1000 * 60 * 60)).toFixed(2)
            : '-';

          tableData.push([
            pair.checkIn.caregiver_name,
            checkInTime,
            checkOutTime,
            hours === '-' ? '-' : `${hours}h`
          ]);
        });
      } else if (!dayNote) {
        // No check-ins and no note
        tableData.push([
          { content: language === 'fr' ? 'Aucun pointage' : 'No check-ins', colSpan: 4, styles: { textColor: [156, 163, 175], fontStyle: 'italic' } }
        ]);
      }
    });

  autoTable(doc, {
    startY: 53,
    head: [[
      language === 'fr' ? 'Aide-soignant' : 'Caregiver',
      language === 'fr' ? 'Arrivée' : 'Check-In',
      language === 'fr' ? 'Départ' : 'Check-Out',
      language === 'fr' ? 'Heures' : 'Hours'
    ]],
    body: tableData,
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 37, halign: 'center' },
      2: { cellWidth: 37, halign: 'center' },
      3: { cellWidth: 38, halign: 'right' }
    },
    margin: { left: 14, right: 14 },
  });

  // Add financial summary at the end if provided
  if (regularRate && currency !== undefined && copayPercentage !== undefined && dailyNotes) {
    const summaryY = (doc as any).lastAutoTable.finalY + 15;

    // Check if we need a new page
    if (summaryY > 250) {
      doc.addPage();
      addFinancialSummaryToPage(doc, 20, checkIns, regularRate, currency, copayPercentage, dailyNotes, language, timezone, rateHistory, effectiveConventionedRate2);
    } else {
      addFinancialSummaryToPage(doc, summaryY, checkIns, regularRate, currency, copayPercentage, dailyNotes, language, timezone, rateHistory, effectiveConventionedRate2);
    }
  }

  // Save PDF
  const fileName = `check-in-history-${beneficiaryName.replace(/\s+/g, '-')}-${format(selectedMonth, 'yyyy-MM')}.pdf`;
  doc.save(fileName);
}

// Helper functions
function getNoteTypeLabel(type: string, language: 'fr' | 'en'): string {
  const labels: Record<string, { fr: string; en: string }> = {
    'complaint': { fr: 'Plainte', en: 'Complaint' },
    'no-show': { fr: 'Aucune présence', en: 'No Show' },
    'late-arrival': { fr: 'Arrivé en retard', en: 'Late Arrival' },
    'modification': { fr: 'Modification', en: 'Modification' },
    'cancellation': { fr: 'Annulation', en: 'Cancellation' },
    'general': { fr: 'Général', en: 'General' },
    'special_instruction': { fr: 'Instruction spéciale', en: 'Special Instruction' },
  };

  return labels[type]?.[language] || type;
}

function addFinancialSummaryToPage(
  doc: jsPDF,
  startY: number,
  checkIns: CheckInOut[],
  regularRate: number,
  currency: string,
  copayPercentage: number,
  dailyNotes: DailyNote[],
  language: 'fr' | 'en',
  timezone: string = 'Europe/Paris',
  rateHistory?: BeneficiaryRateHistory[],
  conventionedRate?: number  // Tarif de référence conventionné (HT)
) {
  // Title
  doc.setFontSize(14);
  doc.text(language === 'fr' ? 'Résumé Financier' : 'Financial Summary', 14, startY);

  // Header info
  doc.setFontSize(8);
  const rate25 = regularRate * 1.25;
  const rate100 = regularRate * 2.0;
  const rateNote = rateHistory && rateHistory.length > 0
    ? (language === 'fr' ? ' (Les tarifs peuvent varier selon la date)' : ' (Rates may vary by date)')
    : '';
  doc.text(`${language === 'fr' ? 'Tarif Normal (Hors TVA)' : 'Regular Rate (Before VAT)'}: ${regularRate.toFixed(2)} ${currency}/h - ${language === 'fr' ? 'Appliqué à: Jours de semaine 8h-20h' : 'Applied to: Weekdays 8 AM - 8 PM'}`, 14, startY + 6);
  doc.text(`${language === 'fr' ? 'Tarif Majoré +25% (Hors TVA)' : 'Holiday Rate +25% (Before VAT)'}: ${rate25.toFixed(2)} ${currency}/h - ${language === 'fr' ? 'Appliqué à: Jours fériés, dimanches, avant 8h ou après 20h' : 'Applied to: Holidays, Sundays, before 8 AM or after 8 PM'}`, 14, startY + 10);
  doc.text(`${language === 'fr' ? 'Tarif Majoré +100% (Hors TVA)' : 'Holiday Rate +100% (Before VAT)'}: ${rate100.toFixed(2)} ${currency}/h - ${language === 'fr' ? 'Appliqué à: 1er mai et 25 décembre' : 'Applied to: May 1st and Dec 25th'}`, 14, startY + 14);
  const convRateNote2 = conventionedRate !== undefined
    ? (language === 'fr'
        ? ` | Tarif conv.: ${conventionedRate.toFixed(2)} HT / ${(conventionedRate * 1.055).toFixed(2)} TTC/h`
        : ` | Conv. rate: ${conventionedRate.toFixed(2)} / ${(conventionedRate * 1.055).toFixed(2)} TTC/h`)
    : '';
  doc.text(`${language === 'fr' ? 'Ticket Modérateur' : 'Co-payment'}: ${copayPercentage}%${convRateNote2}`, 14, startY + 18);

  const grouped = groupCheckInsByDate(checkIns, timezone);

  // Calculate totals by caregiver - separate regular, 25% majoration, and 100% majoration
  const caregiverRegularStats: Record<string, { hours: number; amount: number }> = {};
  const caregiver25HolidayStats: Record<string, { hours: number; amount: number }> = {};
  const caregiver100HolidayStats: Record<string, { hours: number; amount: number }> = {};
  const caregiverTrainingStats: Record<string, number> = {};

  Object.entries(grouped).forEach(([date, dayCheckIns]) => {
    const pairs = pairCheckInOuts(dayCheckIns);

    pairs.forEach(pair => {
      if (pair.checkOut) {
        const start = new Date(pair.checkIn.timestamp);
        const end = new Date(pair.checkOut.timestamp);
        const totalMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
        const name = pair.checkIn.caregiver_name;

        // Get the applicable rate for this check-in date
        const { billingRate: applicableRegularRate } = rateHistory && rateHistory.length > 0
          ? getRateForDate(rateHistory, start, regularRate, timezone)
          : { billingRate: regularRate };
        const applicableRate25 = applicableRegularRate * 1.25;
        const applicableRate100 = applicableRegularRate * 2.0;

        if (pair.checkIn.is_training) {
          caregiverTrainingStats[name] = (caregiverTrainingStats[name] || 0) + (totalMinutes / 60);
        } else {
          const majoration = getHolidayMajoration(date);

          if (majoration === 1.0) {
            // 100% majoration (May 1st, Dec 25th) - all hours
            if (!caregiver100HolidayStats[name]) {
              caregiver100HolidayStats[name] = { hours: 0, amount: 0 };
            }
            const hours = totalMinutes / 60;
            caregiver100HolidayStats[name].hours += hours;
            caregiver100HolidayStats[name].amount += hours * applicableRate100;
          } else if (majoration === 0.25) {
            // 25% majoration (holidays/Sundays) - all hours
            if (!caregiver25HolidayStats[name]) {
              caregiver25HolidayStats[name] = { hours: 0, amount: 0 };
            }
            const hours = totalMinutes / 60;
            caregiver25HolidayStats[name].hours += hours;
            caregiver25HolidayStats[name].amount += hours * applicableRate25;
          } else {
            // Regular weekday - split by time of day (8 AM - 8 PM regular, before/after 25%)
            // Convert to beneficiary's local timezone for time-of-day calculations
            const startLocal = toZonedTime(start, timezone);
            const endLocal = toZonedTime(end, timezone);

            // Create 8 AM and 8 PM boundaries in beneficiary's local time
            const morningStart = new Date(startLocal);
            morningStart.setHours(8, 0, 0, 0);
            const eveningStart = new Date(startLocal);
            eveningStart.setHours(20, 0, 0, 0);

            let earlyMorningMinutes = 0;  // Before 8 AM local (25%)
            let regularMinutes = 0;        // 8 AM - 8 PM local (regular)
            let eveningMinutes = 0;        // After 8 PM local (25%)

            // If shift starts before 8 AM local
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
            }
            // If shift starts between 8 AM and 8 PM local
            else if (startLocal >= morningStart && startLocal < eveningStart) {
              if (endLocal <= eveningStart) {
                regularMinutes = totalMinutes;
              } else {
                regularMinutes = (eveningStart.getTime() - startLocal.getTime()) / (1000 * 60);
                eveningMinutes = (endLocal.getTime() - eveningStart.getTime()) / (1000 * 60);
              }
            }
            // If shift starts after 8 PM local
            else {
              eveningMinutes = totalMinutes;
            }

            // Add regular hours
            const regularHours = regularMinutes / 60;
            const majoredMinutes = earlyMorningMinutes + eveningMinutes;
            const majoredHours = majoredMinutes / 60;

            if (regularMinutes > 0) {
              if (!caregiverRegularStats[name]) {
                caregiverRegularStats[name] = { hours: 0, amount: 0 };
              }
              caregiverRegularStats[name].hours += regularHours;
              caregiverRegularStats[name].amount += regularHours * applicableRegularRate;
            }

            // Add early morning and evening hours to 25% majoration
            if (majoredMinutes > 0) {
              if (!caregiver25HolidayStats[name]) {
                caregiver25HolidayStats[name] = { hours: 0, amount: 0 };
              }
              caregiver25HolidayStats[name].hours += majoredHours;
              caregiver25HolidayStats[name].amount += majoredHours * applicableRate25;
            }
          }
        }
      }
    });
  });

  let currentY = startY + 24;

  // Regular hours table
  if (Object.keys(caregiverRegularStats).length > 0) {
    const regularTableData = Object.entries(caregiverRegularStats).map(([name, stats]) => [
      name,
      stats.hours.toFixed(2),
      `${regularRate.toFixed(2)} ${currency}`,
      `${stats.amount.toFixed(2)} ${currency}`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [[
        language === 'fr' ? 'Heures Normales' : 'Regular Hours',
        language === 'fr' ? 'Heures' : 'Hours',
        language === 'fr' ? 'Tarif' : 'Rate',
        language === 'fr' ? 'Montant' : 'Amount'
      ]],
      body: regularTableData,
      headStyles: { fillColor: [59, 130, 246], fontSize: 8 },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 32, halign: 'right' },
        2: { cellWidth: 40, halign: 'right' },
        3: { cellWidth: 40, halign: 'right' }
      },
      margin: { left: 14, right: 14 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 3;
  }

  // 25% Holiday hours table
  if (Object.keys(caregiver25HolidayStats).length > 0) {
    const holiday25TableData = Object.entries(caregiver25HolidayStats).map(([name, stats]) => [
      name,
      stats.hours.toFixed(2),
      `${rate25.toFixed(2)} ${currency}`,
      `${stats.amount.toFixed(2)} ${currency}`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [[
        language === 'fr' ? 'Heures Fériées (+25%)' : 'Holiday Hours (+25%)',
        language === 'fr' ? 'Heures' : 'Hours',
        language === 'fr' ? 'Tarif' : 'Rate',
        language === 'fr' ? 'Montant' : 'Amount'
      ]],
      body: holiday25TableData,
      headStyles: { fillColor: [234, 179, 8], fontSize: 8 },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 32, halign: 'right' },
        2: { cellWidth: 40, halign: 'right' },
        3: { cellWidth: 40, halign: 'right' }
      },
      margin: { left: 14, right: 14 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 3;
  }

  // 100% Holiday hours table
  if (Object.keys(caregiver100HolidayStats).length > 0) {
    const holiday100TableData = Object.entries(caregiver100HolidayStats).map(([name, stats]) => [
      name,
      stats.hours.toFixed(2),
      `${rate100.toFixed(2)} ${currency}`,
      `${stats.amount.toFixed(2)} ${currency}`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [[
        language === 'fr' ? 'Heures Fériées (+100%)' : 'Holiday Hours (+100%)',
        language === 'fr' ? 'Heures' : 'Hours',
        language === 'fr' ? 'Tarif' : 'Rate',
        language === 'fr' ? 'Montant' : 'Amount'
      ]],
      body: holiday100TableData,
      headStyles: { fillColor: [220, 38, 38], fontSize: 8 },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 32, halign: 'right' },
        2: { cellWidth: 40, halign: 'right' },
        3: { cellWidth: 40, halign: 'right' }
      },
      margin: { left: 14, right: 14 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 3;
  }

  // Training hours table
  if (Object.keys(caregiverTrainingStats).length > 0) {
    const trainingTableData = Object.entries(caregiverTrainingStats).map(([name, hours]) => [
      name,
      hours.toFixed(2)
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [[
        language === 'fr' ? 'Heures Formation' : 'Training Hours',
        language === 'fr' ? 'Heures' : 'Hours'
      ]],
      body: trainingTableData,
      headStyles: { fillColor: [251, 146, 60], fontSize: 8 },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 112, halign: 'right' }
      },
      margin: { left: 14, right: 14 },
    });
    currentY = (doc as any).lastAutoTable.finalY + 3;
  }

  // Calculate totals
  const totalRegularHours = Object.values(caregiverRegularStats).reduce((sum, stats) => sum + stats.hours, 0);
  const totalRegularAmount = Object.values(caregiverRegularStats).reduce((sum, stats) => sum + stats.amount, 0);
  const total25HolidayHours = Object.values(caregiver25HolidayStats).reduce((sum, stats) => sum + stats.hours, 0);
  const total25HolidayAmount = Object.values(caregiver25HolidayStats).reduce((sum, stats) => sum + stats.amount, 0);
  const total100HolidayHours = Object.values(caregiver100HolidayStats).reduce((sum, stats) => sum + stats.hours, 0);
  const total100HolidayAmount = Object.values(caregiver100HolidayStats).reduce((sum, stats) => sum + stats.amount, 0);
  const totalTrainingHours = Object.values(caregiverTrainingStats).reduce((sum, hours) => sum + hours, 0);
  const totalAmount = totalRegularAmount + total25HolidayAmount + total100HolidayAmount;
  const vatAmount = totalAmount * 0.055;
  const totalWithVAT = totalAmount + vatAmount;

  // Calculate VAT for each hour-type row
  const regularVAT = totalRegularAmount * 0.055;
  const regularWithVAT = totalRegularAmount + regularVAT;
  const holiday25VAT = total25HolidayAmount * 0.055;
  const holiday25WithVAT = total25HolidayAmount + holiday25VAT;
  const holiday100VAT = total100HolidayAmount * 0.055;
  const holiday100WithVAT = total100HolidayAmount + holiday100VAT;

  // Copay calculation (simplified):
  // – Base conventionnée = total calendar hours × conventioned_rate (flat, no multipliers)
  // – Insurance (prise en charge) = base × (1 - copay%)
  // – Ticket modérateur = base × copay%
  // – Dépassements = total_billed − base  (rate increase + all holiday/after-hours majoration)
  // – Reste à charge = ticket modérateur + dépassements
  const totalCalendarHours2 = totalRegularHours + total25HolidayHours + total100HolidayHours;
  const conventionedBaseHT2 = conventionedRate !== undefined
    ? totalCalendarHours2 * conventionedRate
    : totalAmount;
  const excessHT2 = Math.max(0, totalAmount - conventionedBaseHT2);
  const hasExcess2 = conventionedRate !== undefined && excessHT2 > 0.005;

  const insuranceAmount2 = conventionedBaseHT2 * (1 - copayPercentage / 100);
  const insuranceVAT2 = insuranceAmount2 * 0.055;
  const insuranceWithVAT2 = insuranceAmount2 + insuranceVAT2;

  const copayAmount2 = conventionedBaseHT2 * (copayPercentage / 100);
  const copayVAT2 = copayAmount2 * 0.055;
  const copayWithVAT2 = copayAmount2 + copayVAT2;

  const excessVAT2 = excessHT2 * 0.055;
  const excessWithVAT2 = excessHT2 + excessVAT2;

  const beneficiaryAmount2 = copayAmount2 + excessHT2;
  const beneficiaryVAT2 = beneficiaryAmount2 * 0.055;
  const beneficiaryWithVAT2 = beneficiaryAmount2 + beneficiaryVAT2;

  // Financial summary with VAT
  const summaryRows: string[][] = [
    [language === 'fr' ? 'Heures Normales' : 'Regular Hours', `${totalRegularHours.toFixed(2)}h - ${totalRegularAmount.toFixed(2)} ${currency}`, `${regularVAT.toFixed(2)} ${currency}`, `${regularWithVAT.toFixed(2)} ${currency}`],
    [language === 'fr' ? 'Heures Fériées (+25%)' : 'Holiday Hours (+25%)', `${total25HolidayHours.toFixed(2)}h - ${total25HolidayAmount.toFixed(2)} ${currency}`, `${holiday25VAT.toFixed(2)} ${currency}`, `${holiday25WithVAT.toFixed(2)} ${currency}`],
    [language === 'fr' ? 'Heures Fériées (+100%)' : 'Holiday Hours (+100%)', `${total100HolidayHours.toFixed(2)}h - ${total100HolidayAmount.toFixed(2)} ${currency}`, `${holiday100VAT.toFixed(2)} ${currency}`, `${holiday100WithVAT.toFixed(2)} ${currency}`],
    [language === 'fr' ? 'Heures Formation' : 'Training Hours', `${totalTrainingHours.toFixed(2)}h`, '', '-'],
  ];
  summaryRows.push([language === 'fr' ? 'Total facturé' : 'Total billed', `${totalAmount.toFixed(2)} ${currency}`, `${vatAmount.toFixed(2)} ${currency}`, `${totalWithVAT.toFixed(2)} ${currency}`]);
  summaryRows.push([
    language === 'fr' ? `Prise en charge (${(100 - copayPercentage).toFixed(2)}%)` : `Coverage (${(100 - copayPercentage).toFixed(2)}%)`,
    `${insuranceAmount2.toFixed(2)} ${currency}`, `${insuranceVAT2.toFixed(2)} ${currency}`, `${insuranceWithVAT2.toFixed(2)} ${currency}`]);
  const beneficiaryRowIndex2 = summaryRows.length;
  summaryRows.push([language === 'fr' ? 'Reste à charge' : "Beneficiary's total", `${beneficiaryAmount2.toFixed(2)} ${currency}`, `${beneficiaryVAT2.toFixed(2)} ${currency}`, `${beneficiaryWithVAT2.toFixed(2)} ${currency}`]);
  summaryRows.push([
    language === 'fr' ? `  Ticket modérateur (${copayPercentage.toFixed(2)}%)` : `  Co-payment (${copayPercentage.toFixed(2)}%)`,
    `${copayAmount2.toFixed(2)} ${currency}`, `${copayVAT2.toFixed(2)} ${currency}`, `${copayWithVAT2.toFixed(2)} ${currency}`]);
  let excessRowIndex2 = -1;
  if (hasExcess2) {
    excessRowIndex2 = summaryRows.length;
    summaryRows.push([
      language === 'fr' ? `  Dépassements (100%)` : `  Excess charges (100%)`,
      `${excessHT2.toFixed(2)} ${currency}`, `${excessVAT2.toFixed(2)} ${currency}`, `${excessWithVAT2.toFixed(2)} ${currency}`]);
    summaryRows.push([
      language === 'fr'
        ? `  Base conv. = ${conventionedRate!.toFixed(2)} HT/h × ${totalCalendarHours2.toFixed(2)} h`
        : `  Conv. base = ${conventionedRate!.toFixed(2)} /h × ${totalCalendarHours2.toFixed(2)} h`,
      `= ${conventionedBaseHT2.toFixed(2)} ${currency}`,
      `${(conventionedBaseHT2 * 0.055).toFixed(2)} ${currency}`,
      `${(conventionedBaseHT2 * 1.055).toFixed(2)} ${currency}`]);
  }

  const lastRowIndex2 = beneficiaryRowIndex2;

  autoTable(doc, {
    startY: currentY,
    head: [[language === 'fr' ? 'Résumé Financier' : 'Financial Summary', language === 'fr' ? 'Hors TVA' : 'Before VAT', language === 'fr' ? 'TVA 5.5%' : 'VAT 5.5%', language === 'fr' ? 'Avec TVA' : 'With VAT']],
    body: summaryRows,
    headStyles: { fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 65 },
      1: { cellWidth: 37, halign: 'right' },
      2: { cellWidth: 37, halign: 'right' },
      3: { cellWidth: 43, halign: 'right' }
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data: any) => {
      if (data.section !== 'body') return;
      if (data.row.index === lastRowIndex2) {
        // Beneficiary total row: yellow highlight + bold
        data.cell.styles.fillColor = [254, 243, 199];
        data.cell.styles.fontStyle = 'bold';
      } else if (data.row.index === excessRowIndex2) {
        // Excess charges row: light orange highlight
        data.cell.styles.fillColor = [255, 237, 213];
      } else if (hasExcess2 && data.row.index === summaryRows.length - 1) {
        // Conventioned base note row: light blue
        data.cell.styles.fillColor = [219, 234, 254];
        data.cell.styles.textColor = [30, 64, 175];
        data.cell.styles.fontSize = 6;
      }
    },
  });

  // Add detailed calculation breakdown if conventioned rate is set
  if (conventionedRate !== undefined) {
    const calcY = (doc as any).lastAutoTable.finalY + 3;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(language === 'fr' ? 'Détail du calcul :' : 'Calculation detail:', 14, calcY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    const lines = [
      `${language === 'fr' ? 'Base conventionnée' : 'Conventioned base'} = ${totalCalendarHours2.toFixed(2)} h × ${conventionedRate.toFixed(2)} HT = ${conventionedBaseHT2.toFixed(2)} HT`,
      `${language === 'fr' ? 'Total facturé' : 'Total billed'}${hasExcess2 ? (language === 'fr' ? ' (avec majorations)' : ' (with majoration)') : ''} = ${totalAmount.toFixed(2)} HT`,
      `${language === 'fr' ? 'Prise en charge' : 'Coverage'} = ${(100 - copayPercentage).toFixed(2)}% × ${conventionedBaseHT2.toFixed(2)} HT = ${insuranceAmount2.toFixed(2)} HT`,
      `${language === 'fr' ? 'Ticket modérateur' : 'Co-payment'} = ${copayPercentage.toFixed(2)}% × ${conventionedBaseHT2.toFixed(2)} HT = ${copayAmount2.toFixed(2)} HT`,
    ];
    if (hasExcess2) {
      lines.push(`${language === 'fr' ? 'Dépassements (100%)' : 'Excess charges (100%)'} = ${totalAmount.toFixed(2)} − ${conventionedBaseHT2.toFixed(2)} = ${excessHT2.toFixed(2)} HT`);
    }
    lines.push(`${language === 'fr' ? 'Reste à charge total' : "Beneficiary's total"} = ${copayAmount2.toFixed(2)}${hasExcess2 ? ` + ${excessHT2.toFixed(2)}` : ''} = ${beneficiaryAmount2.toFixed(2)} HT`);

    let lineY = calcY + 4;
    lines.forEach(line => {
      doc.text(line, 14, lineY);
      lineY += 3;
    });
  }

  // Notes breakdown - sorted by priority
  if (dailyNotes.length > 0) {
    const noteTypes: Record<string, number> = {};
    dailyNotes.forEach(note => {
      if (note.note_type) {
        noteTypes[note.note_type] = (noteTypes[note.note_type] || 0) + 1;
      }
    });

    const notesY = (doc as any).lastAutoTable.finalY + 3;
    const notePriority = ['complaint', 'no-show', 'late-arrival', 'modification', 'cancellation', 'general', 'special_instruction'];
    const noteData = notePriority
      .filter(type => noteTypes[type])
      .map(type => [
        getNoteTypeLabel(type, language),
        `${noteTypes[type]} ${language === 'fr' ? 'jour(s)' : 'day(s)'}`
      ]);

    autoTable(doc, {
      startY: notesY,
      head: [[language === 'fr' ? 'Notes par Type' : 'Notes by Type', '']],
      body: noteData,
      headStyles: { fontSize: 8 },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 112 },
        1: { cellWidth: 70, halign: 'right' }
      },
      margin: { left: 14, right: 14 },
    });
  }
}
