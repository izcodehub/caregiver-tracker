/**
 * Web Push Notification Utilities
 * Handles client-side push notification subscriptions
 */

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Converts a base64 string to Uint8Array
 * Required for VAPID key conversion
 */
function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as BufferSource;
}

/**
 * Checks if push notifications are supported in the current browser
 */
export function isPushNotificationSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Checks the current notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
  if (!isPushNotificationSupported()) {
    return 'denied';
  }
  return Notification.permission;
}

/**
 * Requests notification permission from the user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushNotificationSupported()) {
    throw new Error('Push notifications are not supported in this browser');
  }

  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Subscribes to push notifications
 * Returns the subscription data to be stored in the database
 */
export async function subscribeToPushNotifications(
  vapidPublicKey: string
): Promise<PushSubscriptionData> {
  if (!isPushNotificationSupported()) {
    throw new Error('Push notifications are not supported');
  }

  // Register service worker if not already registered
  let registration = await navigator.serviceWorker.getRegistration();

  if (!registration) {
    registration = await navigator.serviceWorker.register('/sw.js');
    // Wait for the service worker to be ready
    await navigator.serviceWorker.ready;
  }

  // Check if already subscribed
  let subscription = await registration.pushManager.getSubscription();

  // If not subscribed, create new subscription
  if (!subscription) {
    const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey,
    });
  }

  // Extract subscription details
  const subscriptionJson = subscription.toJSON();

  if (!subscriptionJson.endpoint || !subscriptionJson.keys?.p256dh || !subscriptionJson.keys?.auth) {
    throw new Error('Invalid subscription data');
  }

  return {
    endpoint: subscriptionJson.endpoint,
    p256dh: subscriptionJson.keys.p256dh,
    auth: subscriptionJson.keys.auth,
  };
}

/**
 * Unsubscribes from push notifications
 */
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  if (!isPushNotificationSupported()) {
    return false;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    return false;
  }

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return false;
  }

  const result = await subscription.unsubscribe();
  return result;
}

/**
 * Shows a test notification to verify notifications are working
 */
export async function showTestNotification(): Promise<void> {
  if (!isPushNotificationSupported()) {
    throw new Error('Push notifications are not supported');
  }

  if (Notification.permission !== 'granted') {
    throw new Error('Notification permission not granted');
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    throw new Error('Service worker not registered');
  }

  await registration.showNotification('Test Notification', {
    body: 'Notifications are working correctly!',
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    tag: 'test-notification',
  });
}
