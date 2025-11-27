# 🏥 Caregiver Tracker

A modern, real-time web application for families to monitor caregiver attendance for elderly relatives living abroad. Built with Next.js 14, TypeScript, Supabase, and Tailwind CSS.

## 🎯 Problem Solved

Families with elderly relatives living abroad often face challenges:
- **No real-time visibility** into caregiver attendance
- **Manual reconciliation** of WhatsApp messages with end-of-month invoices
- **No verification** that caregivers are actually at the location
- **Discrepancies** between agency reports and actual attendance

This app provides a complete solution with QR code check-ins, real-time notifications, photo verification, geolocation tracking, and automatic reporting.

## ✨ Features

### For Caregivers
- 📱 **QR Code Check-in/out** - Scan QR code at elderly's home
- 📸 **Photo Capture** - Optional selfie verification on check-in
- 📍 **Geolocation Tracking** - Automatic location verification
- ⚡ **Fast & Simple** - Check in/out in under 30 seconds

### For Families
- 🔴 **Real-time Status** - See if caregiver is currently present
- ⏱️ **Live Dashboard** - View all check-ins instantly
- 📊 **Daily Hours Tracking** - Automatic calculation of hours worked
- ⚠️ **Discrepancy Alerts** - Flags missing check-outs or unusual patterns
- 📅 **Monthly Reports** - Filter by month and export to CSV
- 💾 **CSV Export** - Compare with agency invoices
- 🔄 **Real-time Updates** - Dashboard updates automatically using Supabase subscriptions

### Technical Features
- 🎨 **Modern UI** - Beautiful, responsive design with Tailwind CSS
- 🚀 **Real-time Database** - Supabase PostgreSQL with real-time subscriptions
- 📱 **Mobile-First** - Optimized for smartphones
- 🔒 **Secure** - Row-level security with Supabase
- 🆓 **100% Free** - All services on free tier (Supabase, Vercel)

## 🛠️ Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL + Real-time)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **QR Codes**: qrcode.react
- **Icons**: Lucide React
- **Date Handling**: date-fns
- **Deployment**: [Vercel](https://vercel.com/)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- A GitHub account
- A Supabase account (free tier)

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/caregiver-tracker.git
cd caregiver-tracker
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Supabase

1. Go to [https://supabase.com](https://supabase.com) and sign up (it's free!)
2. Create a new project
3. Go to **SQL Editor** in the Supabase dashboard
4. Copy and paste the entire contents of `supabase/schema.sql`
5. Click **Run** to create all tables and functions

### 4. Add Sample Data

In the Supabase SQL Editor, run this to create a sample elderly profile:

```sql
INSERT INTO elderly (name, qr_code, address, family_ids)
VALUES (
  'Grandma Maria',
  'grandma-maria-2024',
  '123 Main Street, Apartment 4B, Lisboa, Portugal',
  ARRAY[]::UUID[]
);
```

### 5. Configure Environment Variables

1. In Supabase, go to **Settings** → **API**
2. Copy your **Project URL** and **anon/public key**
3. Create a `.env.local` file in the project root:

```bash
cp .env.local.example .env.local
```

4. Edit `.env.local` and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 6. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📱 How to Use

### Setup for Each Elderly Person

1. Go to the **Dashboard** at `http://localhost:3000/dashboard`
2. You'll see a QR code for the elderly person
3. **Download the QR code** and print it
4. Place the printed QR code somewhere visible in the elderly person's home

### Caregiver Check-in Process

1. Caregiver arrives at the home
2. Opens phone camera and scans the QR code
3. Enters their name
4. Selects "Check In"
5. (Optional) Takes a selfie
6. Clicks "Submit Check In"

### Caregiver Check-out Process

1. Before leaving, caregiver scans the QR code again
2. Enters their name
3. Selects "Check Out"
4. Clicks "Submit Check Out"

### Family Monitoring

1. Open the dashboard at any time
2. See **real-time status**: Is the caregiver there right now?
3. View **check-in history** with timestamps and photos
4. Filter by month to see historical data
5. **Export to CSV** at the end of the month
6. Compare CSV with agency invoice

## 🌍 Deployment

### Deploy to Vercel (Free)

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "Import Project"
4. Select your GitHub repository
5. Add your environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL` (your Vercel URL)
6. Click "Deploy"

Your app will be live at `https://your-project.vercel.app`

### Update QR Codes After Deployment

After deploying, you need to regenerate QR codes:
1. Update `NEXT_PUBLIC_APP_URL` in Vercel to your production URL
2. Download new QR codes from the dashboard
3. Print and replace the old QR codes

## 🗂️ Project Structure

```
caregiver-tracker/
├── app/
│   ├── checkin/
│   │   └── [qrCode]/
│   │       └── page.tsx          # Check-in/out page
│   ├── dashboard/
│   │   └── page.tsx              # Family dashboard
│   └── page.tsx                  # Home (redirects to dashboard)
├── components/
│   └── QRCodeGenerator.tsx       # QR code component
├── lib/
│   └── supabase.ts               # Supabase client & types
├── supabase/
│   └── schema.sql                # Database schema
└── README.md
```

## 🔧 Advanced Configuration

### Adding Multiple Elderly Profiles

Run this SQL in Supabase for each additional person:

```sql
INSERT INTO elderly (name, qr_code, address)
VALUES (
  'Grandfather John',
  'grandfather-john-2024',
  '456 Oak Avenue, Porto, Portugal'
);
```

### Viewing Reports Programmatically

Use the built-in PostgreSQL function:

```sql
SELECT * FROM get_monthly_report(
  'elderly-uuid-here',
  11,  -- month
  2024 -- year
);
```

## 📊 Database Schema

### Tables

- **elderly** - Elderly persons being cared for
- **family_members** - Family members who monitor care
- **check_in_outs** - All check-in/out records

### Functions

- `get_current_status(elderly_uuid)` - Returns current caregiver status
- `get_monthly_report(elderly_uuid, month, year)` - Generates monthly attendance report

## 🐛 Troubleshooting

### QR Code Not Working

- Ensure `NEXT_PUBLIC_APP_URL` is set correctly
- Regenerate QR codes after changing the URL
- Check that the elderly record exists in Supabase

### Check-ins Not Appearing

- Open browser console and check for errors
- Verify Supabase connection in `.env.local`
- Check Supabase Row Level Security policies

### Real-time Updates Not Working

- Ensure Supabase real-time is enabled for `check_in_outs` table
- Check browser console for WebSocket errors
- Try refreshing the page

## 🤝 Contributing

Contributions welcome! Feel free to:
- Report bugs
- Suggest new features
- Submit pull requests

## 📄 License

MIT License - feel free to use this for personal or commercial projects.

## 🙏 Acknowledgments

Built with love to help families stay connected with their elderly relatives.
