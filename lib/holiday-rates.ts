// Utility functions for holiday rate calculations

export function getHolidayMajoration(dateStr: string): number {
  // Returns the majoration percentage for a given date
  // 100% for May 1st and Dec 25th
  // 25% for other holidays and Sundays
  // 0 for regular days
  // dateStr is in format 'yyyy-MM-dd'
  const [year, monthStr, dayStr] = dateStr.split('-');
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  // Create Date object to check if it's Sunday
  const date = new Date(parseInt(year), month - 1, day);
  const isSunday = date.getDay() === 0;

  // Special holidays with 100% majoration
  if ((month === 5 && day === 1) || (month === 12 && day === 25)) {
    return 1.0; // 100% majoration
  }

  // Regular French public holidays with 25% majoration
  const regularHolidays = [
    { month: 1, day: 1 },   // New Year's Day
    { month: 5, day: 8 },   // Victory Day
    { month: 7, day: 14 },  // Bastille Day
    { month: 8, day: 15 },  // Assumption
    { month: 11, day: 1 },  // All Saints
    { month: 11, day: 11 }, // Armistice
  ];

  if (regularHolidays.some(h => h.month === month && h.day === day)) {
    return 0.25; // 25% majoration
  }

  // Sundays get 25% majoration
  if (isSunday) {
    return 0.25; // 25% majoration for Sundays
  }

  return 0; // No majoration (regular day)
}

export function isPublicHoliday(dateStr: string): boolean {
  return getHolidayMajoration(dateStr) > 0;
}

export function calculateHolidayRate(regularRate: number, dateStr: string): number {
  const majoration = getHolidayMajoration(dateStr);
  return regularRate * (1 + majoration);
}
