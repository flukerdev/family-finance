-- Fix RLS Policies for balance_snapshots
-- Run this in Supabase SQL Editor to fix insert permissions

-- First, check if the table exists
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'balance_snapshots';

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for all users" ON balance_snapshots;
DROP POLICY IF EXISTS "Enable insert access for all users" ON balance_snapshots;

-- Ensure RLS is enabled
ALTER TABLE balance_snapshots ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for anonymous access
CREATE POLICY "Allow anonymous read access"
ON balance_snapshots
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Allow anonymous insert access"
ON balance_snapshots
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Allow authenticated read access"
ON balance_snapshots
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated insert access"
ON balance_snapshots
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Verify policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'balance_snapshots';
