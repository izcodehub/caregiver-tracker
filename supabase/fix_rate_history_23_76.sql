-- Fix: Update rate history from 23.70 to 23.76
-- The rate should be 23.76 HT (25.07 TTC), not 23.70 HT

UPDATE beneficiary_rate_history
SET rate = 23.76
WHERE beneficiary_id = '14942fa6-5970-49df-ac7b-7d2905e98604'
  AND effective_date = '2026-01-01'
  AND rate = 23.7;  -- Only update if it's currently 23.7

-- Verification: Check the result
SELECT
  rate,
  effective_date,
  ROUND(rate * 1.055, 2) as rate_ttc
FROM beneficiary_rate_history
WHERE beneficiary_id = '14942fa6-5970-49df-ac7b-7d2905e98604'
ORDER BY effective_date;

-- Expected result:
-- rate  | effective_date | rate_ttc
-- ------|----------------|----------
-- 23.30 | 2020-01-01     | 24.58
-- 23.76 | 2026-01-01     | 25.07
