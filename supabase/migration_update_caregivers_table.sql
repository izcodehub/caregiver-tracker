-- Update existing caregivers table to add color column and populate with existing data
-- This migration handles the case where the caregivers table already exists but is empty

-- Add color column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'caregivers' AND column_name = 'color'
  ) THEN
    ALTER TABLE caregivers ADD COLUMN color TEXT;
  END IF;
END $$;

-- Add caregiver_id to check_in_outs if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'check_in_outs' AND column_name = 'caregiver_id'
  ) THEN
    ALTER TABLE check_in_outs ADD COLUMN caregiver_id UUID REFERENCES caregivers(id);
  END IF;
END $$;

-- Create index for faster lookups if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_check_in_outs_caregiver_id ON check_in_outs(caregiver_id);

-- Function to normalize caregiver names (First Name Capitalized + LAST NAME CAPS)
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

-- Function to get or create caregiver and return ID
CREATE OR REPLACE FUNCTION get_or_create_caregiver(input_name TEXT)
RETURNS UUID AS $$
DECLARE
  normalized_name TEXT;
  caregiver_id UUID;
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
  used_colors TEXT[];
  new_color TEXT;
  color_count INTEGER;
BEGIN
  -- Normalize the name
  normalized_name := normalize_caregiver_name(input_name);

  -- Try to find existing caregiver
  SELECT id INTO caregiver_id
  FROM caregivers
  WHERE name = normalized_name;

  -- If found, return the ID
  IF FOUND THEN
    RETURN caregiver_id;
  END IF;

  -- Get already used colors (only non-null colors)
  SELECT array_agg(color) INTO used_colors
  FROM caregivers
  WHERE color IS NOT NULL;

  -- Find first available color
  IF used_colors IS NULL THEN
    new_color := available_colors[1];
  ELSE
    -- Find first color not in use
    SELECT color INTO new_color
    FROM unnest(available_colors) AS color
    WHERE color != ALL(used_colors)
    LIMIT 1;

    -- If all colors are used, cycle through them
    IF new_color IS NULL THEN
      SELECT COUNT(*) INTO color_count FROM caregivers WHERE color IS NOT NULL;
      new_color := available_colors[1 + (color_count % array_length(available_colors, 1))];
    END IF;
  END IF;

  -- Create new caregiver
  INSERT INTO caregivers (name, color)
  VALUES (normalized_name, new_color)
  RETURNING id INTO caregiver_id;

  RETURN caregiver_id;
END;
$$ LANGUAGE plpgsql;

-- Migrate existing caregiver_name data to caregivers table
-- First, populate empty caregivers table with existing names from check_in_outs
DO $$
DECLARE
  rec RECORD;
  new_caregiver_id UUID;
BEGIN
  -- Process all distinct caregiver names from check_in_outs
  FOR rec IN
    SELECT DISTINCT caregiver_name
    FROM check_in_outs
    WHERE caregiver_name IS NOT NULL
  LOOP
    -- Get or create caregiver
    new_caregiver_id := get_or_create_caregiver(rec.caregiver_name);

    -- Update check_in_outs records that don't have a caregiver_id yet
    UPDATE check_in_outs
    SET caregiver_id = new_caregiver_id
    WHERE caregiver_name = rec.caregiver_name
      AND (caregiver_id IS NULL OR caregiver_id != new_caregiver_id);
  END LOOP;
END $$;

COMMENT ON TABLE caregivers IS 'Normalized caregiver names with assigned colors for UI display';
COMMENT ON COLUMN caregivers.name IS 'Normalized name: First Name Capitalized + LAST NAME CAPS';
COMMENT ON COLUMN caregivers.color IS 'Hex color code assigned to this caregiver for UI consistency';
COMMENT ON FUNCTION normalize_caregiver_name(TEXT) IS 'Normalizes caregiver names to consistent format';
COMMENT ON FUNCTION get_or_create_caregiver(TEXT) IS 'Gets existing or creates new caregiver, returns ID';
