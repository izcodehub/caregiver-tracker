-- Caregiver Tracker Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Family Members Table
CREATE TABLE family_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  notification_preferences JSONB DEFAULT '{"email": true, "sms": false, "push": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Elderly Table
CREATE TABLE elderly (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  qr_code TEXT UNIQUE NOT NULL,
  address TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  family_ids UUID[] DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Check-ins/Check-outs Table
CREATE TABLE check_in_outs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  elderly_id UUID NOT NULL REFERENCES elderly(id) ON DELETE CASCADE,
  caregiver_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('check-in', 'check-out')),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  photo_url TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX idx_check_in_outs_elderly_id ON check_in_outs(elderly_id);
CREATE INDEX idx_check_in_outs_timestamp ON check_in_outs(timestamp DESC);
CREATE INDEX idx_elderly_qr_code ON elderly(qr_code);

-- Enable Row Level Security (RLS)
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE elderly ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_in_outs ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Allow all for now - you can restrict based on auth later)
CREATE POLICY "Allow all access to family_members" ON family_members FOR ALL USING (true);
CREATE POLICY "Allow all access to elderly" ON elderly FOR ALL USING (true);
CREATE POLICY "Allow all access to check_in_outs" ON check_in_outs FOR ALL USING (true);

-- Function to get current status (is caregiver currently checked in?)
CREATE OR REPLACE FUNCTION get_current_status(elderly_uuid UUID)
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
    WHERE elderly_id = elderly_uuid
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
    WHERE elderly_id = elderly_uuid
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

-- Function to calculate monthly hours and generate report
CREATE OR REPLACE FUNCTION get_monthly_report(
  elderly_uuid UUID,
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
      WHERE c2.elderly_id = c1.elderly_id
        AND c2.action = 'check-out'
        AND c2.timestamp > c1.timestamp
      ORDER BY c2.timestamp ASC
      LIMIT 1
    ) c2 ON true
    WHERE c1.elderly_id = elderly_uuid
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
