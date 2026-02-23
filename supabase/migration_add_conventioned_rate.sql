-- Migration: Add conventioned_rate column to beneficiaries
-- The "tarif conventionné" is the reference price set by the regulatory convention
-- (e.g., ARS / avenant CCN aide à domicile). The copay (ticket modérateur) is
-- calculated ONLY on this reference price, even if the company charges above it.
--
-- Example for Brigitte Germé:
--   Tarif conventionné: 23.30 HT / 24.58 TTC/h  (fixed by convention)
--   Billing rate from 2026: 23.76 HT / 25.07 TTC/h
--   Copay applies to 23.30 HT portion only (22.22% of 23.30 HT)
--   Price increase (23.76 - 23.30 = 0.46 HT / 0.49 TTC per hour) is 100% beneficiary

-- Step 1: Add conventioned_rate column
ALTER TABLE beneficiaries
ADD COLUMN IF NOT EXISTS conventioned_rate DECIMAL(10, 2) DEFAULT NULL;

COMMENT ON COLUMN beneficiaries.conventioned_rate IS
  'Tarif de référence conventionné (Hors TVA). Used to split copay calculation: '
  'copay% applies only up to this rate; any billing above this is 100% beneficiary.';

-- Step 2: Set the conventioned rate for Brigitte Germé
-- Previous rate (23.30 HT) = the conventioned reference price set by the convention
UPDATE beneficiaries
SET conventioned_rate = 23.30
WHERE id = '14942fa6-5970-49df-ac7b-7d2905e98604';

-- Verification query:
-- SELECT name, regular_rate, conventioned_rate,
--        ROUND(regular_rate * 1.055, 2) AS billing_ttc,
--        ROUND(conventioned_rate * 1.055, 2) AS conv_ttc,
--        ROUND((regular_rate - conventioned_rate) * 1.055, 2) AS surcharge_ttc_per_hour
-- FROM beneficiaries
-- WHERE conventioned_rate IS NOT NULL;
