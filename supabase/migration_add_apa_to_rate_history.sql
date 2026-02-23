-- Migration: Add APA monthly hours to rate history (time-dependent)
-- The APA plan allocation can change over time based on government decisions

-- Step 1: Add apa_monthly_hours to rate history table
ALTER TABLE beneficiary_rate_history
ADD COLUMN IF NOT EXISTS apa_monthly_hours DECIMAL(10, 2) DEFAULT NULL;

COMMENT ON COLUMN beneficiary_rate_history.apa_monthly_hours IS
  'Monthly hours allocation from APA/PCH plan for this period. This is the maximum '
  'hours per month covered by the APA/PCH at the conventioned_rate for this period.';

-- Step 2: Add APA notes to beneficiaries table (global info, not time-specific)
ALTER TABLE beneficiaries
ADD COLUMN IF NOT EXISTS apa_notes TEXT DEFAULT NULL;

COMMENT ON COLUMN beneficiaries.apa_notes IS
  'Additional notes about APA coverage (e.g., decision number, current validity period).';

-- Step 3: Set APA plan for Brigitte Germé

-- 2020-2025 period: 47h/month at 24.58€ TTC (23.30€ HT)
UPDATE beneficiary_rate_history
SET
  rate = 23.30,
  conventioned_rate = 23.30,
  apa_monthly_hours = 47.00
WHERE beneficiary_id = '14942fa6-5970-49df-ac7b-7d2905e98604'
  AND effective_date = '2020-01-01';

-- 2026+ period: 47h/month at 25.00€ TTC (23.70€ HT)
UPDATE beneficiary_rate_history
SET
  rate = 23.76,
  conventioned_rate = 23.70,
  apa_monthly_hours = 47.00
WHERE beneficiary_id = '14942fa6-5970-49df-ac7b-7d2905e98604'
  AND effective_date = '2026-01-01';

-- Step 4: Set APA notes on beneficiaries
UPDATE beneficiaries
SET
  regular_rate = 23.76,
  apa_notes = 'Validité: 01/01/2026 au 30/06/2035 - CD77 - 47h/mois'
WHERE id = '14942fa6-5970-49df-ac7b-7d2905e98604';

-- Verification query:
SELECT
  effective_date,
  rate as billing_rate_ht,
  ROUND(rate * 1.055, 2) as billing_rate_ttc,
  conventioned_rate as apa_reference_ht,
  ROUND(conventioned_rate * 1.055, 2) as apa_reference_ttc,
  apa_monthly_hours,
  ROUND(apa_monthly_hours * conventioned_rate, 2) as plan_value_ht,
  ROUND(apa_monthly_hours * conventioned_rate * 1.055, 2) as plan_value_ttc,
  ROUND(rate - conventioned_rate, 2) as excess_ht_per_hour
FROM beneficiary_rate_history
WHERE beneficiary_id = '14942fa6-5970-49df-ac7b-7d2905e98604'
ORDER BY effective_date;

-- Expected result:
-- effective_date | billing_rate_ht | billing_rate_ttc | apa_reference_ht | apa_reference_ttc | apa_monthly_hours | plan_value_ht | plan_value_ttc | excess_ht_per_hour
-- ---------------|-----------------|------------------|------------------|-------------------|-------------------|---------------|----------------|--------------------
-- 2020-01-01     | 23.30           | 24.58            | 23.30            | 24.58             | 47.00             | 1095.10       | 1155.26        | 0.00
-- 2026-01-01     | 23.76           | 25.07            | 23.70            | 25.00             | 47.00             | 1113.90       | 1175.00        | 0.06
