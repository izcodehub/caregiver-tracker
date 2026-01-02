/**
 * Timezone utilities for displaying times in beneficiary's local timezone
 */

/**
 * Get timezone for a country code
 */
export function getTimezoneForCountry(country: string | undefined): string {
  const timezoneMap: Record<string, string> = {
    'FR': 'Europe/Paris',
    'US': 'America/New_York',
    'CA': 'America/Toronto',
    'UK': 'Europe/London',
    'DE': 'Europe/Berlin',
    'ES': 'Europe/Madrid',
    'IT': 'Europe/Rome',
  };

  return timezoneMap[country || 'FR'] || 'Europe/Paris';
}

/**
 * Format a date in the beneficiary's timezone
 * @param date - Date to format
 * @param timezone - IANA timezone (e.g., 'Europe/Paris')
 * @param options - Intl.DateTimeFormat options
 */
export function formatInTimezone(
  date: Date | string,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('fr-FR', {
    ...options,
    timeZone: timezone,
  }).format(dateObj);
}

/**
 * Format time as HH:MM in beneficiary's timezone
 */
export function formatTimeInTimezone(date: Date | string, timezone: string): string {
  return formatInTimezone(date, timezone, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Format date and time in beneficiary's timezone
 */
export function formatDateTimeInTimezone(date: Date | string, timezone: string): string {
  return formatInTimezone(date, timezone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Get current time in beneficiary's timezone
 */
export function getCurrentTimeInTimezone(timezone: string): Date {
  // This returns a Date object, but when formatted it will use the timezone
  return new Date();
}
