# Database Setup Instructions

This guide explains how to set up the Supabase database for the Caregiver Tracker application.

## Initial Setup

1. **Run the main schema** (`schema.sql`)
   - This creates the core tables: `family_members`, `elderly`, and `check_in_outs`
   - Includes indexes, RLS policies, and helper functions

2. **Run the users migration** (`migration_add_users_fixed.sql`)
   - This creates the `users` table for authentication
   - Adds `country`, `currency`, `regular_rate`, and `holiday_rate` columns to the `elderly` table
   - Sets up necessary indexes and RLS policies

3. **Run the rename migration** (`migration_rename_to_beneficiary.sql`)
   - Renames `elderly` table to `beneficiaries` throughout the database
   - Restructures family relationships (many family members to one beneficiary)
   - Updates all foreign keys, indexes, and RLS policies
   - Adds notification trigger for check-in/check-out events

## Running the SQL Scripts

### In Supabase Dashboard:

1. Go to your Supabase project
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste the contents of `schema.sql`
5. Click **Run** (or press F5)
6. Create another new query
7. Copy and paste the contents of `migration_add_users.sql`
8. Click **Run** (or press F5)

### Using Supabase CLI (optional):

```bash
# First, make sure you're logged in
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Run the migrations
supabase db push
```

## Database Schema Overview

### Tables:

- **users**: Stores user accounts (for authentication)
- **beneficiaries**: Stores beneficiary information and QR codes
- **check_in_outs**: Stores caregiver check-in/check-out records
- **family_members**: Stores family member contact info with many-to-one relationship to beneficiaries (for notifications)

### Key Features:

- **Country-based holiday calendars**: Each beneficiary record has a `country` field (FR, US, etc.)
- **Flexible pricing**: Regular and holiday hourly rates stored per beneficiary
- **QR code tracking**: Each beneficiary gets a unique QR code for check-ins
- **Geolocation**: Optional latitude/longitude tracking for verification
- **Family notifications**: Multiple family members can be associated with one beneficiary and receive notifications for check-ins/outs
- **Notification preferences**: Each family member can customize their notification settings (email, SMS, push, check-in, check-out)

## Default Admin Account

After running the migrations, you'll need to manually create an admin account or use the signup page to create the first account.

For testing, you can create an admin user manually:

```sql
-- Hash for password "admin123"
INSERT INTO users (email, password_hash, name, role)
VALUES (
  'admin@caregiver-tracker.com',
  '$2a$10$YourHashedPasswordHere',
  'Admin User',
  'admin'
);
```

## Signup Flow

The application now supports self-service signup:

1. Users visit `/login` and click "Need an account? Sign up"
2. They provide:
   - Their name
   - Beneficiary name
   - Beneficiary address (used to detect country for holiday calendar)
   - Regular and holiday hourly rates
   - Email and password
3. The system:
   - Detects country from address (France → FR, otherwise US)
   - Creates a `beneficiaries` record with a unique QR code
   - Creates a `users` record linked to that beneficiary
   - Creates a `family_members` record for the person who signed up (marked as "primary")
   - Assigns the appropriate holiday calendar based on country
   - Sets up notification preferences for the primary family member

## Next Steps

After setting up the database:

1. Update your `.env.local` with Supabase credentials
2. Test the signup flow at `/login`
3. Verify the admin panel works at `/admin`
4. Generate and print QR codes for caregivers to scan
