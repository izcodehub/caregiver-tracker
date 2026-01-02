/**
 * Timezone utilities for displaying times in beneficiary's local timezone
 */
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

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
 * Convert a UTC/ISO date string to beneficiary's timezone as a Date object
 * This is useful for date-fns functions that need a Date object
 */
export function convertToTimezone(date: Date | string, timezone: string): Date {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return toZonedTime(dateObj, timezone);
}

/**
 * Format time as HH:MM in beneficiary's timezone (for notifications)
 */
export function formatTimeInTimezone(date: Date | string, timezone: string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(dateObj);
}

/**
 * Format date with date-fns in beneficiary's timezone
 * Use this for dashboard displays
 */
export function formatInBeneficiaryTimezone(
  date: Date | string,
  timezone: string,
  formatStr: string
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(dateObj, timezone, formatStr, { locale: fr });
}

/**
 * Format time as HH:MM using date-fns (for dashboard)
 */
export function formatTimeWithDateFns(date: Date | string, timezone: string): string {
  return formatInBeneficiaryTimezone(date, timezone, 'HH:mm');
}

/**
 * Format date and time using date-fns (for dashboard)
 */
export function formatDateTimeWithDateFns(date: Date | string, timezone: string): string {
  return formatInBeneficiaryTimezone(date, timezone, 'dd/MM/yyyy HH:mm');
}

/**
 * Format date only using date-fns (for dashboard)
 */
export function formatDateWithDateFns(date: Date | string, timezone: string): string {
  return formatInBeneficiaryTimezone(date, timezone, 'dd/MM/yyyy');
}
