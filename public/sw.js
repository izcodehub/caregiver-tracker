/**
 * Service Worker for Push Notifications
 * Handles incoming push notifications and displays them to the user
 */

self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(self.clients.claim());
});

// Handle push notification events
self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);

  let data = {
    title: 'Caregiver Tracker',
    body: 'You have a new notification',
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    tag: 'caregiver-notification',
  };

  // Parse notification data if available
  if (event.data) {
    try {
      const payload = event.data.json();
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        badge: payload.badge || data.badge,
        tag: payload.tag || data.tag,
        data: payload.data || {},
      };
    } catch (e) {
      console.error('Error parsing push notification data:', e);
      data.body = event.data.text();
    }
  }

  // Show the notification
  const promiseChain = self.registration.showNotification(data.title, {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    data: data.data,
    requireInteraction: false,
    vibrate: [200, 100, 200],
  });

  event.waitUntil(promiseChain);
});

// Handle notification click events
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);

  event.notification.close();

  // Open the app or focus existing window
  const urlToOpen = event.notification.data?.url || '/';

  const promiseChain = clients
    .matchAll({
      type: 'window',
      includeUncontrolled: true,
    })
    .then((windowClients) => {
      // Check if there's already a window open
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    });

  event.waitUntil(promiseChain);
});

// Handle notification close events (for analytics if needed)
self.addEventListener('notificationclose', (event) => {
  console.log('Notification closed:', event);
});
