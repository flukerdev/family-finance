# Troubleshooting Guide

## Issue: "Error saving. Please try again." on Update Tab

This error occurs when the Supabase insert fails. Here's how to fix it:

### Step 1: Run the RLS Policy Fix

Copy and run [fix-rls-policies.sql](fix-rls-policies.sql) in your Supabase SQL Editor.

This script will:
1. Drop old policies
2. Enable RLS on balance_snapshots
3. Create new policies allowing anonymous and authenticated access
4. Verify policies were created correctly

### Step 2: Verify the Table Exists

Run this in Supabase SQL Editor:
```sql
SELECT * FROM balance_snapshots ORDER BY created_at DESC LIMIT 5;
```

If you get an error "relation does not exist", recreate the table:
```sql
CREATE TABLE balance_snapshots (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  give NUMERIC NOT NULL,
  save NUMERIC NOT NULL,
  live NUMERIC NOT NULL,
  mat NUMERIC NOT NULL,
  mara NUMERIC NOT NULL,
  blue_total NUMERIC DEFAULT 0,
  blue_statement NUMERIC DEFAULT 0,
  gold_total NUMERIC DEFAULT 0,
  gold_statement NUMERIC DEFAULT 0,
  discover_total NUMERIC DEFAULT 0,
  discover_statement NUMERIC DEFAULT 0
);
```

Then run [fix-rls-policies.sql](fix-rls-policies.sql).

### Step 3: Check Your Environment Variables

Verify your `.env` file has the correct values:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### Step 4: Check Browser Console

After updating the error message, try saving again and check the browser console (F12) for the detailed error message.

Common errors:
- **"new row violates row-level security policy"** → Run fix-rls-policies.sql
- **"relation does not exist"** → Table needs to be created (see Step 2)
- **"permission denied"** → Check your Supabase anon key is correct
- **"Network error"** → Check your Supabase URL and internet connection

### Step 5: Test Direct Insert

Test if you can insert directly in Supabase SQL Editor:
```sql
INSERT INTO balance_snapshots (give, save, live, mat, mara)
VALUES (100, 200, 300, 400, 500);

SELECT * FROM balance_snapshots ORDER BY created_at DESC LIMIT 1;
```

If this works but the app still fails, the issue is with RLS policies.

### Step 6: Nuclear Option - Recreate Everything

If nothing works, recreate the table from scratch:

```sql
-- Drop everything
DROP TABLE IF EXISTS balance_snapshots CASCADE;

-- Recreate table
CREATE TABLE balance_snapshots (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  give NUMERIC NOT NULL,
  save NUMERIC NOT NULL,
  live NUMERIC NOT NULL,
  mat NUMERIC NOT NULL,
  mara NUMERIC NOT NULL,
  blue_total NUMERIC DEFAULT 0,
  blue_statement NUMERIC DEFAULT 0,
  gold_total NUMERIC DEFAULT 0,
  gold_statement NUMERIC DEFAULT 0,
  discover_total NUMERIC DEFAULT 0,
  discover_statement NUMERIC DEFAULT 0
);

-- Enable RLS
ALTER TABLE balance_snapshots ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all operations for anon"
ON balance_snapshots
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated"
ON balance_snapshots
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Test insert
INSERT INTO balance_snapshots (give, save, live, mat, mara, blue_total, blue_statement, gold_total, gold_statement, discover_total, discover_statement)
VALUES (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

-- Verify
SELECT * FROM balance_snapshots;
```

## Other Common Issues

### App Won't Load

1. Check dev server is running: `npm run dev`
2. Check browser console for errors
3. Verify `.env` file exists and has correct values
4. Try clearing browser cache

### No Data Showing on Dashboard

1. Check you have at least one snapshot saved
2. Run: `SELECT COUNT(*) FROM balance_snapshots;` in Supabase
3. If count is 0, use Update tab to save your first snapshot
4. Check browser console for fetch errors

### Navigation Buttons Don't Work

This should not happen in the simple version, but if it does:
1. Clear browser cache
2. Check browser console for JavaScript errors
3. Rebuild: `npm run build && npm run dev`

## Getting Help

If you're still stuck after trying all these steps:

1. Open browser console (F12)
2. Try to save a snapshot
3. Copy the exact error message from the console
4. Check the Network tab to see the Supabase API request/response

The error message should now show the actual issue from Supabase!
