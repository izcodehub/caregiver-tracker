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

-- Step 3: Create temporary table to map normalized names to colors
CREATE TEMP TABLE IF NOT EXISTS temp_name_colors (
  normalized_name TEXT PRIMARY KEY,
  color TEXT NOT NULL
);

-- Step 4: Assign colors to unique normalized names
DO $$
DECLARE
  rec RECORD;
  available_colors TEXT[] := ARRAY[
    '#3B82F6', -- bright blue
    '#8B5CF6', -- violet
    '#EC4899', -- hot pink
    '#F59E0B', -- amber/orange
    '#06B6D4', -- cyan (turquoise)
    '#A855F7', -- purple
    '#6366F1', -- indigo
    '#D946EF', -- fuchsia/magenta
    '#EAB308', -- yellow
    '#F97316', -- dark orange
    '#0EA5E9', -- sky blue
    '#7C3AED', -- deep purple
    '#FB923C', -- coral
    '#C026D3', -- magenta/pink
    '#A78BFA', -- lavender
    '#F472B6'  -- light pink
  ];
  color_index INTEGER := 0;
BEGIN
  -- Insert all unique normalized names with assigned colors
  INSERT INTO temp_name_colors (normalized_name, color)
  SELECT
    normalize_caregiver_name(name) AS norm_name,
    available_colors[(ROW_NUMBER() OVER (ORDER BY normalize_caregiver_name(name)) - 1) % array_length(available_colors, 1) + 1] AS color
  FROM (
    SELECT DISTINCT name
    FROM caregivers
    WHERE name IS NOT NULL
  ) AS unique_names
  ON CONFLICT (normalized_name) DO NOTHING;
END $$;

-- Step 5: Update caregivers with colors and normalized names
UPDATE caregivers c
SET
  color = t.color,
  name = t.normalized_name
FROM temp_name_colors t
WHERE normalize_caregiver_name(c.name) = t.normalized_name;

-- Step 6: Drop temp table
DROP TABLE IF EXISTS temp_name_colors;

-- Step 7: Create or replace the get_or_create_caregiver function to include color assignment
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
    '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#06B6D4', '#A855F7',
    '#6366F1', '#D946EF', '#EAB308', '#F97316', '#0EA5E9', '#7C3AED',
    '#FB923C', '#C026D3', '#A78BFA', '#F472B6'
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

-- Step 8: Migrate existing check_in_outs to link to caregiver records
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
      AND caregiver_id IS NULL
  LOOP
    -- Get or create caregiver for this beneficiary
    v_caregiver_id := get_or_create_caregiver(rec.beneficiary_id, rec.caregiver_name);

    -- Update all matching check-ins
    UPDATE check_in_outs
    SET caregiver_id = v_caregiver_id
    WHERE beneficiary_id = rec.beneficiary_id
      AND caregiver_name = rec.caregiver_name
      AND caregiver_id IS NULL;
  END LOOP;
END $$;

COMMENT ON COLUMN caregivers.color IS 'Hex color code assigned to this caregiver for UI consistency. Same normalized name = same color across beneficiaries.';
