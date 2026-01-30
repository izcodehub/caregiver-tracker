-- Migration: Add rate history for Brigitte Germe
-- Rate increase from €23.30/h HT to €25/h TTC (€23.70 HT) effective January 1st, 2026
--
-- Previous rate: €23.30/h HT (€24.58/h TTC with 5.5% VAT)
-- New rate: €23.70/h HT (€25.00/h TTC with 5.5% VAT)

-- Step 1: Insert historical rate (before Jan 1, 2026)
-- This captures the rate that was in effect before the increase
-- Using a date far in the past to ensure it's the baseline rate
INSERT INTO beneficiary_rate_history (beneficiary_id, rate, effective_date)
VALUES (
  '14942fa6-5970-49df-ac7b-7d2905e98604',  -- Brigitte Germé's beneficiary_id
  23.30,                                     -- Previous rate: €23.30/h HT
  '2020-01-01'                               -- Historical baseline date
)
ON CONFLICT (beneficiary_id, effective_date) DO NOTHING;

-- Step 2: Insert new rate effective January 1st, 2026
-- €25/h TTC = €25 / 1.055 = €23.70 HT (Hors TVA)
INSERT INTO beneficiary_rate_history (beneficiary_id, rate, effective_date)
VALUES (
  '14942fa6-5970-49df-ac7b-7d2905e98604',  -- Brigitte Germé's beneficiary_id
  23.70,                                     -- €23.70/h HT (before VAT)
  '2026-01-01'                               -- Effective date
)
ON CONFLICT (beneficiary_id, effective_date) DO NOTHING;

-- Step 3: Update the current regular_rate in beneficiaries table to reflect the new rate
-- This ensures backward compatibility for any code that still reads from regular_rate
UPDATE beneficiaries
SET regular_rate = 23.70
WHERE id = '14942fa6-5970-49df-ac7b-7d2905e98604';

-- Verification query - run this to check the results:
-- SELECT
--   b.name,
--   b.regular_rate as current_rate,
--   rh.rate as historical_rate,
--   rh.effective_date,
--   rh.created_at
-- FROM beneficiaries b
-- LEFT JOIN beneficiary_rate_history rh ON b.id = rh.beneficiary_id
-- WHERE b.name ILIKE '%Brigitte%Germe%'
-- ORDER BY rh.effective_date DESC;
