-- Complete Migration: Brigitte Germé Rate Structure
-- =====================================================
--
-- This migration sets up the complete rate structure for Brigitte Germé:
--
-- 1. BILLING RATES (what the company charges):
--    - 2025 and before: 23.30 HT / 24.58 TTC/h
--    - 2026 onwards:    23.76 HT / 25.07 TTC/h
--
-- 2. CONVENTIONED RATE (regulatory reference for copay calculation):
--    - Fixed at: 23.30 HT / 24.58 TTC/h (doesn't change)
--
-- COPAY CALCULATION:
--    - Copay (22.22%) applies ONLY to the conventioned rate (23.30 HT)
--    - Any billing above conventioned rate = 100% beneficiary
--    - In 2025: no excess (23.30 = 23.30)
--    - In 2026: excess = 0.46 HT/h (23.76 - 23.30), paid 100% by beneficiary

-- =====================================================
-- PART 1: Rate History (Billing Rates)
-- =====================================================

-- Step 1.1: Insert historical baseline rate (2025 and before)
INSERT INTO beneficiary_rate_history (beneficiary_id, rate, effective_date)
VALUES (
  '14942fa6-5970-49df-ac7b-7d2905e98604',  -- Brigitte Germé's beneficiary_id
  23.30,                                     -- €23.30/h HT (€24.58 TTC)
  '2020-01-01'                               -- Historical baseline date
)
ON CONFLICT (beneficiary_id, effective_date) DO NOTHING;

-- Step 1.2: Insert new rate effective January 1st, 2026
INSERT INTO beneficiary_rate_history (beneficiary_id, rate, effective_date)
VALUES (
  '14942fa6-5970-49df-ac7b-7d2905e98604',  -- Brigitte Germé's beneficiary_id
  23.76,                                     -- €23.76/h HT (€25.07 TTC)
  '2026-01-01'                               -- Effective date: January 1st, 2026
)
ON CONFLICT (beneficiary_id, effective_date) DO NOTHING;

-- Step 1.3: Update current regular_rate in beneficiaries table
-- (for backward compatibility with code that reads regular_rate directly)
UPDATE beneficiaries
SET regular_rate = 23.76
WHERE id = '14942fa6-5970-49df-ac7b-7d2905e98604';

-- =====================================================
-- PART 2: Conventioned Rate (Regulatory Reference)
-- =====================================================

-- Step 2.1: Add conventioned_rate column if it doesn't exist
ALTER TABLE beneficiaries
ADD COLUMN IF NOT EXISTS conventioned_rate DECIMAL(10, 2) DEFAULT NULL;

COMMENT ON COLUMN beneficiaries.conventioned_rate IS
  'Tarif de référence conventionné (Hors TVA). This is the fixed regulatory reference rate. '
  'Copay percentage applies ONLY to this rate. Any billing above this rate is 100% beneficiary responsibility.';

-- Step 2.2: Set the conventioned rate for Brigitte Germé
-- This is the fixed regulatory reference (doesn't change with billing rate increases)
UPDATE beneficiaries
SET conventioned_rate = 23.30
WHERE id = '14942fa6-5970-49df-ac7b-7d2905e98604';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Query 1: Check rate history
-- SELECT
--   b.name,
--   b.regular_rate as current_billing_rate,
--   b.conventioned_rate,
--   rh.rate as historical_rate,
--   rh.effective_date,
--   ROUND((b.regular_rate - b.conventioned_rate), 2) as excess_per_hour_ht,
--   ROUND((b.regular_rate - b.conventioned_rate) * 1.055, 2) as excess_per_hour_ttc
-- FROM beneficiaries b
-- LEFT JOIN beneficiary_rate_history rh ON b.id = rh.beneficiary_id
-- WHERE b.id = '14942fa6-5970-49df-ac7b-7d2905e98604'
-- ORDER BY rh.effective_date;

-- Query 2: Calculate example copay for 40 hours in 2026
-- WITH example AS (
--   SELECT
--     40.0 as total_hours,
--     23.76 as billing_rate_ht,
--     23.30 as conventioned_rate_ht,
--     22.22 as copay_percentage
-- )
-- SELECT
--   total_hours,
--   billing_rate_ht,
--   conventioned_rate_ht,
--   -- Total billed
--   ROUND(total_hours * billing_rate_ht, 2) as total_billed_ht,
--   ROUND(total_hours * billing_rate_ht * 1.055, 2) as total_billed_ttc,
--   -- Conventioned base
--   ROUND(total_hours * conventioned_rate_ht, 2) as conventioned_base_ht,
--   ROUND(total_hours * conventioned_rate_ht * 1.055, 2) as conventioned_base_ttc,
--   -- Insurance coverage (77.78% of conventioned base)
--   ROUND(total_hours * conventioned_rate_ht * (1 - copay_percentage/100), 2) as insurance_ht,
--   ROUND(total_hours * conventioned_rate_ht * (1 - copay_percentage/100) * 1.055, 2) as insurance_ttc,
--   -- Copay (22.22% of conventioned base)
--   ROUND(total_hours * conventioned_rate_ht * (copay_percentage/100), 2) as copay_ht,
--   ROUND(total_hours * conventioned_rate_ht * (copay_percentage/100) * 1.055, 2) as copay_ttc,
--   -- Excess (100% beneficiary)
--   ROUND(total_hours * (billing_rate_ht - conventioned_rate_ht), 2) as excess_ht,
--   ROUND(total_hours * (billing_rate_ht - conventioned_rate_ht) * 1.055, 2) as excess_ttc,
--   -- Beneficiary total
--   ROUND(total_hours * conventioned_rate_ht * (copay_percentage/100) +
--         total_hours * (billing_rate_ht - conventioned_rate_ht), 2) as beneficiary_total_ht,
--   ROUND((total_hours * conventioned_rate_ht * (copay_percentage/100) +
--          total_hours * (billing_rate_ht - conventioned_rate_ht)) * 1.055, 2) as beneficiary_total_ttc
-- FROM example;
