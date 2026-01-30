# Caregiver Tracker - Project Status

**Last Updated:** January 18, 2026

## Project Overview

A Next.js application for tracking caregiver check-ins and check-outs for elderly care beneficiaries. The system supports NFC card/QR code scanning for authentication, tracks hours worked, calculates rates with holiday/time-of-day majorations, and generates PDF reports.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Database:** Supabase (PostgreSQL)
- **Styling:** Tailwind CSS
- **PDF Generation:** jsPDF + jspdf-autotable
- **Date/Time:** date-fns, date-fns-tz
- **Authentication:** NFC cards + QR codes with secret validation

## Project Structure

```
caregiver-tracker/
├── app/
│   ├── api/
│   │   ├── nfc/
│   │   │   ├── challenge/route.ts        # NFC/QR validation endpoint
│   │   │   └── submit/route.ts           # Check-in/out submission
│   │   └── check-ins/
│   │       └── [beneficiaryId]/route.ts  # Fetch check-in data
│   ├── checkin/
│   │   └── page.tsx                      # NFC/QR check-in page
│   ├── dashboard/
│   │   └── [beneficiaryId]/page.tsx      # Main dashboard
│   └── layout.tsx
├── components/
│   ├── CaregiverBreakdown.tsx            # Hours breakdown by caregiver
│   ├── CheckInHistory.tsx                # Timeline of check-ins/outs
│   ├── DailyNotesCalendar.tsx            # Calendar with notes
│   └── FinancialSummary.tsx              # Financial totals
├── lib/
│   ├── supabase.ts                       # Supabase client
│   ├── pdf-export.ts                     # PDF generation logic
│   ├── holiday-rates.ts                  # Holiday/time-based rate calculations
│   ├── time-utils.ts                     # Time formatting utilities
│   └── caregiver-colors.ts               # Color assignment for caregivers
├── contexts/
│   └── LanguageContext.tsx               # i18n (French/English)
└── migrations/
    └── supabase/                         # Database migration files
```

## Database Schema

### `beneficiaries`
- `id` (uuid, PK)
- `name` (text)
- `qr_code` (text, unique)
- `nfc_secret` (text) - Shared secret for NFC/QR validation
- `regular_rate` (numeric) - Base hourly rate (maintained for backward compatibility)
- `currency` (text, default: 'EUR')
- `copay_percentage` (numeric) - Co-payment percentage
- `timezone` (text, default: 'Europe/Paris')
- `created_at` (timestamp)

### `beneficiary_rate_history`
- `id` (uuid, PK)
- `beneficiary_id` (uuid, FK) - Reference to beneficiary
- `rate` (numeric) - Regular hourly rate (before VAT)
- `effective_date` (date) - Date when this rate becomes active
- `created_at` (timestamp) - Audit trail
- **Purpose:** Stores time-based rate history, allowing different rates at different time periods
- **Usage:** System automatically applies the correct historical rate based on check-in date

### `check_ins`
- `id` (uuid, PK)
- `beneficiary_id` (uuid, FK)
- `caregiver_name` (text)
- `action` ('check-in' | 'check-out')
- `timestamp` (timestamp)
- `photo_url` (text, optional)
- `latitude` (numeric, optional)
- `longitude` (numeric, optional)
- `is_training` (boolean, default: false) - For training hours (not billed)
- `created_at` (timestamp)

### `daily_notes`
- `id` (uuid, PK)
- `beneficiary_id` (uuid, FK)
- `date` (date)
- `note_type` (text) - 'complaint', 'no-show', 'late-arrival', 'modification', 'cancellation', 'general', 'special_instruction'
- `reason` (text)
- `created_by` (text, optional)
- `created_at` (timestamp)
- `updated_at` (timestamp)

## Key Features

### 1. **NFC/QR Code Check-In System**
- Location: `/app/checkin/page.tsx`
- Flow:
  1. Scan NFC card or QR code
  2. Extract QR code and secret
  3. Call `/api/nfc/challenge` to validate
  4. Get challenge token
  5. Display form with caregiver selection
  6. Submit check-in/out via `/api/nfc/submit`
- **Important:** Uses beneficiary's timezone for all timestamps

### 2. **Holiday & Time-Based Rate System**
- Location: `/lib/holiday-rates.ts`
- **Rate Rules:**
  - **Regular Rate:** Weekdays 8 AM - 8 PM (beneficiary's local time)
  - **25% Majoration:** Weekdays before 8 AM or after 8 PM, Sundays, regular holidays
  - **100% Majoration:** May 1st and December 25th (all hours)
- **French Public Holidays:**
  - January 1 (New Year)
  - May 1 (Labor Day) - 100%
  - May 8 (Victory Day)
  - July 14 (Bastille Day)
  - August 15 (Assumption)
  - November 1 (All Saints)
  - November 11 (Armistice)
  - December 25 (Christmas) - 100%
- **Critical:** All date/time checks use `formatInTimeZone()` to ensure beneficiary's local timezone is used, not browser's timezone

### 3. **PDF Export System**
- Location: `/lib/pdf-export.ts`
- **Two PDF types:**
  1. **Financial Summary:** Breakdown by rate type with VAT calculations
  2. **Detailed Check-ins:** Full history with financial summary appended
- **Table Structure:**
  - All tables have equal left/right margins (14mm)
  - Consistent column widths across similar tables
  - Total table width: 182mm
  - Column widths:
    - Hour tables (4-col): 70 + 32 + 40 + 40 = 182
    - Financial summary: 65 + 37 + 37 + 43 = 182
    - Training/Notes (2-col): 70 + 112 or 112 + 70 = 182
    - Check-in history: 70 + 37 + 37 + 38 = 182

### 4. **Timezone Handling**
- **Critical Implementation Detail:** All calculations use beneficiary's timezone
- Uses `date-fns-tz` library with `toZonedTime()` and `formatInTimeZone()`
- Ensures correct rate calculations regardless of user's browser location
- Example: 7am-10am Paris = 1h at 25% (7-8am) + 2h regular (8-10am), even when viewed from NYC

### 5. **Multilingual Support**
- French (default) and English
- Context: `/contexts/LanguageContext.tsx`
- All UI components support both languages
- PDF exports include language parameter

## Recent Updates (January 2026)

### Time-Based Rate System (January 30, 2026)
- **Added:** Full support for time-based rates that change over different periods
- **Database:** New `beneficiary_rate_history` table to store rates with effective dates
- **Features:**
  - Rates are automatically applied based on check-in date
  - Historical check-ins use the rate that was effective at that time
  - Support for multiple rate changes over time
  - Backward compatible with existing single-rate system
- **Files:**
  - Database: `supabase/migration_add_rate_history.sql`
  - Types: `lib/supabase.ts` (BeneficiaryRateHistory type)
  - Utilities: `lib/rate-utils.ts` (getRateForDate, groupCheckInsByRate, calculateCostForDate)
  - Components: `components/CaregiverBreakdown.tsx`
  - Exports: `lib/export.ts`, `lib/pdf-export.ts`
  - UI: `app/dashboard/[beneficiaryId]/page.tsx`
- **Example Use Case:** Brigitte Germe's rate increased from existing rate to €25/h TTC (€23.70/h HT) on January 1st, 2026
- **Migration:** `supabase/migration_add_brigitte_rate_history.sql`

### Timezone Fixes
- **Issue:** Holiday detection (May 1, Dec 25) failed when viewing from different timezones
- **Fix:** Changed from `format(date, 'yyyy-MM-dd')` to `formatInTimeZone(date, timezone, 'yyyy-MM-dd')`
- **Files:** `components/CaregiverBreakdown.tsx`
- **Commit:** d5220e0

### Time-of-Day Rate System
- **Added:** Split shifts crossing 8 AM and 8 PM boundaries
- **Logic:** Convert to beneficiary's local time, then calculate minutes in each period
- **Files:** `lib/holiday-rates.ts`, `components/CaregiverBreakdown.tsx`, `lib/pdf-export.ts`
- **Commit:** cd8966d, 7092467

### Sunday Detection
- **Added:** Sunday detection to `getHolidayMajoration()`
- **Removed:** Redundant Sunday check in CaregiverBreakdown
- **Commit:** 9d82254

### PDF Table Alignment
- **Added:** Explicit column widths and alignment for all tables
- **Ensured:** All tables span full page width with equal margins
- **Files:** `lib/pdf-export.ts`
- **Commit:** d0fe669, d5220e0

### Android NFC Timestamp Fix
- **Issue:** Android showed "expired timestamp" error on tap
- **Fix:** Adjusted timestamp validation to allow -5 to +30 seconds (clock drift tolerance)
- **File:** `app/api/nfc/challenge/route.ts`

### Console Log Cleanup
- **Removed:** Excessive console.log statements from JSX render logic
- **File:** `app/checkin/page.tsx`
- **Commit:** 593d94a

## Important Implementation Notes

### 1. **Timestamp Validation**
- Check-in timestamps must be within -5 to +30 seconds of server time
- Allows for clock drift between client and server
- Location: `/app/api/nfc/challenge/route.ts:34`

### 2. **Training Hours**
- Marked with `is_training: true` flag
- Not included in billing calculations
- Tracked separately in financial summaries
- Always show in PDFs (even if 0 hours)

### 3. **Financial Calculations**
- VAT: 5.5% applied to all amounts
- Co-payment: Calculated on pre-VAT amounts
- Coverage = Total - Co-payment
- All monetary values use 2 decimal places

### 4. **Color Assignment**
- Caregivers assigned colors based on hash of their name
- Ensures consistent colors across sessions
- Colors stored in Map for performance
- Location: `/lib/caregiver-colors.ts`

### 5. **Date Grouping**
- Check-ins grouped by date in beneficiary's timezone
- Uses `formatInTimeZone(timestamp, timezone, 'yyyy-MM-dd')`
- Critical for correct daily totals

### 6. **Time-Based Rate System**
- Rates can vary by date using the `beneficiary_rate_history` table
- System automatically selects the correct rate for each check-in based on its date
- Rate lookup: Uses `getRateForDate(rateHistory, checkInDate, fallbackRate, timezone)`
- **Backward Compatibility:** If no rate history exists, falls back to `beneficiaries.regular_rate`
- **Majored Rates:** +25% and +100% rates are calculated dynamically from the base rate
- **Example:** A check-in on 2025-12-15 uses the rate effective on that date, while a check-in on 2026-01-15 uses the new rate
- **Location:** `/lib/rate-utils.ts`

## Known Limitations

1. **No authentication system** - Direct access to beneficiary pages via URL
2. **No user roles** - All users have full access
3. **No audit trail** - No tracking of who made changes
4. **No data backup** - Relies on Supabase backups
5. **No mobile app** - Web-only (PWA possible)

## Potential Future Features

### Planned (Not Implemented)
- [ ] WhatsApp notifications to family members
- [ ] Email reports
- [ ] Multi-beneficiary family accounts
- [ ] Caregiver profiles and credentials
- [ ] Shift scheduling
- [ ] Medication tracking
- [ ] Photo gallery per beneficiary
- [ ] Document storage
- [ ] Mobile app (React Native)

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Running the Project

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Deployment

- Deployed on Vercel (or similar Next.js hosting)
- Database hosted on Supabase
- No special server requirements (serverless functions)

## Git Repository

- Remote: https://github.com/izcodehub/caregiver-tracker.git
- Branch: main

## Critical Code Patterns

### 1. Timezone-Aware Date Formatting
```typescript
// ❌ WRONG - Uses browser timezone
const dateStr = format(date, 'yyyy-MM-dd');

// ✅ CORRECT - Uses beneficiary's timezone
const dateStr = formatInTimeZone(date, timezone, 'yyyy-MM-dd');
```

### 2. Holiday Rate Checking
```typescript
const dateStr = formatInTimeZone(start, timezone, 'yyyy-MM-dd');
const majoration = getHolidayMajoration(dateStr);

if (majoration === 1.0) {
  // 100% majoration (May 1, Dec 25)
} else if (majoration === 0.25) {
  // 25% majoration (holidays, Sundays)
} else {
  // Regular weekday - check time of day
}
```

### 3. Time-of-Day Splitting
```typescript
// Convert to beneficiary's local time
const startLocal = toZonedTime(start, timezone);
const endLocal = toZonedTime(end, timezone);

// Create boundaries
const morningStart = new Date(startLocal);
morningStart.setHours(8, 0, 0, 0);
const eveningStart = new Date(startLocal);
eveningStart.setHours(20, 0, 0, 0);

// Calculate minutes in each period
// ... (see CaregiverBreakdown.tsx or pdf-export.ts for full logic)
```

## Support

For questions or issues, contact the development team or refer to the codebase comments.
