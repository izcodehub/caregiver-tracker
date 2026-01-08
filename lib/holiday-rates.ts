// Utility functions for holiday rate calculations

export function getHolidayMajoration(dateStr: string, hour?: number): number {
  // Returns the majoration percentage for a given date and time
  // 100% for May 1st and Dec 25th (all hours)
  // 25% for holidays and Sundays (all hours)
  // 25% for weekdays before 8 AM or after 8 PM
  // 0 for weekdays 8 AM - 8 PM
  // dateStr is in format 'yyyy-MM-dd'
  // hour is optional 0-23, if not provided assumes full day
  const [year, monthStr, dayStr] = dateStr.split('-');
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  // Create Date object to check if it's Sunday
  const date = new Date(parseInt(year), month - 1, day);
  const isSunday = date.getDay() === 0;

  // Special holidays with 100% majoration (all hours)
  if ((month === 5 && day === 1) || (month === 12 && day === 25)) {
    return 1.0; // 100% majoration
  }

  // Regular French public holidays with 25% majoration (all hours)
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

  // Sundays get 25% majoration (all hours)
  if (isSunday) {
    return 0.25; // 25% majoration for Sundays
  }

  // Weekdays: check time of day if hour is provided
  if (hour !== undefined) {
    // Before 8 AM (0-7) or after 8 PM (20-23) gets 25% majoration
    if (hour < 8 || hour >= 20) {
      return 0.25; // 25% majoration for early morning/evening
    }
  }

  return 0; // No majoration (regular weekday during 8 AM - 8 PM)
}

export function isPublicHoliday(dateStr: string): boolean {
  return getHolidayMajoration(dateStr) > 0;
}

export function calculateHolidayRate(regularRate: number, dateStr: string): number {
  const majoration = getHolidayMajoration(dateStr);
  return regularRate * (1 + majoration);
}
