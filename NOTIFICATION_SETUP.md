# Push Notification Setup Guide

This guide will help you set up push notifications for the Caregiver Tracker application.

## Overview

The notification system allows family members to receive real-time push notifications when caregivers check in or out. It uses Web Push API with VAPID authentication.

## Prerequisites

- Modern browser that supports Push API (Chrome, Firefox, Edge, Safari 16+)
- HTTPS connection (required for service workers and push notifications)
- Node.js environment with web-push library installed

## Setup Steps

### 1. Generate VAPID Keys

VAPID (Voluntary Application Server Identification) keys are required for web push authentication. Run this command once to generate your keys:

```bash
npx web-push generate-vapid-keys
```

This will output:
```
Public Key: [your-public-key]
Private Key: [your-private-key]
```

**Important:** Save these keys securely. You'll need them in the next step.

### 2. Configure Environment Variables

Add the following environment variables to your `.env.local` file:

```env
# VAPID Keys for Push Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-public-key-here
VAPID_PRIVATE_KEY=your-private-key-here
VAPID_SUBJECT=mailto:your-email@example.com
```

Replace:
- `your-public-key-here` with the public key from step 1
- `your-private-key-here` with the private key from step 1
- `your-email@example.com` with your contact email

**Note:** The public key needs to be prefixed with `NEXT_PUBLIC_` so it's accessible in the browser.

### 3. Run Database Migration

Apply the database migration to create the required tables:

```bash
# Using Supabase CLI
supabase db push

# Or apply the migration file manually
psql -h your-db-host -U postgres -d your-db-name -f supabase/migration_add_push_notifications.sql
```

This creates:
- `push_subscriptions` table - stores notification subscriptions
- `notification_logs` table - logs notification delivery

### 4. Register Service Worker

The service worker is already created at `/public/sw.js`. To register it, add this code to your root layout or main app component:

```typescript
// app/layout.tsx or similar
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration);
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
  }
}, []);
```

### 5. Add Notification Permission UI

Add the NotificationPermissionButton component to your family member settings or dashboard:

```tsx
import NotificationPermissionButton from '@/components/NotificationPermissionButton';

// In your component
<NotificationPermissionButton familyMemberId={familyMember.id} />
```

### 6. Update Family Member Preferences

Update the family member's notification preferences in the database:

```sql
UPDATE family_members
SET notification_preferences = jsonb_set(
  COALESCE(notification_preferences, '{}'::jsonb),
  '{push_enabled}',
  'true'
)
WHERE id = 'your-family-member-id';
```

Or provide a UI toggle in your settings page.

## Testing Notifications

### Test in Development

1. Start your development server with HTTPS:
   ```bash
   npm run dev
   ```

2. Open your app in a browser and click "Enable" on the notification button

3. Grant notification permissions when prompted

4. Trigger a check-in event (either through your app or API)

5. You should receive a notification

### Manual Test via API

You can test notifications manually using the notification service:

```typescript
import { sendNotificationToFamilyMember } from '@/lib/push-notification-service';

await sendNotificationToFamilyMember('family-member-id', {
  title: 'Test Notification',
  body: 'This is a test notification',
  icon: '/icons/icon-192x192.png',
});
```

## Troubleshooting

### Notifications Not Working

1. **Check VAPID keys**: Ensure environment variables are set correctly
2. **Check permissions**: Verify browser granted notification permission
3. **Check HTTPS**: Service workers require HTTPS (except on localhost)
4. **Check service worker**: Open DevTools > Application > Service Workers
5. **Check console**: Look for errors in browser console

### Service Worker Issues

- Clear service worker cache: DevTools > Application > Service Workers > Unregister
- Check service worker is active: DevTools > Application > Service Workers
- Verify service worker file is accessible at `/sw.js`

### Subscription Errors

- Check if subscription already exists in `push_subscriptions` table
- Verify family member ID is correct
- Check API endpoint responses in Network tab

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Requires iOS 16.4+ / macOS 13.1+
- Opera: Full support

## Security Considerations

1. **VAPID Keys**: Keep private key secret, never commit to repository
2. **HTTPS**: Always use HTTPS in production
3. **Authentication**: Only authenticated users can subscribe
4. **Rate Limiting**: Consider implementing rate limits on notification endpoints

## Notification Types

The system supports three types of notifications:

1. **Check-in Notifications**: Sent when caregiver checks in
2. **Check-out Notifications**: Sent when caregiver checks out
3. **Missed Check-in Alerts**: Sent when expected check-in doesn't occur (optional)

## Customization

### Modify Notification Content

Edit notification templates in `/lib/push-notification-service.ts`:

```typescript
export async function sendCheckInNotification(
  caregiverName: string,
  familyMemberIds: string[],
  checkInTime: Date,
  elderlyCareRecipientName: string
): Promise<void> {
  const payload: NotificationPayload = {
    title: `${caregiverName} checked in`, // Customize here
    body: `Your custom message`, // Customize here
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: 'check-in',
    data: {
      type: 'check-in',
      caregiverName,
      timestamp: checkInTime.toISOString(),
    },
  };
  // ...
}
```

### Add Custom Icons

Place custom notification icons in `/public/icons/`:
- `icon-192x192.png` - Main notification icon
- `badge-72x72.png` - Badge icon (small icon in notification tray)

## Production Deployment

Before deploying to production:

1. Set production VAPID keys in deployment environment variables
2. Ensure HTTPS is configured
3. Test notifications on production domain
4. Monitor notification delivery logs in `notification_logs` table
5. Set up error monitoring for failed notifications

## API Reference

### Subscribe Endpoint
```
POST /api/notifications/subscribe
Body: { subscription: PushSubscription, familyMemberId: string }
```

### Unsubscribe Endpoint
```
POST /api/notifications/unsubscribe
Body: { endpoint: string, familyMemberId: string }
```

### Send Notification (Server-side)
```typescript
import { sendNotificationToFamilyMember } from '@/lib/push-notification-service';

await sendNotificationToFamilyMember(familyMemberId, {
  title: 'Title',
  body: 'Body',
  icon: '/icon.png',
  data: { custom: 'data' }
});
```

## Support

For issues or questions:
1. Check browser console for errors
2. Verify database schema matches migration
3. Check service worker status
4. Review notification permissions
5. Contact support with error logs if needed
