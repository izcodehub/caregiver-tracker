-- Add color column to existing caregivers table and populate it
-- This works with the existing structure where caregivers are linked to beneficiaries

-- Step 1: Add color column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'caregivers' AND column_name = 'color'
  ) THEN
    ALTER TABLE caregivers ADD COLUMN color TEXT;
  END IF;
END $$;

-- Step 2: Function to normalize caregiver names (First Name Capitalized + LAST NAME CAPS)
CREATE OR REPLACE FUNCTION normalize_caregiver_name(input_name TEXT)
RETURNS TEXT AS $$
DECLARE
  parts TEXT[];
  first_name TEXT;
  last_name TEXT;
BEGIN
  -- Split by space
  parts := string_to_array(trim(input_name), ' ');

  IF array_length(parts, 1) >= 2 THEN
    -- First name: capitalize first letter, lowercase rest
    first_name := initcap(parts[1]);

    -- Last name: all uppercase
    last_name := upper(parts[2]);

    RETURN first_name || ' ' || last_name;
  ELSE
    -- If only one word, just capitalize first letter
    RETURN initcap(input_name);
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 3: Assign colors to caregivers based on their normalized names
-- Same normalized name = same color across all beneficiaries
DO $$
DECLARE
  rec RECORD;
  available_colors TEXT[] := ARRAY[
    '#EF4444', -- red
    '#F59E0B', -- amber
    '#10B981', -- emerald
    '#3B82F6', -- blue
    '#8B5CF6', -- violet
    '#EC4899', -- pink
    '#14B8A6', -- teal
    '#F97316', -- orange
    '#06B6D4', -- cyan
    '#A855F7', -- purple
    '#84CC16', -- lime
    '#6366F1'  -- indigo
  ];
  color_index INTEGER := 0;
  name_color_map HSTORE := ''::HSTORE;
  normalized_name TEXT;
  assigned_color TEXT;
BEGIN
  -- Get all distinct normalized names and assign colors
  FOR rec IN
    SELECT DISTINCT normalize_caregiver_name(name) AS norm_name
    FROM caregivers
    WHERE name IS NOT NULL
    ORDER BY normalize_caregiver_name(name)
  LOOP
    normalized_name := rec.norm_name;

    -- Check if we already assigned a color to this normalized name
    assigned_color := name_color_map -> normalized_name;

    IF assigned_color IS NULL THEN
      -- Assign next color
      assigned_color := available_colors[(color_index % array_length(available_colors, 1)) + 1];
      name_color_map := name_color_map || hstore(normalized_name, assigned_color);
      color_index := color_index + 1;
    END IF;

    -- Update all caregivers with this normalized name to have the same color
    UPDATE caregivers
    SET color = assigned_color,
        name = normalized_name  -- Also normalize the name in the database
    WHERE normalize_caregiver_name(name) = normalized_name
      AND (color IS NULL OR color != assigned_color);
  END LOOP;
END $$;

-- Step 4: Create or replace the get_or_create_caregiver function to include color assignment
CREATE OR REPLACE FUNCTION get_or_create_caregiver(
  p_beneficiary_id UUID,
  p_caregiver_name TEXT
)
RETURNS UUID AS $$
DECLARE
  v_caregiver_id UUID;
  normalized_name TEXT;
  existing_color TEXT;
  available_colors TEXT[] := ARRAY[
    '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899',
    '#14B8A6', '#F97316', '#06B6D4', '#A855F7', '#84CC16', '#6366F1'
  ];
  color_count INTEGER;
BEGIN
  -- Normalize the name
  normalized_name := normalize_caregiver_name(p_caregiver_name);

  -- Try to find existing caregiver for this beneficiary
  SELECT id INTO v_caregiver_id
  FROM caregivers
  WHERE beneficiary_id = p_beneficiary_id
    AND normalize_caregiver_name(name) = normalized_name
  LIMIT 1;

  -- If not found, create new caregiver
  IF v_caregiver_id IS NULL THEN
    -- Check if this normalized name exists for other beneficiaries (to use same color)
    SELECT color INTO existing_color
    FROM caregivers
    WHERE normalize_caregiver_name(name) = normalized_name
      AND color IS NOT NULL
    LIMIT 1;

    -- If no existing color, assign a new one
    IF existing_color IS NULL THEN
      SELECT COUNT(DISTINCT normalize_caregiver_name(name)) INTO color_count
      FROM caregivers
      WHERE color IS NOT NULL;

      existing_color := available_colors[(color_count % array_length(available_colors, 1)) + 1];
    END IF;

    -- Create new caregiver with color
    INSERT INTO caregivers (beneficiary_id, name, color)
    VALUES (p_beneficiary_id, normalized_name, existing_color)
    RETURNING id INTO v_caregiver_id;
  END IF;

  RETURN v_caregiver_id;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Migrate existing check_in_outs to link to caregiver records
DO $$
DECLARE
  rec RECORD;
  v_caregiver_id UUID;
BEGIN
  -- Process all check_in_outs that don't have a caregiver_id but have a caregiver_name
  FOR rec IN
    SELECT DISTINCT beneficiary_id, caregiver_name
    FROM check_in_outs
    WHERE caregiver_name IS NOT NULL
      AND (caregiver_id IS NULL OR caregiver_id NOT IN (SELECT id FROM caregivers))
  LOOP
    -- Get or create caregiver for this beneficiary
    v_caregiver_id := get_or_create_caregiver(rec.beneficiary_id, rec.caregiver_name);

    -- Update all matching check-ins
    UPDATE check_in_outs
    SET caregiver_id = v_caregiver_id
    WHERE beneficiary_id = rec.beneficiary_id
      AND caregiver_name = rec.caregiver_name
      AND (caregiver_id IS NULL OR caregiver_id != v_caregiver_id);
  END LOOP;
END $$;

COMMENT ON COLUMN caregivers.color IS 'Hex color code assigned to this caregiver for UI consistency. Same normalized name = same color across beneficiaries.';
