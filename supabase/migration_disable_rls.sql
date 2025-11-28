-- Disable RLS on all tables since we're using anon key without auth
-- This is acceptable for this app since access control is handled at the application level

-- Disable RLS on beneficiaries
ALTER TABLE beneficiaries DISABLE ROW LEVEL SECURITY;

-- Disable RLS on check_in_outs
ALTER TABLE check_in_outs DISABLE ROW LEVEL SECURITY;

-- Disable RLS on users (if it was enabled)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Disable RLS on family_members (if it exists)
ALTER TABLE family_members DISABLE ROW LEVEL SECURITY;

-- Disable RLS on caregivers (if it exists)
ALTER TABLE IF EXISTS caregivers DISABLE ROW LEVEL SECURITY;

-- Disable RLS on caregiver_reviews (if it exists)
ALTER TABLE IF EXISTS caregiver_reviews DISABLE ROW LEVEL SECURITY;

-- Disable RLS on day_notes (if it exists)
ALTER TABLE IF EXISTS day_notes DISABLE ROW LEVEL SECURITY;

-- Note: This app doesn't use Supabase Auth, it uses custom authentication
-- with password hashing in the users table. RLS based on auth.uid() won't work.
