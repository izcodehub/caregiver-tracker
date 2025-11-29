-- Migration: Add is_training field to check_in_outs table
-- This field marks check-ins for training purposes (Binome ADV) which should not be billed

-- Add is_training column
ALTER TABLE check_in_outs
ADD COLUMN IF NOT EXISTS is_training BOOLEAN DEFAULT false;

-- Add comment
COMMENT ON COLUMN check_in_outs.is_training IS 'Marks if this check-in is for training/formation purposes (Binome ADV) and should not be charged';
