-- Migration: Add beneficiary_rate_history table for time-based rate tracking
-- This allows beneficiaries to have different rates at different time periods
-- Historical check-ins will use the rate that was effective at that time

-- Create the rate history table
CREATE TABLE IF NOT EXISTS beneficiary_rate_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id UUID NOT NULL REFERENCES beneficiaries(id) ON DELETE CASCADE,
  rate NUMERIC(10, 2) NOT NULL,
  effective_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT positive_rate CHECK (rate > 0)
);

-- Add index for efficient lookups by beneficiary and date
CREATE INDEX IF NOT EXISTS idx_rate_history_beneficiary_date
  ON beneficiary_rate_history(beneficiary_id, effective_date DESC);

-- Add comments
COMMENT ON TABLE beneficiary_rate_history IS 'Stores the history of rate changes for each beneficiary with effective dates';
COMMENT ON COLUMN beneficiary_rate_history.beneficiary_id IS 'Reference to the beneficiary';
COMMENT ON COLUMN beneficiary_rate_history.rate IS 'The regular hourly rate (before any majoration) in effect from this date';
COMMENT ON COLUMN beneficiary_rate_history.effective_date IS 'The date when this rate becomes active';
COMMENT ON COLUMN beneficiary_rate_history.created_at IS 'When this rate record was created (audit trail)';

-- Create a unique constraint to prevent duplicate rates for the same beneficiary on the same date
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_history_unique_beneficiary_date
  ON beneficiary_rate_history(beneficiary_id, effective_date);
