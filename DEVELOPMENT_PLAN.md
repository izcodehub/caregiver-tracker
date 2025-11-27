# 🚀 Caregiver Tracker - Development Plan

## Current Status: Phase 1 Complete ✅
- ✅ Basic app deployed and working
- ✅ QR code check-in/out system
- ✅ Real-time dashboard
- ✅ Supabase + Vercel setup complete
- ✅ Photo capture working
- ✅ Production URL: https://caregiver-tracker-iz.vercel.app

---

## Business Requirements

### Pricing Structure
- **Regular rate:** €24.58/hour
- **Holiday rate:** €24.58 × 1.25 + €6.15 = **€36.88/hour**

### Holiday Definition
Hours are considered "holiday" when they occur during:
1. **French public holidays** (11 per year):
   - January 1 (New Year's Day)
   - Easter Monday (varies)
   - May 1 (Labour Day)
   - May 8 (Victory in Europe Day)
   - Ascension Thursday (varies, 39 days after Easter)
   - Whit Monday (varies, 50 days after Easter)
   - July 14 (Bastille Day)
   - August 15 (Assumption of Mary)
   - November 1 (All Saints' Day)
   - November 11 (Armistice Day)
   - December 25 (Christmas Day)

2. **All Sundays** (every week)

3. **Evening hours:** After 8:00 PM (20:00) until midnight
   - Example: 6 PM - 10 PM shift = 2h regular (6-8 PM) + 2h holiday (8-10 PM)
   - Holiday hours are calculated from 8 PM onwards, not the entire shift

### Dashboard Requirements

#### Admin Dashboard (Developer Access)
- View all clients at once
- Select individual client for detailed view
- Calendar view showing daily hours
- Per-caregiver breakdown by name
- Regular vs holiday hours split
- Financial summary with EUR amounts
- Export to CSV and PDF
- Access current and past months

#### Family Dashboard (Per Client)
- Unique URL per family
- Only see their own elderly person's data
- Same detailed views as admin
- Calendar view per day
- Per-caregiver breakdown
- Financial summary
- Export to CSV and PDF
- Access current and past months

### Export Format
- **NOT an invoice** - a financial summary/report
- Should include:
  - Client name and period
  - Per-caregiver breakdown:
    - Caregiver name
    - Regular hours (decimal format, e.g., 85.5h)
    - Holiday hours (decimal format)
    - Regular amount (€)
    - Holiday amount (€)
    - Subtotal per caregiver (€)
  - Total for period (€)
- Available formats: CSV and PDF

---

## Implementation Phases

### Phase 1: Photo Storage Migration ⏳
**Goal:** Move photos from database to Supabase Storage to save space

**Tasks:**
1. Create Supabase Storage bucket for photos
2. Update check-in page to upload photos to storage
3. Get photo URL from storage
4. Store only URL in database (not base64)
5. Update dashboard to display photos from storage URLs

**Files to modify:**
- `app/checkin/[qrCode]/page.tsx`
- `app/dashboard/page.tsx`
- `lib/supabase.ts` (add storage helper functions)

**Supabase Setup:**
```sql
-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('caregiver-photos', 'caregiver-photos', true);

-- Set storage policies
CREATE POLICY "Anyone can upload photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'caregiver-photos');

CREATE POLICY "Anyone can view photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'caregiver-photos');
```

**Benefits:**
- Saves database space (500MB free tier)
- Faster queries
- 1GB storage free on Supabase

---

### Phase 2: Multi-Client Infrastructure
**Goal:** Update database and dashboard to support multiple clients with pricing

**Tasks:**
1. Add pricing fields to `elderly` table
2. Add rate configuration (regular + holiday rates)
3. Update dashboard to accept `elderlyId` parameter
4. Create client selector component

**Database Changes:**
```sql
-- Add pricing columns to elderly table
ALTER TABLE elderly ADD COLUMN regular_rate DECIMAL(10, 2) DEFAULT 24.58;
ALTER TABLE elderly ADD COLUMN holiday_rate DECIMAL(10, 2) DEFAULT 36.88;
ALTER TABLE elderly ADD COLUMN currency TEXT DEFAULT 'EUR';
```

**New Routes:**
- `/dashboard/[elderlyId]` - Individual client dashboard
- `/admin` - Admin overview (all clients)

**Files to create/modify:**
- `app/dashboard/[elderlyId]/page.tsx` - Individual dashboard
- `app/admin/page.tsx` - Admin panel
- `components/ClientSelector.tsx`

---

### Phase 3: Holiday Detection System
**Goal:** Detect and flag holiday hours automatically

**Tasks:**
1. Create French holidays database/function
2. Create Sunday detection
3. Create evening hours detection (after 8 PM)
4. Update check-in records with holiday flag

**Database Changes:**
```sql
-- Add holiday tracking
ALTER TABLE check_in_outs ADD COLUMN is_holiday_hours BOOLEAN DEFAULT false;

-- Create function to check if datetime is holiday
CREATE OR REPLACE FUNCTION is_holiday_time(check_time TIMESTAMPTZ)
RETURNS BOOLEAN AS $$
DECLARE
  check_date DATE := check_time::DATE;
  check_hour INTEGER := EXTRACT(HOUR FROM check_time);
  day_of_week INTEGER := EXTRACT(DOW FROM check_time); -- 0=Sunday
BEGIN
  -- Check if Sunday
  IF day_of_week = 0 THEN
    RETURN true;
  END IF;

  -- Check if after 8 PM (20:00)
  IF check_hour >= 20 THEN
    RETURN true;
  END IF;

  -- Check French public holidays
  -- (we'll add specific dates here)

  RETURN false;
END;
$$ LANGUAGE plpgsql;
```

**French Holidays Table:**
```sql
CREATE TABLE french_holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_recurring BOOLEAN DEFAULT false, -- false for fixed dates like Jan 1
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert fixed holidays for 2024-2026
-- Will need to calculate Easter-based holidays
```

**Files to create:**
- `lib/holidays.ts` - Holiday calculation logic
- `lib/billing.ts` - Billing calculations

---

### Phase 4: Billing Calculator
**Goal:** Calculate hours and amounts with regular vs holiday split

**Tasks:**
1. Create function to split check-in/out into regular and holiday hours
2. Calculate amounts per caregiver
3. Aggregate by caregiver name per client
4. Handle shifts that cross 8 PM boundary

**Algorithm Example:**
```typescript
// Check-in: 6:00 PM (18:00)
// Check-out: 10:00 PM (22:00)
// Total: 4 hours

// Split calculation:
// 18:00 - 20:00 = 2 hours (regular) × €24.58 = €49.16
// 20:00 - 22:00 = 2 hours (holiday) × €36.88 = €73.76
// Total: €122.92
```

**Database Function:**
```sql
CREATE OR REPLACE FUNCTION calculate_hours_with_rates(
  elderly_uuid UUID,
  start_date DATE,
  end_date DATE
)
RETURNS TABLE (
  caregiver_name TEXT,
  regular_hours DECIMAL,
  holiday_hours DECIMAL,
  regular_amount DECIMAL,
  holiday_amount DECIMAL,
  total_amount DECIMAL
) AS $$
-- Implementation here
$$ LANGUAGE plpgsql;
```

---

### Phase 5: Calendar View
**Goal:** Visual calendar showing daily hours and amounts

**Tasks:**
1. Create calendar component (month view)
2. Show daily totals per cell
3. Highlight holidays in red
4. Click day to see detailed breakdown
5. Navigate between months

**UI Components:**
- `components/CalendarView.tsx`
- `components/DayDetailModal.tsx`

**Features:**
- Color coding: regular days (white), Sundays (light blue), holidays (light red)
- Show total hours per day
- Show total amount per day
- Click to expand and see per-caregiver breakdown

---

### Phase 6: Admin Panel
**Goal:** Complete admin interface with all clients

**Tasks:**
1. Create admin layout
2. List all clients with current status
3. Client selector/switcher
4. Show billing summary for selected client
5. Month selector
6. Calendar view integration
7. Per-caregiver breakdown table

**Route:** `/admin`

**UI Layout:**
```
┌─────────────────────────────────────────────┐
│ Admin Panel - All Clients                   │
├─────────────────────────────────────────────┤
│ Select Client: [Dropdown ▼]                 │
│ Month: [November 2024 ▼]                    │
├─────────────────────────────────────────────┤
│ Calendar View                                │
│ [Calendar component here]                    │
├─────────────────────────────────────────────┤
│ Caregiver Breakdown                          │
│ ┌───────────────────────────────────────┐   │
│ │ Sophie L.  | 85.5h | 8h | €2,397.20  │   │
│ │ Marie C.   | 32h   | 0h | €787.36    │   │
│ │ Total             | €3,184.56        │   │
│ └───────────────────────────────────────┘   │
│ [Export CSV] [Export PDF]                   │
└─────────────────────────────────────────────┘
```

---

### Phase 7: Family Dashboard
**Goal:** Individual dashboards per family (read-only access to their data)

**Tasks:**
1. Create family dashboard route with elderly ID
2. Same components as admin but filtered to one client
3. Generate shareable URLs per family
4. Optional: Add simple password protection per client

**Route:** `/dashboard/[elderlyId]`

**URL Examples:**
- Family 1: `https://caregiver-tracker-iz.vercel.app/dashboard/abc123-uuid`
- Family 2: `https://caregiver-tracker-iz.vercel.app/dashboard/def456-uuid`

**Optional Enhancement:**
```sql
-- Add access code per elderly
ALTER TABLE elderly ADD COLUMN access_code TEXT;

-- Generate random codes
UPDATE elderly SET access_code = substr(md5(random()::text), 1, 8);
```

Then family URL becomes:
`https://caregiver-tracker-iz.vercel.app/dashboard/abc123-uuid?code=x7k9m2p1`

---

### Phase 8: Export Functionality
**Goal:** Generate CSV and PDF financial summaries

**Tasks:**
1. Create CSV export function
2. Create PDF export function (using jsPDF or similar)
3. Add export buttons to both admin and family dashboards
4. Format data correctly for both formats

**CSV Format:**
```csv
Client,Period,Caregiver,Regular Hours,Holiday Hours,Regular Rate,Holiday Rate,Regular Amount,Holiday Amount,Total
Marie Dubois,November 2024,Sophie Lefebvre,85.5,8.0,24.58,36.88,2101.59,295.04,2396.63
Marie Dubois,November 2024,Marie Claire,32.0,0.0,24.58,36.88,786.56,0.00,786.56
,,,,Total,,,2888.15,295.04,3183.19
```

**PDF Format:**
- Header with client name and period
- Table with caregiver breakdown
- Summary totals
- Generated date/time
- Not an invoice - labeled as "Financial Summary"

**Libraries to use:**
- CSV: Built-in JS (no library needed)
- PDF: `jspdf` + `jspdf-autotable`

```bash
npm install jspdf jspdf-autotable
npm install -D @types/jspdf
```

---

## Technical Implementation Notes

### State Management
- Use React Context or Zustand for client selection in admin
- Keep pricing logic in server-side functions when possible

### Performance Considerations
- Cache holiday calculations
- Index database queries properly
- Paginate large datasets (more than 100 records)

### Security Considerations
- Family dashboards should validate access codes
- Admin panel needs authentication (future: add Supabase Auth)
- Don't expose all elderly UUIDs publicly

### Testing Checklist
- [ ] Photo upload/display from storage
- [ ] Multiple clients display correctly
- [ ] Holiday detection works for:
  - [ ] French public holidays
  - [ ] Sundays
  - [ ] Hours after 8 PM
- [ ] Hours split correctly at 8 PM boundary
- [ ] Rates calculate correctly
- [ ] Per-caregiver aggregation accurate
- [ ] Calendar displays correctly
- [ ] Export CSV works
- [ ] Export PDF works
- [ ] Family dashboard shows only their data

---

## Database Schema Updates Summary

```sql
-- 1. Photo storage (remove base64, use URLs)
ALTER TABLE check_in_outs ALTER COLUMN photo_url TYPE TEXT;

-- 2. Add pricing to clients
ALTER TABLE elderly ADD COLUMN regular_rate DECIMAL(10, 2) DEFAULT 24.58;
ALTER TABLE elderly ADD COLUMN holiday_rate DECIMAL(10, 2) DEFAULT 36.88;
ALTER TABLE elderly ADD COLUMN currency TEXT DEFAULT 'EUR';
ALTER TABLE elderly ADD COLUMN access_code TEXT;

-- 3. Holiday tracking
ALTER TABLE check_in_outs ADD COLUMN is_holiday_hours BOOLEAN DEFAULT false;

CREATE TABLE french_holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Billing functions
-- (See Phase 3 and 4 for detailed SQL)
```

---

## Files to Create/Modify

### New Files:
- `DEVELOPMENT_PLAN.md` (this file) ✅
- `app/admin/page.tsx` - Admin dashboard
- `app/dashboard/[elderlyId]/page.tsx` - Family dashboard
- `components/CalendarView.tsx` - Calendar component
- `components/DayDetailModal.tsx` - Day details popup
- `components/ClientSelector.tsx` - Client dropdown
- `components/CaregiverBreakdown.tsx` - Caregiver summary table
- `components/ExportButtons.tsx` - CSV/PDF export
- `lib/holidays.ts` - Holiday detection logic
- `lib/billing.ts` - Billing calculations
- `lib/storage.ts` - Supabase storage helpers
- `lib/pdf-export.ts` - PDF generation
- `supabase/billing-functions.sql` - Advanced SQL functions

### Files to Modify:
- `app/checkin/[qrCode]/page.tsx` - Update photo upload
- `app/dashboard/page.tsx` - Redirect or become admin
- `lib/supabase.ts` - Add new types
- `supabase/schema.sql` - Add new tables and columns

---

## Estimated Time per Phase

| Phase | Task | Time Estimate |
|-------|------|---------------|
| 1 | Photo Storage | 30 min |
| 2 | Multi-Client Infrastructure | 45 min |
| 3 | Holiday Detection | 1.5 hours |
| 4 | Billing Calculator | 1.5 hours |
| 5 | Calendar View | 2 hours |
| 6 | Admin Panel | 2 hours |
| 7 | Family Dashboard | 1 hour |
| 8 | Export (CSV/PDF) | 1.5 hours |
| **Total** | | **~10-12 hours** |

Can be split across multiple sessions.

---

## Next Session Checklist

When resuming, start with:
1. ✅ Review this document
2. ✅ Check Vercel deployment status
3. ✅ Check Supabase connection
4. ✅ Resume from Phase 1 (Photo Storage)

---

## Questions to Resolve

- [x] Hourly rates defined: €24.58 regular, €36.88 holiday
- [x] Holiday definition clear: French holidays + Sundays + after 8 PM
- [x] Evening hours: starts from 8 PM (not entire shift)
- [ ] Do rates vary per client or same for all?
- [ ] Need authentication for admin panel?
- [ ] Want SMS/email notifications when caregiver checks in?

---

## Production Deployment Notes

**Current Production URL:** https://caregiver-tracker-iz.vercel.app

**Environment Variables (already set in Vercel):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

**After major changes:**
1. Test locally first
2. Commit to GitHub
3. Vercel auto-deploys
4. Test production
5. If issues, rollback in Vercel

---

## Future Enhancements (Not in Current Plan)

- Authentication (Supabase Auth)
- SMS/Email notifications
- Mobile app (React Native)
- Multiple languages (i18n)
- Geolocation-based holiday detection
- Time zone support
- Automated invoice generation
- Payment integration
- Caregiver app for easier check-in

---

**Document Created:** November 27, 2024
**Last Updated:** November 27, 2024
**Status:** Ready to implement Phase 1
