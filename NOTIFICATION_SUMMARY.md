# Push Notifications - Quick Start

## What Was Created

### Database
- `supabase/migration_add_push_notifications.sql` - Database tables for storing subscriptions and logs

### Server-Side Files
- `lib/push-notification-service.ts` - Server-side service for sending notifications
- `app/api/notifications/subscribe/route.ts` - API endpoint to subscribe
- `app/api/notifications/unsubscribe/route.ts` - API endpoint to unsubscribe
- `app/api/checkin/nfc/route.ts` - Updated to send notifications on check-in/out

### Client-Side Files
- `lib/webpush.ts` - Client utilities for managing push subscriptions
- `components/NotificationPermissionButton.tsx` - UI component for permission requests
- `public/sw.js` - Service worker for handling push notifications

### Setup Files
- `scripts/generate-vapid-keys.js` - Script to generate VAPID keys
- `.env.local.example` - Updated with VAPID key variables
- `NOTIFICATION_SETUP.md` - Complete setup guide

## Quick Setup (5 Steps)

### 1. Generate VAPID Keys
```bash
node scripts/generate-vapid-keys.js
```

### 2. Add Keys to `.env.local`
```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-public-key
VAPID_PRIVATE_KEY=your-private-key
VAPID_SUBJECT=mailto:your-email@example.com
```

### 3. Run Database Migration
```bash
supabase db push
# OR
psql -h host -U user -d db -f supabase/migration_add_push_notifications.sql
```

### 4. Register Service Worker
Add to your root layout (if not already there):
```typescript
// app/layout.tsx
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
}, []);
```

### 5. Add UI Component
Add notification permission button to settings page:
```tsx
import NotificationPermissionButton from '@/components/NotificationPermissionButton';

<NotificationPermissionButton familyMemberId={member.id} />
```

## How It Works

1. **User subscribes**: Family member clicks "Enable" button
2. **Browser requests permission**: Browser shows native permission dialog
3. **Subscription stored**: Push subscription saved to database
4. **Caregiver checks in**: When caregiver uses NFC/QR to check in
5. **Notification sent**: Server sends push notification to subscribed family members
6. **Family member notified**: Browser displays notification even if app is closed

## Testing

### Test Subscription
1. Click "Enable" on notification button
2. Grant permission when prompted
3. Check `push_subscriptions` table for new entry

### Test Notification
1. Perform a caregiver check-in via your app
2. Notification should appear on subscribed devices
3. Check browser console for any errors
4. Check `notification_logs` table for delivery status

## Notification Flow

```
Caregiver Check-in
    ↓
API: /api/checkin/nfc
    ↓
Query: Get family members with push_enabled=true
    ↓
Service: sendCheckInNotification()
    ↓
Query: Get push_subscriptions for family members
    ↓
web-push: Send to each subscription
    ↓
Service Worker: Receive and display notification
    ↓
User: See notification
```

## Customization

### Change Notification Content
Edit `lib/push-notification-service.ts`:
```typescript
const payload: NotificationPayload = {
  title: 'Your Custom Title',
  body: 'Your custom message',
  icon: '/your-icon.png',
};
```

### Add More Notification Types
1. Create new function in `lib/push-notification-service.ts`
2. Call it from relevant API routes
3. Define notification payload structure

### Modify Icons
Replace files in `/public/icons/`:
- `icon-192x192.png` - Main notification icon
- `badge-72x72.png` - Small badge icon

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No notifications appearing | Check VAPID keys, permissions, HTTPS |
| Service worker not registering | Verify `/sw.js` exists and is accessible |
| Subscription fails | Check browser console, verify API endpoints |
| Old subscriptions not working | Service worker auto-removes expired ones |

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Yes | Public VAPID key (client-side) |
| `VAPID_PRIVATE_KEY` | Yes | Private VAPID key (server-side) |
| `VAPID_SUBJECT` | Yes | Contact email for push service |

## Browser Support

- ✅ Chrome/Edge (Desktop & Mobile)
- ✅ Firefox (Desktop & Mobile)
- ✅ Safari (iOS 16.4+, macOS 13.1+)
- ✅ Opera (Desktop & Mobile)

## Security Notes

1. **HTTPS Required**: Service workers need HTTPS (localhost is OK for development)
2. **Keep Private Key Secret**: Never commit `VAPID_PRIVATE_KEY` to git
3. **Authentication Required**: Only authenticated users can subscribe
4. **Subscription Validation**: Expired subscriptions auto-removed

## Next Steps

- [ ] Generate VAPID keys
- [ ] Add keys to environment variables
- [ ] Run database migration
- [ ] Register service worker
- [ ] Add notification UI to app
- [ ] Test with real check-in
- [ ] Deploy to production with HTTPS

## Need Help?

See `NOTIFICATION_SETUP.md` for detailed setup instructions and troubleshooting.
