/**
 * Server-side Push Notification Service
 * Handles sending push notifications using web-push
 */
import webpush from 'web-push';
import { createClient } from '@/lib/supabase-server';

// VAPID keys should be stored in environment variables
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@caregiver-tracker.com';

if (!vapidPublicKey || !vapidPrivateKey) {
  console.warn('VAPID keys not configured. Push notifications will not work.');
} else {
  webpush.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey
  );
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, any>;
}

/**
 * Send a push notification to a specific family member
 */
export async function sendNotificationToFamilyMember(
  familyMemberId: string,
  payload: NotificationPayload
): Promise<{ success: boolean; errors?: string[] }> {
  const supabase = createClient();

  try {
    // Get all active subscriptions for this family member
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('family_member_id', familyMemberId);

    if (error) {
      console.error('Error fetching subscriptions:', error);
      return { success: false, errors: [error.message] };
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No subscriptions found for family member:', familyMemberId);
      return { success: false, errors: ['No subscriptions found'] };
    }

    const errors: string[] = [];
    const sendPromises = subscriptions.map(async (sub) => {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(payload)
        );

        console.log('Notification sent successfully to:', sub.endpoint);
      } catch (error: any) {
        console.error('Error sending notification:', error);

        // If subscription is no longer valid, delete it
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log('Subscription expired, removing:', sub.id);
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id);
        }

        errors.push(error.message);
      }
    });

    await Promise.all(sendPromises);

    return {
      success: errors.length < subscriptions.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error: any) {
    console.error('Error in sendNotificationToFamilyMember:', error);
    return { success: false, errors: [error.message] };
  }
}

/**
 * Send notifications about a caregiver check-in
 */
export async function sendCheckInNotification(
  caregiverName: string,
  familyMemberIds: string[],
  checkInTime: Date,
  elderlyCareRecipientName: string
): Promise<void> {
  const payload: NotificationPayload = {
    title: `${caregiverName} checked in`,
    body: `${caregiverName} has checked in with ${elderlyCareRecipientName} at ${checkInTime.toLocaleTimeString()}`,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: 'check-in',
    data: {
      type: 'check-in',
      caregiverName,
      timestamp: checkInTime.toISOString(),
    },
  };

  const promises = familyMemberIds.map((id) =>
    sendNotificationToFamilyMember(id, payload)
  );

  await Promise.all(promises);
}

/**
 * Send notifications about a caregiver check-out
 */
export async function sendCheckOutNotification(
  caregiverName: string,
  familyMemberIds: string[],
  checkOutTime: Date,
  elderlyCareRecipientName: string
): Promise<void> {
  const payload: NotificationPayload = {
    title: `${caregiverName} checked out`,
    body: `${caregiverName} has checked out from ${elderlyCareRecipientName} at ${checkOutTime.toLocaleTimeString()}`,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: 'check-out',
    data: {
      type: 'check-out',
      caregiverName,
      timestamp: checkOutTime.toISOString(),
    },
  };

  const promises = familyMemberIds.map((id) =>
    sendNotificationToFamilyMember(id, payload)
  );

  await Promise.all(promises);
}

/**
 * Send notifications about missed check-ins
 */
export async function sendMissedCheckInNotification(
  caregiverName: string,
  familyMemberIds: string[],
  expectedTime: Date,
  elderlyCareRecipientName: string
): Promise<void> {
  const payload: NotificationPayload = {
    title: 'Missed Check-in Alert',
    body: `${caregiverName} has not checked in with ${elderlyCareRecipientName}. Expected at ${expectedTime.toLocaleTimeString()}`,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: 'missed-check-in',
    data: {
      type: 'missed-check-in',
      caregiverName,
      expectedTime: expectedTime.toISOString(),
      urgent: true,
    },
  };

  const promises = familyMemberIds.map((id) =>
    sendNotificationToFamilyMember(id, payload)
  );

  await Promise.all(promises);
}

/**
 * Generate VAPID keys (run this once and store in environment variables)
 */
export function generateVapidKeys() {
  const vapidKeys = webpush.generateVAPIDKeys();
  console.log('VAPID Public Key:', vapidKeys.publicKey);
  console.log('VAPID Private Key:', vapidKeys.privateKey);
  return vapidKeys;
}
