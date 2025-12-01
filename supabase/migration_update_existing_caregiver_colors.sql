-- Update existing caregiver colors to avoid red/green confusion
-- Run this AFTER migration_add_color_to_caregivers_v2.sql has been run

-- Create temporary table to map normalized names to new colors
CREATE TEMP TABLE IF NOT EXISTS temp_new_colors (
  normalized_name TEXT PRIMARY KEY,
  color TEXT NOT NULL
);

-- Assign new distinct colors (avoiding red/green)
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
  -- Get all unique normalized names ordered alphabetically
  FOR rec IN
    SELECT DISTINCT normalize_caregiver_name(name) AS norm_name
    FROM caregivers
    WHERE name IS NOT NULL
    ORDER BY normalize_caregiver_name(name)
  LOOP
    -- Assign color from the palette
    INSERT INTO temp_new_colors (normalized_name, color)
    VALUES (
      rec.norm_name,
      available_colors[(color_index % array_length(available_colors, 1)) + 1]
    )
    ON CONFLICT (normalized_name) DO NOTHING;

    color_index := color_index + 1;
  END LOOP;
END $$;

-- Update all caregivers with the new colors
UPDATE caregivers c
SET color = t.color
FROM temp_new_colors t
WHERE normalize_caregiver_name(c.name) = t.normalized_name;

-- Show the color assignments for verification
SELECT
  t.normalized_name,
  t.color,
  COUNT(*) as caregiver_count
FROM temp_new_colors t
JOIN caregivers c ON normalize_caregiver_name(c.name) = t.normalized_name
GROUP BY t.normalized_name, t.color
ORDER BY t.normalized_name;

-- Drop temp table
DROP TABLE IF EXISTS temp_new_colors;
