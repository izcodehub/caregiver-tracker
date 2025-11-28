-- Add Users Table for Authentication and Account Management
-- Run this in your Supabase SQL Editor AFTER the main schema.sql

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'family' CHECK (role IN ('admin', 'family')),
  elderly_id UUID REFERENCES elderly(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update elderly table to add country and currency fields if not exists
ALTER TABLE elderly ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'FR';
ALTER TABLE elderly ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT '€';
ALTER TABLE elderly ADD COLUMN IF NOT EXISTS regular_rate DECIMAL(10, 2) DEFAULT 15.00;
ALTER TABLE elderly ADD COLUMN IF NOT EXISTS holiday_rate DECIMAL(10, 2) DEFAULT 22.50;

-- Index for users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_elderly_id ON users(elderly_id);

-- Enable RLS for users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users (Allow all for now - you can restrict based on auth later)
CREATE POLICY "Allow all access to users" ON users FOR ALL USING (true);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
