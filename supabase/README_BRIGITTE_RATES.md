# Brigitte Germé Rate Structure Setup

## Overview

This document explains the complete rate structure for Brigitte Germé and how to set it up in the database.

## Rate Structure

### 1. Billing Rates (What the company charges)

| Period | Rate HT | Rate TTC | Notes |
|--------|---------|----------|-------|
| **2020-2025** | €23.30/h | €24.58/h | Company charged at conventioned rate |
| **2026 onwards** | €23.76/h | €25.07/h | Company increased billing rate |

### 2. Conventioned Rate (APA/PCH Reference - Changes over time)

| Period | Rate HT | Rate TTC | Notes |
|--------|---------|----------|-------|
| **2020-2025** | €23.30/h | €24.58/h | APA/PCH plan rate (government set) |
| **2026 onwards** | €23.70/h | €25.00/h | APA/PCH plan rate increased 2% (government set) |

## Copay Calculation Logic

```
2025 Example (40 hours):
─────────────────────────────────────────────────
Billing rate        = 23.30 HT
Conventioned rate   = 23.30 HT
Excess per hour     = 0.00 HT

Base conventionnée  = 40 h × 23.30 HT = 932.00 HT
Total facturé       = 40 h × 23.30 HT = 932.00 HT

Insurance (77.78%)  = 77.78% × 932.00 = 725.19 HT
Copay (22.22%)      = 22.22% × 932.00 = 207.09 HT
Excess (100%)       = 0.00 HT

Beneficiary total   = 207.09 + 0.00 = 207.09 HT (€218.57 TTC)
```

```
2026 Example (40 hours):
─────────────────────────────────────────────────
Billing rate        = 23.76 HT
Conventioned rate   = 23.70 HT  ← APA/PCH reference rate
Excess per hour     = 0.06 HT

Base conventionnée  = 40 h × 23.70 HT = 948.00 HT
Total facturé       = 40 h × 23.76 HT = 950.40 HT

Insurance (77.78%)  = 77.78% × 948.00 = 737.35 HT
Copay (22.22%)      = 22.22% × 948.00 = 210.65 HT
Excess (100%)       = 40 h × 0.06 = 2.40 HT

Beneficiary total   = 210.65 + 2.40 = 213.05 HT (€224.77 TTC)
```

## Database Setup

### Run the Migration

Run this single migration in Supabase SQL Editor:

```sql
-- File: supabase/migration_fix_conventioned_rate_history.sql
```

This migration:
- ✅ Adds `conventioned_rate` column to `beneficiary_rate_history` table
- ✅ Sets rate history for 2020-2025: billing = 23.30 HT, conventioned = 23.30 HT
- ✅ Sets rate history for 2026+: billing = 23.76 HT, conventioned = 23.70 HT
- ✅ Updates `beneficiaries.regular_rate` to 23.76 HT
- ✅ Includes verification queries

**Key Change**: The conventioned rate is now tracked in the `beneficiary_rate_history` table (not in the `beneficiaries` table). This allows the conventioned rate to change over time based on government regulation.

## Expected Database State

### Table: `beneficiaries`

```sql
SELECT
  name,
  regular_rate,           -- Current billing rate: 23.76
  ticket_moderateur       -- Copay percentage: 22.22
FROM beneficiaries
WHERE name ILIKE '%Brigitte%';
```

Expected result:
```
name           | regular_rate | ticket_moderateur
---------------|--------------|-------------------
Brigitte Germé | 23.76        | 22.22
```

### Table: `beneficiary_rate_history` (with conventioned rates)

```sql
SELECT
  rate,
  conventioned_rate,
  effective_date
FROM beneficiary_rate_history
WHERE beneficiary_id = '14942fa6-5970-49df-ac7b-7d2905e98604'
ORDER BY effective_date;
```

Expected result:
```
rate  | conventioned_rate | effective_date
------|-------------------|---------------
23.30 | 23.30             | 2020-01-01
23.76 | 23.70             | 2026-01-01
```

**Key Insight**: Both the billing rate AND the conventioned rate are now tracked in `beneficiary_rate_history`. This reflects the reality that:
- Company billing rate: changed from 23.30 → 23.76 HT
- APA/PCH reference rate: changed from 23.30 → 23.70 HT (government regulation)
- Excess: changed from 0.00 → 0.06 HT per hour

## Verification

After running the migration, refresh your browser at `localhost:3000` and:

1. ✅ View a month in **2025** → Should show NO excess charges
2. ✅ View a month in **2026** → Should show:
   - Detailed calculation breakdown
   - Excess charges (dépassements)
   - Split between copay and excess

## How It Works in the Code

The application automatically:
- Uses `beneficiary_rate_history.rate` to determine billing rate by date
- Uses `beneficiary_rate_history.conventioned_rate` to determine APA/PCH reference rate by date
- Calculates excess as: `(billing_rate - conventioned_rate) × hours`
- Displays detailed breakdown when excess exists

### Technical Implementation

1. **`lib/rate-utils.ts`**: The `getRateForDate()` function now returns `{ billingRate, conventionedRate }` based on the effective date
2. **`components/CaregiverBreakdown.tsx`**: Uses both rates from history for copay calculation
3. **`lib/pdf-export.ts`**: PDF exports use both rates from history
4. **All rates come from database**: No hardcoded values in the code
