-- Migration: Add APA monthly allowance tracking
-- This tracks the beneficiary's APA/PCH plan allocation (plan d'aide)
--
-- For Brigitte Germé:
--   APA plan: 47 hours/month at 25,00€ TTC reference rate (starting 2026)
--   This is the monthly allocation set by Conseil Départemental 77

-- Step 1: Add fields to track APA monthly allowance
ALTER TABLE beneficiaries
ADD COLUMN IF NOT EXISTS apa_monthly_hours DECIMAL(10, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS apa_notes TEXT DEFAULT NULL;

COMMENT ON COLUMN beneficiaries.apa_monthly_hours IS
  'Monthly hours allocation from APA/PCH plan (plan d''aide). This is the maximum '
  'hours per month covered by the APA/PCH at the reference rate.';

COMMENT ON COLUMN beneficiaries.apa_notes IS
  'Additional notes about APA coverage (e.g., decision number, validity period, '
  'specific conditions or restrictions).';

-- Step 2: Set APA allowance for Brigitte Germé
-- From invoice: "Tiers Payant : CONSEIL DEPARTEMENTAL 77 - APA"
-- "Rappel de votre prise en charge : 47,00 h à 25,00 €"
UPDATE beneficiaries
SET
  apa_monthly_hours = 47.00,
  apa_notes = 'Validité: 01/01/2026 au 30/06/2035 - CD77 - 47h/mois à 25,00€ TTC (23,70€ HT) tarif APA 2026'
WHERE id = '14942fa6-5970-49df-ac7b-7d2905e98604';

-- Verification query:
SELECT
  name,
  regular_rate as current_billing_rate_ht,
  ROUND(regular_rate * 1.055, 2) as current_billing_rate_ttc,
  apa_monthly_hours as apa_plan_hours_per_month,
  ticket_moderateur as copay_percentage,
  apa_notes
FROM beneficiaries
WHERE id = '14942fa6-5970-49df-ac7b-7d2905e98604';

-- Expected result:
-- name           | current_billing_rate_ht | current_billing_rate_ttc | apa_plan_hours_per_month | copay_percentage | apa_notes
-- ---------------|-------------------------|--------------------------|--------------------------|------------------|------------------------------------------
-- Brigitte Germé | 23.76                   | 25.07                    | 47.00                    | 22.22            | Validité: 01/01/2026 au 30/06/2035 - CD77...

-- Additional query: Calculate APA plan value
SELECT
  name,
  apa_monthly_hours,
  -- Get the latest conventioned rate from rate history
  (SELECT conventioned_rate
   FROM beneficiary_rate_history
   WHERE beneficiary_id = '14942fa6-5970-49df-ac7b-7d2905e98604'
   ORDER BY effective_date DESC
   LIMIT 1) as apa_reference_rate_ht,
  ROUND((SELECT conventioned_rate
   FROM beneficiary_rate_history
   WHERE beneficiary_id = '14942fa6-5970-49df-ac7b-7d2905e98604'
   ORDER BY effective_date DESC
   LIMIT 1) * 1.055, 2) as apa_reference_rate_ttc,
  ROUND(apa_monthly_hours * (SELECT conventioned_rate
   FROM beneficiary_rate_history
   WHERE beneficiary_id = '14942fa6-5970-49df-ac7b-7d2905e98604'
   ORDER BY effective_date DESC
   LIMIT 1), 2) as monthly_plan_value_ht,
  ROUND(apa_monthly_hours * (SELECT conventioned_rate
   FROM beneficiary_rate_history
   WHERE beneficiary_id = '14942fa6-5970-49df-ac7b-7d2905e98604'
   ORDER BY effective_date DESC
   LIMIT 1) * 1.055, 2) as monthly_plan_value_ttc
FROM beneficiaries
WHERE id = '14942fa6-5970-49df-ac7b-7d2905e98604';

-- Expected result for 2026:
-- apa_monthly_hours | apa_reference_rate_ht | apa_reference_rate_ttc | monthly_plan_value_ht | monthly_plan_value_ttc
-- ------------------|----------------------|------------------------|----------------------|------------------------
-- 47.00             | 23.70                 | 25.00                  | 1113.90              | 1175.00
