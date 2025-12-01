# Database Migrations for Caregiver Tracker

## Running the Caregivers Table Migration

To enable the color-coding feature for caregivers, you need to run the migration that creates the `caregivers` table and migrates existing data.

### Steps:

1. **Connect to your Supabase project**:
   - Go to https://supabase.com/dashboard
   - Select your project
   - Navigate to the SQL Editor

2. **Run the migration**:
   - Open the file: `migration_add_caregivers_table.sql`
   - Copy the entire contents
   - Paste into the SQL Editor
   - Click "Run" to execute

### What this migration does:

1. **Creates the `caregivers` table** with:
   - `id` (UUID primary key)
   - `name` (TEXT, normalized caregiver name)
   - `color` (TEXT, hex color code for UI display)
   - `created_at` and `updated_at` timestamps

2. **Adds `caregiver_id` column** to `check_in_outs` table:
   - References the `caregivers` table
   - Indexed for fast lookups

3. **Creates helper functions**:
   - `normalize_caregiver_name(input_name TEXT)`: Normalizes names to "First Name LAST NAME" format
   - `get_or_create_caregiver(input_name TEXT)`: Gets existing or creates new caregiver with auto-assigned color

4. **Migrates existing data**:
   - Automatically processes all existing `caregiver_name` entries
   - Creates normalized caregiver records
   - Links them to check-in/out records

5. **Color assignment**:
   - Automatically assigns unique colors from a predefined palette
   - 12 distinct colors available
   - Colors cycle if more than 12 caregivers

### Available Colors:

- Red (#EF4444)
- Amber (#F59E0B)
- Emerald (#10B981)
- Blue (#3B82F6)
- Violet (#8B5CF6)
- Pink (#EC4899)
- Teal (#14B8A6)
- Orange (#F97316)
- Cyan (#06B6D4)
- Purple (#A855F7)
- Lime (#84CC16)
- Indigo (#6366F1)

### After Migration:

Once the migration is complete, caregiver names will:
- Display with consistent colors across all views (Calendar, Financial Review, Training sections)
- Have colored backgrounds for better visual distinction
- Be automatically normalized to consistent format

### Updating Check-in Page:

To complete the integration, you should update the check-in page (`app/checkin/[qrCode]/page.tsx`) to use the `get_or_create_caregiver()` function when recording new check-ins, ensuring all new caregivers are automatically added to the system with assigned colors.

## Previous Migrations

- `migration_add_training_field.sql` - Adds `is_training` boolean field for tracking training sessions
- Other migration files for beneficiaries, users, and notes

## Troubleshooting

If the migration fails:
1. Check that all previous migrations have been run
2. Verify RLS (Row Level Security) policies allow the operations
3. Check the Supabase logs for specific error messages
4. You may need to run `migration_disable_rls.sql` if RLS is blocking the migration
