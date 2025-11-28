-- Migration: Add Caregivers table, Reviews, Notes, and Ticket Moderateur
-- This adds caregiver management, family reviews, modification notes, and cost calculations

-- Step 1: Create caregivers table
CREATE TABLE IF NOT EXISTS caregivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beneficiary_id UUID NOT NULL REFERENCES beneficiaries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT, -- General notes about the caregiver
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Create caregiver_reviews table (family feedback)
CREATE TABLE IF NOT EXISTS caregiver_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  caregiver_id UUID NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  beneficiary_id UUID NOT NULL REFERENCES beneficiaries(id) ON DELETE CASCADE,
  family_member_id UUID REFERENCES family_members(id) ON DELETE SET NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5), -- 1-5 stars
  interaction_quality TEXT, -- How beneficiary interacts with this caregiver
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Create day_notes table (for modifications, cancellations, special instructions)
CREATE TABLE IF NOT EXISTS day_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beneficiary_id UUID NOT NULL REFERENCES beneficiaries(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  note_type TEXT CHECK (note_type IN ('modification', 'cancellation', 'special_instruction', 'general')),
  original_time TEXT, -- e.g., "09:00-11:00"
  modified_time TEXT, -- e.g., "10:00-12:00"
  reason TEXT,
  created_by UUID REFERENCES family_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 4: Add ticket_moderateur to beneficiaries table
ALTER TABLE beneficiaries ADD COLUMN IF NOT EXISTS ticket_moderateur DECIMAL(5, 2) DEFAULT 0.00;
-- ticket_moderateur is a percentage (e.g., 22.22 means 22.22%)

-- Step 5: Add caregiver_id to check_in_outs table (link to caregiver instead of just name)
ALTER TABLE check_in_outs ADD COLUMN IF NOT EXISTS caregiver_id UUID REFERENCES caregivers(id) ON DELETE SET NULL;

-- Step 6: Create indexes
CREATE INDEX IF NOT EXISTS idx_caregivers_beneficiary_id ON caregivers(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_caregivers_name ON caregivers(name);
CREATE INDEX IF NOT EXISTS idx_caregiver_reviews_caregiver_id ON caregiver_reviews(caregiver_id);
CREATE INDEX IF NOT EXISTS idx_caregiver_reviews_beneficiary_id ON caregiver_reviews(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_day_notes_beneficiary_id ON day_notes(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_day_notes_date ON day_notes(date);
CREATE INDEX IF NOT EXISTS idx_check_in_outs_caregiver_id ON check_in_outs(caregiver_id);

-- Step 7: Enable RLS
ALTER TABLE caregivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE caregiver_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_notes ENABLE ROW LEVEL SECURITY;

-- Step 8: Create RLS policies
DROP POLICY IF EXISTS "Allow all access to caregivers" ON caregivers;
CREATE POLICY "Allow all access to caregivers" ON caregivers FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all access to caregiver_reviews" ON caregiver_reviews;
CREATE POLICY "Allow all access to caregiver_reviews" ON caregiver_reviews FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all access to day_notes" ON day_notes;
CREATE POLICY "Allow all access to day_notes" ON day_notes FOR ALL USING (true);

-- Step 9: Add triggers for updated_at
DROP TRIGGER IF EXISTS update_caregivers_updated_at ON caregivers;
CREATE TRIGGER update_caregivers_updated_at BEFORE UPDATE ON caregivers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_caregiver_reviews_updated_at ON caregiver_reviews;
CREATE TRIGGER update_caregiver_reviews_updated_at BEFORE UPDATE ON caregiver_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_day_notes_updated_at ON day_notes;
CREATE TRIGGER update_day_notes_updated_at BEFORE UPDATE ON day_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 10: Function to get or create caregiver by name
CREATE OR REPLACE FUNCTION get_or_create_caregiver(
  p_beneficiary_id UUID,
  p_caregiver_name TEXT
)
RETURNS UUID AS $$
DECLARE
  v_caregiver_id UUID;
BEGIN
  -- Try to find existing caregiver for this beneficiary
  SELECT id INTO v_caregiver_id
  FROM caregivers
  WHERE beneficiary_id = p_beneficiary_id
    AND LOWER(name) = LOWER(p_caregiver_name)
  LIMIT 1;

  -- If not found, create new caregiver
  IF v_caregiver_id IS NULL THEN
    INSERT INTO caregivers (beneficiary_id, name)
    VALUES (p_beneficiary_id, p_caregiver_name)
    RETURNING id INTO v_caregiver_id;
  END IF;

  RETURN v_caregiver_id;
END;
$$ LANGUAGE plpgsql;

-- Step 11: Function to get currently checked-in caregivers (for check-out autocomplete)
CREATE OR REPLACE FUNCTION get_checked_in_caregivers(p_beneficiary_id UUID)
RETURNS TABLE (
  caregiver_id UUID,
  caregiver_name TEXT,
  check_in_time TIMESTAMPTZ,
  hours_since_checkin DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_actions AS (
    SELECT DISTINCT ON (c.caregiver_name)
      c.caregiver_name,
      c.caregiver_id,
      c.action,
      c.timestamp,
      EXTRACT(EPOCH FROM (NOW() - c.timestamp)) / 3600 AS hours_elapsed
    FROM check_in_outs c
    WHERE c.beneficiary_id = p_beneficiary_id
      AND DATE(c.timestamp) = CURRENT_DATE
    ORDER BY c.caregiver_name, c.timestamp DESC
  )
  SELECT
    la.caregiver_id,
    la.caregiver_name,
    la.timestamp AS check_in_time,
    la.hours_elapsed::DECIMAL AS hours_since_checkin
  FROM latest_actions la
  WHERE la.action = 'check-in';
END;
$$ LANGUAGE plpgsql;

-- Step 12: Function to calculate total with ticket moderateur
CREATE OR REPLACE FUNCTION calculate_beneficiary_cost(
  p_beneficiary_id UUID,
  p_month INTEGER,
  p_year INTEGER
)
RETURNS TABLE (
  total_amount DECIMAL,
  ticket_moderateur_percentage DECIMAL,
  amount_to_pay DECIMAL,
  insurance_coverage DECIMAL
) AS $$
DECLARE
  v_ticket_moderateur DECIMAL;
  v_total DECIMAL := 0;
BEGIN
  -- Get ticket moderateur percentage
  SELECT ticket_moderateur INTO v_ticket_moderateur
  FROM beneficiaries
  WHERE id = p_beneficiary_id;

  -- Calculate total amount (you'll need to implement the full calculation)
  -- This is a placeholder
  v_total := 1000.00; -- Replace with actual calculation

  RETURN QUERY
  SELECT
    v_total AS total_amount,
    v_ticket_moderateur AS ticket_moderateur_percentage,
    (v_total * v_ticket_moderateur / 100)::DECIMAL AS amount_to_pay,
    (v_total * (100 - v_ticket_moderateur) / 100)::DECIMAL AS insurance_coverage;
END;
$$ LANGUAGE plpgsql;

-- Done! Now you have:
-- 1. Caregivers table for auto-fill
-- 2. Reviews system for caregiver feedback
-- 3. Day notes for modifications/cancellations
-- 4. Ticket moderateur for cost calculations
