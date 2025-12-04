# PWA Setup Guide

Your Caregiver Tracker app is now configured as a Progressive Web App (PWA)!

## What's Been Configured

### 1. PWA Package
- **next-pwa** installed and configured
- Service worker automatically generated during production builds
- Offline caching enabled

### 2. Web App Manifest
- Location: `public/manifest.json`
- App name: "Caregiver Tracker"
- Theme color: Blue (#3b82f6)
- Display mode: Standalone (fullscreen app experience)
- Icons: 8 different sizes for all devices

### 3. Icons
- Generated from `public/icon.svg`
- Sizes: 72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512
- All icons stored in `public/icons/`

### 4. Configuration Files Modified
- `next.config.ts` - PWA plugin configuration
- `app/layout.tsx` - PWA metadata and Apple touch icons
- `.gitignore` - Service worker files excluded from git

## How to Test the PWA

### Development Mode
PWA features are **disabled** in development mode to avoid caching issues.

### Production Mode

1. **Build the app:**
   ```bash
   npm run build
   ```

2. **Start production server:**
   ```bash
   npm start
   ```

3. **Test in browser:**
   - Open http://localhost:3000 in Chrome/Edge/Safari
   - Look for an install icon in the address bar
   - Click to install the app
   - The app will be added to your home screen/app drawer

### Mobile Testing

1. **Deploy to production** (Vercel, Netlify, etc.)
2. **Open on mobile device** using HTTPS URL
3. **Install prompt** will appear automatically
4. **Test offline:** Close browser, open installed app with wifi off

## PWA Features

✅ **Installable** - Add to home screen on mobile and desktop
✅ **Offline Ready** - Works without internet connection
✅ **Fast Loading** - Assets cached for instant loading
✅ **App-like Experience** - Runs in standalone window
✅ **Auto-Updates** - Service worker updates automatically

## Customization

### Change App Icon
1. Edit `public/icon.svg` with your design
2. Run: `npm run generate-icons`
3. Icons will be regenerated in all sizes

### Change App Name/Colors
Edit `public/manifest.json`:
```json
{
  "name": "Your App Name",
  "short_name": "Short Name",
  "theme_color": "#your-color",
  "background_color": "#your-color"
}
```

### Modify Caching Strategy
Edit `next.config.ts` to customize the PWA settings:
```typescript
withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  // Add more options as needed
})
```

## Deployment Notes

- PWAs require **HTTPS** in production
- Service workers only work over HTTPS (except localhost)
- Most hosting platforms (Vercel, Netlify) provide HTTPS by default

## Troubleshooting

### "Install" button doesn't appear
- Ensure you're using HTTPS (or localhost)
- Check browser console for PWA errors
- Verify manifest.json is accessible at /manifest.json
- Make sure all required icons exist

### Service worker not updating
- Service workers cache aggressively
- Use browser DevTools > Application > Service Workers
- Click "Unregister" to force refresh
- Clear site data and reload

### Icons not showing
- Verify icons exist in `public/icons/`
- Check browser console for 404 errors
- Run `npm run generate-icons` to regenerate

## Resources

- [Next PWA Documentation](https://github.com/shadowwalker/next-pwa)
- [PWA Builder](https://www.pwabuilder.com/)
- [Web.dev PWA Guide](https://web.dev/progressive-web-apps/)
