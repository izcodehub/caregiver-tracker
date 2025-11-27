# 🚀 Caregiver Tracker - Complete Setup Guide

Welcome! This guide will walk you through setting up your caregiver tracking app from scratch.

## ⏱️ Time Required: ~15 minutes

---

## Step 1: Set Up Supabase (5 minutes)

### 1.1 Create Your Supabase Account

1. Go to [https://supabase.com](https://supabase.com)
2. Click **"Start your project"**
3. Sign up with GitHub (recommended) or email
4. It's **100% free** - no credit card required!

### 1.2 Create a New Project

1. Click **"New Project"**
2. Fill in:
   - **Name**: `caregiver-tracker`
   - **Database Password**: Create a strong password (save it somewhere safe!)
   - **Region**: Choose closest to your location
3. Click **"Create new project"**
4. Wait 2-3 minutes for setup to complete

### 1.3 Run the Database Schema

1. In your Supabase dashboard, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open the file `supabase/schema.sql` from this project
4. Copy ALL the content and paste it into the Supabase SQL Editor
5. Click **"Run"** (or press Ctrl+Enter / Cmd+Enter)
6. You should see: "Success. No rows returned"

### 1.4 Add Sample Data

Still in the SQL Editor, run this to create a test profile:

```sql
INSERT INTO elderly (name, qr_code, address, family_ids)
VALUES (
  'Test Grandparent',
  'test-qr-2024',
  '123 Test Street, City, Country',
  ARRAY[]::UUID[]
);
```

Click **"Run"** again.

### 1.5 Get Your API Credentials

1. Click **"Settings"** (gear icon) in the left sidebar
2. Click **"API"**
3. You'll see:
   - **Project URL** - Copy this!
   - **Project API keys** → **anon/public** - Copy this key!

---

## Step 2: Configure Your App (2 minutes)

### 2.1 Add Your Credentials

1. Open the file `.env.local` in your project folder
2. Replace the placeholder values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

3. Save the file

---

## Step 3: Run the App (1 minute)

### 3.1 Install Dependencies (if not already done)

```bash
npm install
```

### 3.2 Start the Development Server

```bash
npm run dev
```

### 3.3 Open Your Browser

Go to [http://localhost:3000](http://localhost:3000)

You should see the dashboard!

---

## Step 4: Test the System (5 minutes)

### 4.1 Download the QR Code

1. On the dashboard, you'll see a QR code
2. Click **"Download QR Code"**
3. The QR code PNG will download

### 4.2 Test Check-In on Your Phone

**Option A: If testing locally on the same WiFi**

1. Find your computer's local IP address:
   - Mac: System Preferences → Network
   - Windows: Open CMD, type `ipconfig`
   - Look for something like `192.168.1.xxx`
2. Update `.env.local`:
   ```env
   NEXT_PUBLIC_APP_URL=http://192.168.1.xxx:3000
   ```
3. Restart the dev server (`npm run dev`)
4. Re-download the QR code (important!)
5. Scan with your phone's camera

**Option B: Quick Test on Computer**

1. Right-click the QR code image
2. Open in new tab
3. Use an online QR code reader or your phone's camera
4. Click the link to open the check-in page

### 4.3 Complete a Check-In

1. Enter your name: "Test Caregiver"
2. Make sure "Check In" is selected (green)
3. (Optional) Click "Take Photo" and capture a selfie
4. Click **"Submit Check In"**
5. You should see "Checked In!" success message

### 4.4 View on Dashboard

1. Go back to the dashboard (refresh if needed)
2. You should see:
   - **Current Status**: "Caregiver Present"
   - **Current Caregiver**: "Test Caregiver"
   - Your check-in in the history

### 4.5 Test Check-Out

1. Scan the QR code again (or use the same link)
2. Enter the same name
3. Select "Check Out" (red)
4. Click **"Submit Check Out"**
5. Dashboard should update automatically!

---

## Step 5: Deploy to Production (Optional, 5 minutes)

### 5.1 Deploy to Vercel

1. Go to [https://vercel.com](https://vercel.com)
2. Sign up/login with GitHub
3. Click **"Add New"** → **"Project"**
4. Import your `caregiver-tracker` repository
5. Add Environment Variables:
   - Click **"Environment Variables"**
   - Add all three variables from `.env.local`:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `NEXT_PUBLIC_APP_URL` → Use `https://your-project.vercel.app` (Vercel will show this)
6. Click **"Deploy"**
7. Wait 2-3 minutes

### 5.2 Update App URL

1. After deployment, copy your Vercel URL (e.g., `https://caregiver-tracker.vercel.app`)
2. In Vercel dashboard:
   - Go to **Settings** → **Environment Variables**
   - Edit `NEXT_PUBLIC_APP_URL` to your Vercel URL
   - Click **"Save"**
3. Redeploy: Go to **Deployments** → Click **"..."** → **"Redeploy"**

### 5.3 Generate Production QR Codes

1. Visit your production URL
2. Download the QR codes again (they now point to production!)
3. Print and place at the elderly person's home

---

## 🎯 Real-World Usage

### For the Family

1. **Bookmark the dashboard** on your phone/computer
2. Check in daily or use the real-time updates
3. At month-end, click **"Export CSV"** to compare with agency invoice

### For the Caregiver

1. **Print the QR code** on sturdy paper
2. Place it somewhere visible (fridge, entrance, etc.)
3. **Scan on arrival** with phone camera
4. **Scan before leaving**

### Adding More Elderly People

In Supabase SQL Editor:

```sql
INSERT INTO elderly (name, qr_code, address)
VALUES (
  'Grandfather John',
  'grandfather-john-2024',
  '456 Different Street, City'
);
```

Then modify the dashboard to select between multiple profiles.

---

## 🐛 Common Issues

### "Invalid QR Code" Error

- Make sure you ran the SQL schema in Supabase
- Verify the sample data was inserted
- Check that `.env.local` has correct Supabase credentials

### Dashboard Shows "No Data Found"

- Verify you inserted sample elderly data in Supabase
- Check browser console for errors
- Ensure environment variables are set correctly

### Check-ins Not Showing Up

- Open browser console (F12) and look for errors
- Verify Supabase credentials in `.env.local`
- Make sure the Supabase project is not paused (free tier pauses after 7 days of inactivity)

### Camera Not Working

- Grant camera permissions in browser settings
- Try on a different device/browser
- Photo is optional - you can skip it

---

## 🎓 Next Steps

1. **Customize the app** for your needs
2. **Add multiple elderly profiles**
3. **Set up notifications** (requires additional setup)
4. **Print professional QR codes** (laminate them!)
5. **Share dashboard link** with family members

---

## 💡 Tips for Best Results

- **Laminate the QR code** so it lasts longer
- **Place QR code at eye level** near the entrance
- **Train the caregiver** on how to use it (show them once)
- **Check the dashboard weekly** to ensure consistency
- **Export monthly reports** before the invoice arrives

---

## 📞 Need Help?

- Check the main [README.md](./README.md) for troubleshooting
- Open an issue on GitHub
- Review Supabase documentation: [https://supabase.com/docs](https://supabase.com/docs)

---

**You're all set! 🎉**

Your caregiver tracking system is now ready to use. No more manual WhatsApp reconciliation!
