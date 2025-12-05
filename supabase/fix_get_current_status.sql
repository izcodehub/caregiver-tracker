-- Fix get_current_status function
-- Run this in Supabase SQL Editor if you're getting 404 errors

DROP FUNCTION IF EXISTS get_current_status(uuid);

CREATE OR REPLACE FUNCTION get_current_status(beneficiary_uuid UUID)
RETURNS TABLE (
  is_checked_in BOOLEAN,
  last_check_in TIMESTAMPTZ,
  caregiver_name TEXT,
  hours_today DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_action AS (
    SELECT
      action,
      timestamp,
      caregiver_name AS cg_name
    FROM check_in_outs
    WHERE beneficiary_id = beneficiary_uuid
    ORDER BY timestamp DESC
    LIMIT 1
  ),
  today_hours AS (
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN action = 'check-out' THEN
              EXTRACT(EPOCH FROM (timestamp - LAG(timestamp) OVER (ORDER BY timestamp))) / 3600
            ELSE 0
          END
        ), 0
      ) AS total_hours
    FROM check_in_outs
    WHERE beneficiary_id = beneficiary_uuid
      AND DATE(timestamp) = CURRENT_DATE
  )
  SELECT
    COALESCE(la.action = 'check-in', false) AS is_checked_in,
    CASE WHEN la.action = 'check-in' THEN la.timestamp ELSE NULL END AS last_check_in,
    la.cg_name AS caregiver_name,
    th.total_hours::DECIMAL AS hours_today
  FROM latest_action la
  CROSS JOIN today_hours th;
END;
$$ LANGUAGE plpgsql;
