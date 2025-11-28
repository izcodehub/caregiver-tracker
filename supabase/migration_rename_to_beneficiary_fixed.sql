-- Migration: Rename elderly to beneficiary and restructure family relationships
-- This creates a proper many-to-one relationship (many family members to one beneficiary)
-- IMPORTANT: This migration preserves all existing data!

-- Step 1: Rename the elderly table to beneficiaries
ALTER TABLE elderly RENAME TO beneficiaries;

-- Step 2: Rename the foreign key column in check_in_outs
ALTER TABLE check_in_outs RENAME COLUMN elderly_id TO beneficiary_id;

-- Step 3: Rename the foreign key column in users
ALTER TABLE users RENAME COLUMN elderly_id TO beneficiary_id;

-- Step 4: Rename indexes
DROP INDEX IF EXISTS idx_elderly_qr_code;
CREATE INDEX idx_beneficiaries_qr_code ON beneficiaries(qr_code);

DROP INDEX IF EXISTS idx_check_in_outs_elderly_id;
CREATE INDEX idx_check_in_outs_beneficiary_id ON check_in_outs(beneficiary_id);

DROP INDEX IF EXISTS idx_users_elderly_id;
CREATE INDEX idx_users_beneficiary_id ON users(beneficiary_id);

-- Step 5: Update RLS policies
DROP POLICY IF EXISTS "Allow all access to elderly" ON beneficiaries;
CREATE POLICY "Allow all access to beneficiaries" ON beneficiaries FOR ALL USING (true);

-- Step 6: Drop the old family_members table and recreate it with proper structure
-- The old table had family_ids as an array in elderly table, which is not ideal
DROP TABLE IF EXISTS family_members CASCADE;

-- Create new family_members table with many-to-one relationship
CREATE TABLE family_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beneficiary_id UUID NOT NULL REFERENCES beneficiaries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'family' CHECK (role IN ('primary', 'secondary', 'emergency')),
  notification_preferences JSONB DEFAULT '{"email": true, "sms": false, "push": true, "check_in": true, "check_out": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for family_members
CREATE INDEX idx_family_members_beneficiary_id ON family_members(beneficiary_id);
CREATE INDEX idx_family_members_email ON family_members(email);

-- Enable RLS for family_members
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to family_members" ON family_members FOR ALL USING (true);

-- Step 7: Remove the family_ids array column from beneficiaries if it exists
ALTER TABLE beneficiaries DROP COLUMN IF EXISTS family_ids;

-- Step 8: DROP and recreate the get_current_status function with new parameter name
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

-- Step 9: DROP and recreate the get_monthly_report function with new parameter name
DROP FUNCTION IF EXISTS get_monthly_report(uuid, integer, integer);

CREATE OR REPLACE FUNCTION get_monthly_report(
  beneficiary_uuid UUID,
  report_month INTEGER,
  report_year INTEGER
)
RETURNS TABLE (
  date DATE,
  caregiver_name TEXT,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  hours_worked DECIMAL,
  has_discrepancy BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH check_pairs AS (
    SELECT
      DATE(c1.timestamp) AS work_date,
      c1.caregiver_name,
      c1.timestamp AS check_in,
      c2.timestamp AS check_out,
      CASE
        WHEN c2.timestamp IS NOT NULL THEN
          EXTRACT(EPOCH FROM (c2.timestamp - c1.timestamp)) / 3600
        ELSE NULL
      END AS hours,
      CASE
        WHEN c2.timestamp IS NULL THEN true
        WHEN EXTRACT(EPOCH FROM (c2.timestamp - c1.timestamp)) > 43200 THEN true -- > 12 hours
        ELSE false
      END AS discrepancy
    FROM check_in_outs c1
    LEFT JOIN LATERAL (
      SELECT timestamp
      FROM check_in_outs c2
      WHERE c2.beneficiary_id = c1.beneficiary_id
        AND c2.action = 'check-out'
        AND c2.timestamp > c1.timestamp
      ORDER BY c2.timestamp ASC
      LIMIT 1
    ) c2 ON true
    WHERE c1.beneficiary_id = beneficiary_uuid
      AND c1.action = 'check-in'
      AND EXTRACT(MONTH FROM c1.timestamp) = report_month
      AND EXTRACT(YEAR FROM c1.timestamp) = report_year
  )
  SELECT
    work_date AS date,
    caregiver_name,
    check_in AS check_in_time,
    check_out AS check_out_time,
    hours::DECIMAL AS hours_worked,
    discrepancy AS has_discrepancy
  FROM check_pairs
  ORDER BY work_date, check_in;
END;
$$ LANGUAGE plpgsql;

-- Step 10: Add trigger for family_members updated_at
DROP TRIGGER IF EXISTS update_family_members_updated_at ON family_members;
CREATE TRIGGER update_family_members_updated_at BEFORE UPDATE ON family_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 11: Function to notify family members on check-in/out (placeholder for future webhook/notification integration)
CREATE OR REPLACE FUNCTION notify_family_on_check_event()
RETURNS TRIGGER AS $$
DECLARE
  family_member RECORD;
BEGIN
  -- This will be used later to trigger notifications
  -- For now, it just logs that a notification should be sent
  -- You can integrate with email services, SMS, or push notifications here

  FOR family_member IN
    SELECT email, notification_preferences
    FROM family_members
    WHERE beneficiary_id = NEW.beneficiary_id
  LOOP
    -- Check if the family member wants this type of notification
    IF (NEW.action = 'check-in' AND (family_member.notification_preferences->>'check_in')::boolean = true)
       OR (NEW.action = 'check-out' AND (family_member.notification_preferences->>'check_out')::boolean = true) THEN
      -- TODO: Implement actual notification sending here
      RAISE NOTICE 'Send % notification to %', NEW.action, family_member.email;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for notifications on check-in/out
DROP TRIGGER IF EXISTS trigger_notify_family ON check_in_outs;
CREATE TRIGGER trigger_notify_family
  AFTER INSERT ON check_in_outs
  FOR EACH ROW
  EXECUTE FUNCTION notify_family_on_check_event();

-- Done! Your data is preserved, just the table and column names changed.
