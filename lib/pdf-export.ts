import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import { getHolidayMajoration, isPublicHoliday } from './holiday-rates';

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
  timezone: string = 'Europe/Paris'
) {
  const doc = new jsPDF();

  // Title
  doc.setFontSize(18);
  doc.text(
    language === 'fr' ? 'Résumé Financier' : 'Financial Summary',
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

  // Header info
  doc.setFontSize(10);
  const rate25 = regularRate * 1.25;
  const rate100 = regularRate * 2.0;
  doc.text(`${language === 'fr' ? 'Tarif Normal (Hors TVA)' : 'Regular Rate (Before VAT)'}: ${regularRate.toFixed(2)} ${currency}/h - ${language === 'fr' ? 'Appliqué à: Jours de semaine avant 20h' : 'Applied to: Weekdays before 8pm'}`, 14, 45);
  doc.text(`${language === 'fr' ? 'Tarif Majoré +25% (Hors TVA)' : 'Holiday Rate +25% (Before VAT)'}: ${rate25.toFixed(2)} ${currency}/h - ${language === 'fr' ? 'Appliqué à: Jours fériés, dimanches, après 20h' : 'Applied to: Holidays, Sundays, after 8pm'}`, 14, 51);
  doc.text(`${language === 'fr' ? 'Tarif Majoré +100% (Hors TVA)' : 'Holiday Rate +100% (Before VAT)'}: ${rate100.toFixed(2)} ${currency}/h - ${language === 'fr' ? 'Appliqué à: 1er mai et 25 décembre' : 'Applied to: May 1st and December 25th'}`, 14, 57);
  doc.text(`${language === 'fr' ? 'Ticket Modérateur' : 'Co-payment'}: ${copayPercentage}%`, 14, 63);

  // Calculate totals by caregiver - separate regular, 25% majoration, and 100% majoration
  const caregiverRegularStats: Record<string, { hours: number; amount: number }> = {};
  const caregiver25HolidayStats: Record<string, { hours: number; amount: number }> = {};
  const caregiver100HolidayStats: Record<string, { hours: number; amount: number }> = {};
  const caregiverTrainingStats: Record<string, number> = {};
  const grouped = groupCheckInsByDate(checkIns, timezone);

  Object.entries(grouped).forEach(([date, dayCheckIns]) => {
    const pairs = pairCheckInOuts(dayCheckIns);

    pairs.forEach(pair => {
      if (pair.checkOut) {
        const hours = (new Date(pair.checkOut.timestamp).getTime() - new Date(pair.checkIn.timestamp).getTime()) / (1000 * 60 * 60);
        const name = pair.checkIn.caregiver_name;

        if (pair.checkIn.is_training) {
          caregiverTrainingStats[name] = (caregiverTrainingStats[name] || 0) + hours;
        } else {
          const majoration = getHolidayMajoration(date);

          if (majoration === 1.0) {
            // 100% majoration (May 1st, Dec 25th)
            if (!caregiver100HolidayStats[name]) {
              caregiver100HolidayStats[name] = { hours: 0, amount: 0 };
            }
            caregiver100HolidayStats[name].hours += hours;
            caregiver100HolidayStats[name].amount += hours * rate100;
          } else if (majoration === 0.25) {
            // 25% majoration (other holidays)
            if (!caregiver25HolidayStats[name]) {
              caregiver25HolidayStats[name] = { hours: 0, amount: 0 };
            }
            caregiver25HolidayStats[name].hours += hours;
            caregiver25HolidayStats[name].amount += hours * rate25;
          } else {
            // Regular hours
            if (!caregiverRegularStats[name]) {
              caregiverRegularStats[name] = { hours: 0, amount: 0 };
            }
            caregiverRegularStats[name].hours += hours;
            caregiverRegularStats[name].amount += hours * regularRate;
          }
        }
      }
    });
  });

  let currentY = 71;

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
      headStyles: { fillColor: [59, 130, 246] },
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;
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
      headStyles: { fillColor: [234, 179, 8] },
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;
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
      headStyles: { fillColor: [220, 38, 38] },
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;
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
      headStyles: { fillColor: [251, 146, 60] },
    });
    currentY = (doc as any).lastAutoTable.finalY + 10;
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
  const vatAmount = totalAmount * 0.055; // 5.5% VAT
  const totalWithVAT = totalAmount + vatAmount;
  const coverageAmount = totalAmount - (totalAmount * (copayPercentage / 100));
  const copayAmount = totalAmount * (copayPercentage / 100);

  // Calculate VAT for each row
  const regularVAT = totalRegularAmount * 0.055;
  const regularWithVAT = totalRegularAmount + regularVAT;
  const holiday25VAT = total25HolidayAmount * 0.055;
  const holiday25WithVAT = total25HolidayAmount + holiday25VAT;
  const holiday100VAT = total100HolidayAmount * 0.055;
  const holiday100WithVAT = total100HolidayAmount + holiday100VAT;
  const coverageVAT = coverageAmount * 0.055;
  const coverageWithVAT = coverageAmount + coverageVAT;
  const copayVAT = copayAmount * 0.055;
  const copayWithVAT = copayAmount + copayVAT;

  // Financial summary with VAT
  const summaryRows = [
    [language === 'fr' ? 'Heures Normales' : 'Regular Hours', `${totalRegularHours.toFixed(2)}h - ${totalRegularAmount.toFixed(2)} ${currency}`, `${regularVAT.toFixed(2)} ${currency}`, `${regularWithVAT.toFixed(2)} ${currency}`],
  ];

  if (total25HolidayHours > 0) {
    summaryRows.push([language === 'fr' ? 'Heures Fériées (+25%)' : 'Holiday Hours (+25%)', `${total25HolidayHours.toFixed(2)}h - ${total25HolidayAmount.toFixed(2)} ${currency}`, `${holiday25VAT.toFixed(2)} ${currency}`, `${holiday25WithVAT.toFixed(2)} ${currency}`]);
  }

  if (total100HolidayHours > 0) {
    summaryRows.push([language === 'fr' ? 'Heures Fériées (+100%)' : 'Holiday Hours (+100%)', `${total100HolidayHours.toFixed(2)}h - ${total100HolidayAmount.toFixed(2)} ${currency}`, `${holiday100VAT.toFixed(2)} ${currency}`, `${holiday100WithVAT.toFixed(2)} ${currency}`]);
  }

  summaryRows.push([language === 'fr' ? 'Heures Formation' : 'Training Hours', `${totalTrainingHours.toFixed(2)}h`, '', '-']);
  summaryRows.push([language === 'fr' ? 'Montant Total' : 'Total Amount', `${totalAmount.toFixed(2)} ${currency}`, `${vatAmount.toFixed(2)} ${currency}`, `${totalWithVAT.toFixed(2)} ${currency}`]);
  summaryRows.push([language === 'fr' ? 'Prise en Charge' : 'Coverage', `${coverageAmount.toFixed(2)} ${currency}`, `${coverageVAT.toFixed(2)} ${currency}`, `${coverageWithVAT.toFixed(2)} ${currency}`]);
  summaryRows.push([language === 'fr' ? 'Ticket Modérateur' : 'Co-payment', `${copayAmount.toFixed(2)} ${currency}`, `${copayVAT.toFixed(2)} ${currency}`, `${copayWithVAT.toFixed(2)} ${currency}`]);

  autoTable(doc, {
    startY: currentY,
    head: [[language === 'fr' ? 'Résumé Financier' : 'Financial Summary', language === 'fr' ? 'Hors TVA' : 'Before VAT', language === 'fr' ? 'TVA 5.5%' : 'VAT 5.5%', language === 'fr' ? 'Avec TVA' : 'With VAT']],
    body: summaryRows,
    didParseCell: (data: any) => {
      // Copay row is the last row
      if (data.row.index === summaryRows.length - 1 && data.section === 'body') {
        data.cell.styles.fillColor = [254, 243, 199];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // Notes breakdown - sorted by priority
  if (dailyNotes.length > 0) {
    const noteTypes: Record<string, number> = {};
    dailyNotes.forEach(note => {
      if (note.note_type) {
        noteTypes[note.note_type] = (noteTypes[note.note_type] || 0) + 1;
      }
    });

    const notesY = (doc as any).lastAutoTable.finalY + 10;
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
    });
  }

  // Save PDF
  const fileName = `financial-summary-${beneficiaryName.replace(/\s+/g, '-')}-${format(selectedMonth, 'yyyy-MM')}.pdf`;
  doc.save(fileName);
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
  timezone: string = 'Europe/Paris'
) {
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
  });

  // Add financial summary at the end if provided
  if (regularRate && currency !== undefined && copayPercentage !== undefined && dailyNotes) {
    const summaryY = (doc as any).lastAutoTable.finalY + 15;

    // Check if we need a new page
    if (summaryY > 250) {
      doc.addPage();
      addFinancialSummaryToPage(doc, 20, checkIns, regularRate, currency, copayPercentage, dailyNotes, language, timezone);
    } else {
      addFinancialSummaryToPage(doc, summaryY, checkIns, regularRate, currency, copayPercentage, dailyNotes, language, timezone);
    }
  }

  // Save PDF
  const fileName = `check-in-history-${beneficiaryName.replace(/\s+/g, '-')}-${format(selectedMonth, 'yyyy-MM')}.pdf`;
  doc.save(fileName);
}

// Helper functions
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
  timezone: string = 'Europe/Paris'
) {
  // Title
  doc.setFontSize(14);
  doc.text(language === 'fr' ? 'Résumé Financier' : 'Financial Summary', 14, startY);

  // Header info
  doc.setFontSize(8);
  const rate25 = regularRate * 1.25;
  const rate100 = regularRate * 2.0;
  doc.text(`${language === 'fr' ? 'Tarif Normal (Hors TVA)' : 'Regular Rate (Before VAT)'}: ${regularRate.toFixed(2)} ${currency}/h - ${language === 'fr' ? 'Appliqué à: Jours de semaine avant 20h' : 'Applied to: Weekdays before 8pm'}`, 14, startY + 6);
  doc.text(`${language === 'fr' ? 'Tarif Majoré +25% (Hors TVA)' : 'Holiday Rate +25% (Before VAT)'}: ${rate25.toFixed(2)} ${currency}/h - ${language === 'fr' ? 'Appliqué à: Jours fériés, dimanches, après 20h' : 'Applied to: Holidays, Sundays, after 8pm'}`, 14, startY + 10);
  doc.text(`${language === 'fr' ? 'Tarif Majoré +100% (Hors TVA)' : 'Holiday Rate +100% (Before VAT)'}: ${rate100.toFixed(2)} ${currency}/h - ${language === 'fr' ? 'Appliqué à: 1er mai et 25 décembre' : 'Applied to: May 1st and December 25th'}`, 14, startY + 14);
  doc.text(`${language === 'fr' ? 'Ticket Modérateur' : 'Co-payment'}: ${copayPercentage}%`, 14, startY + 18);

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
        const hours = (new Date(pair.checkOut.timestamp).getTime() - new Date(pair.checkIn.timestamp).getTime()) / (1000 * 60 * 60);
        const name = pair.checkIn.caregiver_name;

        if (pair.checkIn.is_training) {
          caregiverTrainingStats[name] = (caregiverTrainingStats[name] || 0) + hours;
        } else {
          const majoration = getHolidayMajoration(date);

          if (majoration === 1.0) {
            // 100% majoration (May 1st, Dec 25th)
            if (!caregiver100HolidayStats[name]) {
              caregiver100HolidayStats[name] = { hours: 0, amount: 0 };
            }
            caregiver100HolidayStats[name].hours += hours;
            caregiver100HolidayStats[name].amount += hours * rate100;
          } else if (majoration === 0.25) {
            // 25% majoration (other holidays)
            if (!caregiver25HolidayStats[name]) {
              caregiver25HolidayStats[name] = { hours: 0, amount: 0 };
            }
            caregiver25HolidayStats[name].hours += hours;
            caregiver25HolidayStats[name].amount += hours * rate25;
          } else {
            // Regular hours
            if (!caregiverRegularStats[name]) {
              caregiverRegularStats[name] = { hours: 0, amount: 0 };
            }
            caregiverRegularStats[name].hours += hours;
            caregiverRegularStats[name].amount += hours * regularRate;
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
  const coverageAmount = totalAmount - (totalAmount * (copayPercentage / 100));
  const copayAmount = totalAmount * (copayPercentage / 100);

  // Calculate VAT for each row
  const regularVAT = totalRegularAmount * 0.055;
  const regularWithVAT = totalRegularAmount + regularVAT;
  const holiday25VAT = total25HolidayAmount * 0.055;
  const holiday25WithVAT = total25HolidayAmount + holiday25VAT;
  const holiday100VAT = total100HolidayAmount * 0.055;
  const holiday100WithVAT = total100HolidayAmount + holiday100VAT;
  const coverageVAT = coverageAmount * 0.055;
  const coverageWithVAT = coverageAmount + coverageVAT;
  const copayVAT = copayAmount * 0.055;
  const copayWithVAT = copayAmount + copayVAT;

  // Financial summary with VAT
  const summaryRows = [
    [language === 'fr' ? 'Heures Normales' : 'Regular Hours', `${totalRegularHours.toFixed(2)}h - ${totalRegularAmount.toFixed(2)} ${currency}`, `${regularVAT.toFixed(2)} ${currency}`, `${regularWithVAT.toFixed(2)} ${currency}`],
  ];

  if (total25HolidayHours > 0) {
    summaryRows.push([language === 'fr' ? 'Heures Fériées (+25%)' : 'Holiday Hours (+25%)', `${total25HolidayHours.toFixed(2)}h - ${total25HolidayAmount.toFixed(2)} ${currency}`, `${holiday25VAT.toFixed(2)} ${currency}`, `${holiday25WithVAT.toFixed(2)} ${currency}`]);
  }

  if (total100HolidayHours > 0) {
    summaryRows.push([language === 'fr' ? 'Heures Fériées (+100%)' : 'Holiday Hours (+100%)', `${total100HolidayHours.toFixed(2)}h - ${total100HolidayAmount.toFixed(2)} ${currency}`, `${holiday100VAT.toFixed(2)} ${currency}`, `${holiday100WithVAT.toFixed(2)} ${currency}`]);
  }

  summaryRows.push([language === 'fr' ? 'Heures Formation' : 'Training Hours', `${totalTrainingHours.toFixed(2)}h`, '', '-']);
  summaryRows.push([language === 'fr' ? 'Montant Total' : 'Total Amount', `${totalAmount.toFixed(2)} ${currency}`, `${vatAmount.toFixed(2)} ${currency}`, `${totalWithVAT.toFixed(2)} ${currency}`]);
  summaryRows.push([language === 'fr' ? 'Prise en Charge' : 'Coverage', `${coverageAmount.toFixed(2)} ${currency}`, `${coverageVAT.toFixed(2)} ${currency}`, `${coverageWithVAT.toFixed(2)} ${currency}`]);
  summaryRows.push([language === 'fr' ? 'Ticket Modérateur' : 'Co-payment', `${copayAmount.toFixed(2)} ${currency}`, `${copayVAT.toFixed(2)} ${currency}`, `${copayWithVAT.toFixed(2)} ${currency}`]);

  autoTable(doc, {
    startY: currentY,
    head: [[language === 'fr' ? 'Résumé Financier' : 'Financial Summary', language === 'fr' ? 'Hors TVA' : 'Before VAT', language === 'fr' ? 'TVA 5.5%' : 'VAT 5.5%', language === 'fr' ? 'Avec TVA' : 'With VAT']],
    body: summaryRows,
    headStyles: { fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    didParseCell: (data: any) => {
      // Copay row is the last row
      if (data.row.index === summaryRows.length - 1 && data.section === 'body') {
        data.cell.styles.fillColor = [254, 243, 199];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

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
    });
  }
}
