/**
 * Convert decimal hours to HH:MM format
 * @param decimalHours - Hours in decimal format (e.g., 8.5 for 8 hours 30 minutes)
 * @returns Time in HH:MM format (e.g., "08:30")
 */
export function decimalToHHMM(decimalHours: number): string {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Format hours for display with both decimal and HH:MM
 * @param decimalHours - Hours in decimal format
 * @returns Formatted string like "8.50h (08:30)"
 */
export function formatHours(decimalHours: number): string {
  const hhmm = decimalToHHMM(decimalHours);
  return `${decimalHours.toFixed(2)}h (${hhmm})`;
}

/**
 * Format hours for compact display
 * @param decimalHours - Hours in decimal format
 * @returns Formatted string like "8.50h / 08:30"
 */
export function formatHoursCompact(decimalHours: number): string {
  const hhmm = decimalToHHMM(decimalHours);
  return `${decimalHours.toFixed(2)}h / ${hhmm}`;
}

/**
 * Format number with locale-specific decimal separator
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: 2)
 * @param locale - Locale ('fr' uses comma, 'en' uses dot)
 * @returns Formatted number string
 */
export function formatNumber(value: number, decimals: number = 2, locale: 'fr' | 'en' = 'fr'): string {
  const formatted = value.toFixed(decimals);
  if (locale === 'fr') {
    return formatted.replace('.', ',');
  }
  return formatted;
}
