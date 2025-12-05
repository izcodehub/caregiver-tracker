'use client';

import { useState, useEffect } from 'react';
import {
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  getNotificationPermission,
  requestNotificationPermission
} from '@/lib/webpush';

interface NotificationPermissionButtonProps {
  familyMemberId: string;
}

export default function NotificationPermissionButton({ familyMemberId }: NotificationPermissionButtonProps) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      const currentPermission = getNotificationPermission();
      setPermission(currentPermission);

      // Check if already subscribed
      if (currentPermission === 'granted' && 'serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          setIsSubscribed(!!subscription);
        } catch (err) {
          console.error('Error checking subscription:', err);
        }
      }
    };

    checkStatus();
  }, []);

  const handleSubscribe = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Request permission first
      const permissionResult = await requestNotificationPermission();

      if (permissionResult !== 'granted') {
        setError('Notification permission denied');
        setPermission(permissionResult);
        setIsLoading(false);
        return;
      }

      setPermission('granted');

      // Get VAPID public key from environment
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error('VAPID public key not configured');
      }

      // Subscribe to push notifications
      const subscriptionData = await subscribeToPushNotifications(vapidPublicKey);

      // Send subscription to server
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          familyMemberId,
          subscription: {
            endpoint: subscriptionData.endpoint,
            keys: {
              p256dh: subscriptionData.p256dh,
              auth: subscriptionData.auth,
            },
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save subscription');
      }

      setIsSubscribed(true);
    } catch (err: any) {
      console.error('Subscription error:', err);
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Unsubscribe from push manager
      const unsubscribed = await unsubscribeFromPushNotifications();

      if (!unsubscribed) {
        throw new Error('Failed to unsubscribe');
      }

      // Note: We would need the endpoint to send to the server for cleanup
      // For now, we just unsubscribe locally
      setIsSubscribed(false);
    } catch (err: any) {
      console.error('Unsubscribe error:', err);
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (permission === 'denied') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-800">
          Notifications are blocked. Please enable them in your browser settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-gray-900">
            Push Notifications
          </h3>
          <p className="text-sm text-gray-500">
            {isSubscribed
              ? 'You will receive notifications about caregiver check-ins'
              : 'Get notified when caregivers check in or out'}
          </p>
        </div>

        <button
          onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
          disabled={isLoading}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            isSubscribed
              ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isLoading ? 'Processing...' : isSubscribed ? 'Disable' : 'Enable'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {permission === 'default' && !isSubscribed && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            Click "Enable" to allow notifications from this app
          </p>
        </div>
      )}
    </div>
  );
}
