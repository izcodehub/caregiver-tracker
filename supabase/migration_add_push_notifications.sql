-- Migration: Add Push Notifications Support
-- This migration adds tables to store push notification subscriptions

-- Push Subscriptions Table
-- Stores web push notification endpoints for family members
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(family_member_id, endpoint)
);

-- Notifications Log Table
-- Tracks all notifications sent for debugging and analytics
CREATE TABLE IF NOT EXISTS notifications_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beneficiary_id UUID REFERENCES beneficiaries(id) ON DELETE CASCADE,
  check_in_out_id UUID REFERENCES check_in_outs(id) ON DELETE CASCADE,
  family_member_id UUID REFERENCES family_members(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- 'push', 'realtime', 'email'
  status TEXT NOT NULL, -- 'sent', 'failed', 'pending'
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_family_member ON push_subscriptions(family_member_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_notifications_log_beneficiary ON notifications_log(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_notifications_log_check_in_out ON notifications_log(check_in_out_id);
CREATE INDEX IF NOT EXISTS idx_notifications_log_created ON notifications_log(created_at DESC);

-- Enable RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for now - restrict based on auth later)
CREATE POLICY "Allow all access to push_subscriptions" ON push_subscriptions FOR ALL USING (true);
CREATE POLICY "Allow all access to notifications_log" ON notifications_log FOR ALL USING (true);

-- Function to get active family members for a beneficiary
CREATE OR REPLACE FUNCTION get_family_members_for_notification(beneficiary_uuid UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  notification_preferences JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    fm.id,
    fm.name,
    fm.email,
    fm.notification_preferences
  FROM family_members fm
  WHERE fm.id = ANY(
    SELECT unnest(family_ids)
    FROM beneficiaries
    WHERE beneficiaries.id = beneficiary_uuid
  );
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old inactive subscriptions (run periodically)
CREATE OR REPLACE FUNCTION cleanup_inactive_subscriptions()
RETURNS void AS $$
BEGIN
  DELETE FROM push_subscriptions
  WHERE is_active = false
    AND last_used_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE push_subscriptions IS 'Stores web push notification subscription endpoints for family members';
COMMENT ON TABLE notifications_log IS 'Audit log of all notifications sent through the system';
COMMENT ON FUNCTION get_family_members_for_notification IS 'Returns all family members associated with a beneficiary for notification purposes';
