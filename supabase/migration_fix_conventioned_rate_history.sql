-- Fix: Track conventioned rate changes over time
-- Based on agency letter: APA/PCH plan rate increased from 24.58€ to 25.00€ TTC starting 2026-01-01
--
-- Structure:
--   2020-2025: billing = 23.30 HT, conventioned = 23.30 HT → excess = 0.00 HT
--   2026+:     billing = 23.76 HT, conventioned = 23.70 HT → excess = 0.06 HT
--
-- The conventioned rate is the "tarif horaire APA/PCH" - the reference rate used
-- by insurance (APA/PCH) for copay calculation. It changes based on government regulation.

-- Step 1: Add conventioned_rate column to rate history table
ALTER TABLE beneficiary_rate_history
ADD COLUMN IF NOT EXISTS conventioned_rate DECIMAL(10, 2) DEFAULT NULL;

COMMENT ON COLUMN beneficiary_rate_history.conventioned_rate IS
  'Tarif de référence APA/PCH (Hors TVA) for this period. Used for copay calculation: '
  'insurance copay% applies to (hours × conventioned_rate). Any excess '
  '(billing rate - conventioned rate) is 100% beneficiary responsibility.';

-- Step 2: Update existing rate history rows with correct values
-- For Brigitte Germé (14942fa6-5970-49df-ac7b-7d2905e98604)

-- 2020-2025 period: both rates were 23.30 HT (no excess)
UPDATE beneficiary_rate_history
SET
  rate = 23.30,
  conventioned_rate = 23.30
WHERE beneficiary_id = '14942fa6-5970-49df-ac7b-7d2905e98604'
  AND effective_date = '2020-01-01';

-- 2026+ period: billing 23.76 HT, conventioned 23.70 HT (excess 0.06 HT)
UPDATE beneficiary_rate_history
SET
  rate = 23.76,
  conventioned_rate = 23.70
WHERE beneficiary_id = '14942fa6-5970-49df-ac7b-7d2905e98604'
  AND effective_date = '2026-01-01';

-- Step 3: Update current billing rate in beneficiaries table
UPDATE beneficiaries
SET regular_rate = 23.76
WHERE id = '14942fa6-5970-49df-ac7b-7d2905e98604';

-- Note: beneficiaries.conventioned_rate column is now redundant
-- (we'll keep it for backwards compatibility but source of truth is rate_history)

-- Verification query:
SELECT
  effective_date,
  rate as billing_rate_ht,
  ROUND(rate * 1.055, 2) as billing_rate_ttc,
  conventioned_rate as conventioned_ht,
  ROUND(conventioned_rate * 1.055, 2) as conventioned_ttc,
  ROUND(rate - conventioned_rate, 2) as excess_ht_per_hour,
  ROUND((rate - conventioned_rate) * 1.055, 2) as excess_ttc_per_hour
FROM beneficiary_rate_history
WHERE beneficiary_id = '14942fa6-5970-49df-ac7b-7d2905e98604'
ORDER BY effective_date;

-- Expected result:
-- effective_date | billing_rate_ht | billing_rate_ttc | conventioned_ht | conventioned_ttc | excess_ht_per_hour | excess_ttc_per_hour
-- ---------------|-----------------|------------------|-----------------|------------------|--------------------|-----------------------
-- 2020-01-01     | 23.30           | 24.58            | 23.30           | 24.58            | 0.00               | 0.00
-- 2026-01-01     | 23.76           | 25.07            | 23.70           | 25.00            | 0.06               | 0.07
