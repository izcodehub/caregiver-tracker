/**
 * Notification Preferences Utilities
 * Helper functions for managing family member notification preferences
 */

export interface NotificationPreferences {
  push_enabled?: boolean;
  email_enabled?: boolean;
  sms_enabled?: boolean;
  check_in?: boolean;
  check_out?: boolean;
  missed_check_in?: boolean;
  daily_summary?: boolean;
  quiet_hours?: {
    enabled: boolean;
    start: string; // HH:MM format
    end: string; // HH:MM format
  };
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  push_enabled: false,
  email_enabled: false,
  sms_enabled: false,
  check_in: true,
  check_out: true,
  missed_check_in: true,
  daily_summary: false,
  quiet_hours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
  },
};

/**
 * Check if notifications should be sent based on preferences and quiet hours
 */
export function shouldSendNotification(
  preferences: NotificationPreferences,
  notificationType: keyof NotificationPreferences
): boolean {
  // Check if notification type is enabled
  if (!preferences[notificationType]) {
    return false;
  }

  // Check quiet hours
  if (preferences.quiet_hours?.enabled) {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const start = preferences.quiet_hours.start;
    const end = preferences.quiet_hours.end;

    // Handle quiet hours that span midnight
    if (start > end) {
      if (currentTime >= start || currentTime <= end) {
        return false;
      }
    } else {
      if (currentTime >= start && currentTime <= end) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Merge user preferences with defaults
 */
export function mergePreferences(
  userPreferences?: Partial<NotificationPreferences>
): NotificationPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    ...userPreferences,
    quiet_hours: {
      ...DEFAULT_PREFERENCES.quiet_hours,
      ...(userPreferences?.quiet_hours || {}),
    },
  };
}

/**
 * Validate notification preferences
 */
export function validatePreferences(
  preferences: Partial<NotificationPreferences>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate quiet hours format
  if (preferences.quiet_hours) {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

    if (preferences.quiet_hours.start && !timeRegex.test(preferences.quiet_hours.start)) {
      errors.push('Invalid quiet hours start time format. Use HH:MM');
    }

    if (preferences.quiet_hours.end && !timeRegex.test(preferences.quiet_hours.end)) {
      errors.push('Invalid quiet hours end time format. Use HH:MM');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get human-readable description of preferences
 */
export function getPreferencesDescription(preferences: NotificationPreferences): string {
  const enabled: string[] = [];

  if (preferences.push_enabled) enabled.push('Push');
  if (preferences.email_enabled) enabled.push('Email');
  if (preferences.sms_enabled) enabled.push('SMS');

  if (enabled.length === 0) {
    return 'No notifications enabled';
  }

  let description = `Receiving ${enabled.join(', ')} notifications for `;
  const types: string[] = [];

  if (preferences.check_in) types.push('check-ins');
  if (preferences.check_out) types.push('check-outs');
  if (preferences.missed_check_in) types.push('missed check-ins');
  if (preferences.daily_summary) types.push('daily summary');

  description += types.join(', ');

  if (preferences.quiet_hours?.enabled) {
    description += `. Quiet hours: ${preferences.quiet_hours.start} - ${preferences.quiet_hours.end}`;
  }

  return description;
}

/**
 * Check if user has any notifications enabled
 */
export function hasAnyNotificationsEnabled(preferences: NotificationPreferences): boolean {
  return !!(
    preferences.push_enabled ||
    preferences.email_enabled ||
    preferences.sms_enabled
  );
}

/**
 * Get notification channels that are enabled
 */
export function getEnabledChannels(preferences: NotificationPreferences): string[] {
  const channels: string[] = [];

  if (preferences.push_enabled) channels.push('push');
  if (preferences.email_enabled) channels.push('email');
  if (preferences.sms_enabled) channels.push('sms');

  return channels;
}
