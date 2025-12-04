-- Add NFC support to beneficiaries table
-- This migration adds secure NFC check-in capability

-- Add nfc_secret column to beneficiaries (formerly elderly) table
ALTER TABLE beneficiaries
ADD COLUMN IF NOT EXISTS nfc_secret VARCHAR(255) UNIQUE;

-- Generate random NFC secrets for existing beneficiaries
UPDATE beneficiaries
SET nfc_secret = gen_random_uuid()::text
WHERE nfc_secret IS NULL;

-- Make nfc_secret NOT NULL after populating
ALTER TABLE beneficiaries
ALTER COLUMN nfc_secret SET NOT NULL;

-- Add verification fields to check_in_outs table
ALTER TABLE check_in_outs
ADD COLUMN IF NOT EXISTS verification_method VARCHAR(50) DEFAULT 'qr',
ADD COLUMN IF NOT EXISTS nfc_challenge_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_flags JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS tap_timestamp TIMESTAMPTZ;

-- Add index on nfc_secret for fast lookups
CREATE INDEX IF NOT EXISTS idx_beneficiaries_nfc_secret ON beneficiaries(nfc_secret);

-- Add index on nfc_challenge_token to prevent replay attacks
CREATE INDEX IF NOT EXISTS idx_check_in_outs_nfc_token ON check_in_outs(nfc_challenge_token);

-- Create table to track used NFC tokens (prevent replay attacks)
CREATE TABLE IF NOT EXISTS nfc_used_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenge_token VARCHAR(255) UNIQUE NOT NULL,
  beneficiary_id UUID NOT NULL REFERENCES beneficiaries(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_nfc_used_tokens_created_at ON nfc_used_tokens(created_at);

-- Enable RLS
ALTER TABLE nfc_used_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to nfc_used_tokens" ON nfc_used_tokens FOR ALL USING (true);

-- Function to generate time-based challenge token
CREATE OR REPLACE FUNCTION generate_nfc_challenge(
  p_beneficiary_id UUID,
  p_nfc_secret VARCHAR
)
RETURNS TABLE (
  success BOOLEAN,
  challenge_token VARCHAR,
  expires_at TIMESTAMPTZ,
  message TEXT
) AS $$
DECLARE
  v_stored_secret VARCHAR;
  v_challenge VARCHAR;
  v_expires TIMESTAMPTZ;
BEGIN
  -- Verify NFC secret matches
  SELECT nfc_secret INTO v_stored_secret
  FROM beneficiaries
  WHERE id = p_beneficiary_id;

  IF v_stored_secret IS NULL THEN
    RETURN QUERY SELECT false, NULL::VARCHAR, NULL::TIMESTAMPTZ, 'Beneficiary not found';
    RETURN;
  END IF;

  IF v_stored_secret != p_nfc_secret THEN
    RETURN QUERY SELECT false, NULL::VARCHAR, NULL::TIMESTAMPTZ, 'Invalid NFC secret';
    RETURN;
  END IF;

  -- Generate challenge token (UUID + timestamp hash)
  v_challenge := gen_random_uuid()::text || '-' || EXTRACT(EPOCH FROM NOW())::text;
  v_expires := NOW() + INTERVAL '10 minutes';

  RETURN QUERY SELECT true, v_challenge, v_expires, 'Challenge generated successfully';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate NFC check-in submission
CREATE OR REPLACE FUNCTION validate_nfc_checkin(
  p_beneficiary_id UUID,
  p_nfc_secret VARCHAR,
  p_challenge_token VARCHAR,
  p_tap_timestamp TIMESTAMPTZ
)
RETURNS TABLE (
  is_valid BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_stored_secret VARCHAR;
  v_token_used BOOLEAN;
  v_tap_age_seconds INTEGER;
BEGIN
  -- Check if token already used
  SELECT EXISTS(
    SELECT 1 FROM nfc_used_tokens WHERE challenge_token = p_challenge_token
  ) INTO v_token_used;

  IF v_token_used THEN
    RETURN QUERY SELECT false, 'This NFC tap has already been used';
    RETURN;
  END IF;

  -- Verify NFC secret
  SELECT nfc_secret INTO v_stored_secret
  FROM beneficiaries
  WHERE id = p_beneficiary_id;

  IF v_stored_secret IS NULL OR v_stored_secret != p_nfc_secret THEN
    RETURN QUERY SELECT false, 'Invalid NFC credentials';
    RETURN;
  END IF;

  -- Check tap timestamp is recent (within 15 minutes)
  v_tap_age_seconds := EXTRACT(EPOCH FROM (NOW() - p_tap_timestamp));

  IF v_tap_age_seconds > 900 THEN -- 15 minutes
    RETURN QUERY SELECT false, 'NFC tap expired. Please tap the card again';
    RETURN;
  END IF;

  IF v_tap_age_seconds < 0 THEN
    RETURN QUERY SELECT false, 'Invalid tap timestamp';
    RETURN;
  END IF;

  -- Mark token as used
  INSERT INTO nfc_used_tokens (challenge_token, beneficiary_id)
  VALUES (p_challenge_token, p_beneficiary_id);

  RETURN QUERY SELECT true, 'NFC check-in validated';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup function for old used tokens (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_nfc_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM nfc_used_tokens
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON COLUMN beneficiaries.nfc_secret IS 'Secret key embedded in NFC tag for secure check-in validation';
COMMENT ON COLUMN check_in_outs.verification_method IS 'Method used for check-in: qr, nfc, location, photo, or manual';
COMMENT ON COLUMN check_in_outs.nfc_challenge_token IS 'One-time use token generated from NFC tap';
COMMENT ON COLUMN check_in_outs.is_verified IS 'Whether the check-in has been verified through secure method';
COMMENT ON COLUMN check_in_outs.verification_flags IS 'JSON object with verification details: {nfc_validated, within_geofence, has_photo}';
COMMENT ON COLUMN check_in_outs.tap_timestamp IS 'Timestamp when NFC card was tapped';
