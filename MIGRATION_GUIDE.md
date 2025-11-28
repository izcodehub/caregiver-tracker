# Migration Guide: Elderly → Beneficiary

This guide explains how to migrate your existing database from using "elderly" terminology to "beneficiary" with proper family member relationships.

## What Changed?

### Database Changes:
1. **Table renamed**: `elderly` → `beneficiaries`
2. **Foreign keys renamed**: `elderly_id` → `beneficiary_id` in all tables
3. **New family structure**: `family_members` table now has a many-to-one relationship with beneficiaries
4. **Notification system**: Added trigger to notify family members on check-in/check-out events
5. **Family member roles**: `primary`, `secondary`, `emergency`
6. **Notification preferences**: Customizable per family member

### Code Changes:
1. All TypeScript types renamed: `Elderly` → `Beneficiary`
2. All variable names updated: `elderly`, `elderlyId` → `beneficiary`, `beneficiaryId`
3. All API routes updated to use beneficiary terminology
4. Dashboard URL changed: `/dashboard/[elderlyId]` → `/dashboard/[beneficiaryId]`

## Migration Steps

### Step 1: Run the Beneficiary Migration SQL

Go to your Supabase SQL Editor and run the following SQL:

```sql
-- Copy and paste the contents of: supabase/migration_rename_to_beneficiary.sql
```

This will:
- Rename the `elderly` table to `beneficiaries`
- Update all foreign keys
- Recreate the `family_members` table with proper relationships
- Add notification trigger
- Update all database functions

### Step 2: Verify the Migration

After running the migration, verify in your Supabase Table Editor that you have:

- ✅ `beneficiaries` table (not `elderly`)
- ✅ `family_members` table with `beneficiary_id` foreign key
- ✅ `check_in_outs` table with `beneficiary_id` column
- ✅ `users` table with `beneficiary_id` column

### Step 3: Test the Application

1. **Restart your dev server** (if it's running)
2. **Test login**: Go to `/login` and log in
3. **Test admin panel**: Verify you can see beneficiaries list
4. **Test dashboard**: Navigate to a beneficiary dashboard
5. **Test signup**: Try creating a new account

## Database Schema After Migration

### beneficiaries
- id (UUID)
- name (TEXT)
- qr_code (TEXT)
- address (TEXT)
- country (TEXT) - FR, US, etc.
- currency (TEXT) - €, $, etc.
- regular_rate (DECIMAL)
- holiday_rate (DECIMAL)
- latitude (DECIMAL)
- longitude (DECIMAL)
- created_at (TIMESTAMPTZ)

### family_members
- id (UUID)
- beneficiary_id (UUID) → FOREIGN KEY to beneficiaries
- name (TEXT)
- email (TEXT)
- phone (TEXT)
- role (TEXT) - primary, secondary, emergency
- notification_preferences (JSONB)
  - email: boolean
  - sms: boolean
  - push: boolean
  - check_in: boolean
  - check_out: boolean
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)

### users
- id (UUID)
- email (TEXT)
- password_hash (TEXT)
- name (TEXT)
- role (TEXT) - admin, family
- beneficiary_id (UUID) → FOREIGN KEY to beneficiaries
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)

### check_in_outs
- id (UUID)
- beneficiary_id (UUID) → FOREIGN KEY to beneficiaries
- caregiver_name (TEXT)
- action (TEXT) - check-in, check-out
- timestamp (TIMESTAMPTZ)
- photo_url (TEXT)
- latitude (DECIMAL)
- longitude (DECIMAL)
- created_at (TIMESTAMPTZ)

## Notification System

The migration includes a notification trigger that fires when caregivers check in or out:

```sql
CREATE TRIGGER trigger_notify_family
  AFTER INSERT ON check_in_outs
  FOR EACH ROW
  EXECUTE FUNCTION notify_family_on_check_event();
```

Currently, this trigger logs notifications. You can extend it to:
- Send emails via SendGrid/Resend
- Send SMS via Twilio
- Send push notifications via Firebase

## Rollback (If Needed)

If you need to rollback this migration:

1. Rename tables back:
```sql
ALTER TABLE beneficiaries RENAME TO elderly;
ALTER TABLE check_in_outs RENAME COLUMN beneficiary_id TO elderly_id;
ALTER TABLE users RENAME COLUMN beneficiary_id TO elderly_id;
```

2. Revert your code using git:
```bash
git checkout HEAD -- .
```

## Support

If you encounter any issues during migration:

1. Check the Supabase logs for SQL errors
2. Verify all foreign key constraints are working
3. Ensure no old references to `elderly` remain in your code

## Benefits of This Migration

✅ **Better terminology**: "Beneficiary" is more professional and inclusive
✅ **Proper relationships**: Many family members to one beneficiary
✅ **Notification system**: Built-in trigger for family notifications
✅ **Scalability**: Easy to add more family members per beneficiary
✅ **Flexibility**: Per-family-member notification preferences
