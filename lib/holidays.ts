/**
 * French Public Holidays for 2024-2026
 * This list includes the major French public holidays (jours fériés)
 */

type Holiday = {
  date: string; // YYYY-MM-DD format
  name: string;
};

const frenchHolidays: Holiday[] = [
  // 2024
  { date: '2024-01-01', name: 'Jour de l\'an' },
  { date: '2024-04-01', name: 'Lundi de Pâques' },
  { date: '2024-05-01', name: 'Fête du Travail' },
  { date: '2024-05-08', name: 'Victoire 1945' },
  { date: '2024-05-09', name: 'Jeudi de l\'Ascension' },
  { date: '2024-05-20', name: 'Lundi de Pentecôte' },
  { date: '2024-07-14', name: 'Fête Nationale' },
  { date: '2024-08-15', name: 'Assomption' },
  { date: '2024-11-01', name: 'Toussaint' },
  { date: '2024-11-11', name: 'Armistice 1918' },
  { date: '2024-12-25', name: 'Noël' },

  // 2025
  { date: '2025-01-01', name: 'Jour de l\'an' },
  { date: '2025-04-21', name: 'Lundi de Pâques' },
  { date: '2025-05-01', name: 'Fête du Travail' },
  { date: '2025-05-08', name: 'Victoire 1945' },
  { date: '2025-05-29', name: 'Jeudi de l\'Ascension' },
  { date: '2025-06-09', name: 'Lundi de Pentecôte' },
  { date: '2025-07-14', name: 'Fête Nationale' },
  { date: '2025-08-15', name: 'Assomption' },
  { date: '2025-11-01', name: 'Toussaint' },
  { date: '2025-11-11', name: 'Armistice 1918' },
  { date: '2025-12-25', name: 'Noël' },

  // 2026
  { date: '2026-01-01', name: 'Jour de l\'an' },
  { date: '2026-04-06', name: 'Lundi de Pâques' },
  { date: '2026-05-01', name: 'Fête du Travail' },
  { date: '2026-05-08', name: 'Victoire 1945' },
  { date: '2026-05-14', name: 'Jeudi de l\'Ascension' },
  { date: '2026-05-25', name: 'Lundi de Pentecôte' },
  { date: '2026-07-14', name: 'Fête Nationale' },
  { date: '2026-08-15', name: 'Assomption' },
  { date: '2026-11-01', name: 'Toussaint' },
  { date: '2026-11-11', name: 'Armistice 1918' },
  { date: '2026-12-25', name: 'Noël' },
];

/**
 * Check if a date is a French public holiday
 * @param date - Date to check
 * @returns Holiday object if it's a holiday, null otherwise
 */
export function isHoliday(date: Date): Holiday | null {
  // Format date in local timezone to avoid UTC conversion issues
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  return frenchHolidays.find(h => h.date === dateStr) || null;
}

/**
 * Check if a date is a Sunday
 * @param date - Date to check
 * @returns true if Sunday
 */
export function isSunday(date: Date): boolean {
  return date.getDay() === 0;
}

/**
 * Check if a date is a holiday or Sunday
 * @param date - Date to check
 * @returns Holiday name if it's a holiday, 'Sunday' if it's Sunday, null otherwise
 */
export function getHolidayType(date: Date): { type: 'holiday' | 'sunday'; name: string } | null {
  const holiday = isHoliday(date);
  if (holiday) {
    return { type: 'holiday', name: holiday.name };
  }
  if (isSunday(date)) {
    return { type: 'sunday', name: 'Dimanche' };
  }
  return null;
}
