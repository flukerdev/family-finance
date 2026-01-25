-- Cleanup Auth Tables
-- Run this in Supabase SQL Editor to remove all authentication-related tables and functions
-- This will keep only the balance_snapshots table needed for the simple app

-- WARNING: This will delete all data in these tables!
-- Make sure you have backups if needed before running this script.

-- Drop tables in order (respecting foreign key constraints)
DROP TABLE IF EXISTS credit_cards CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS income_sources CASCADE;
DROP TABLE IF EXISTS household_members CASCADE;
DROP TABLE IF EXISTS households CASCADE;

-- Drop the reset function if it exists
DROP FUNCTION IF EXISTS reset_test_user(TEXT);

-- Verify remaining tables (should only show balance_snapshots and auth-related system tables)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- IMPORTANT: Keep the balance_snapshots table!
-- This table is required for the Update tab to work.
--
-- If you accidentally deleted it, recreate it with:
--
-- CREATE TABLE balance_snapshots (
--   id SERIAL PRIMARY KEY,
--   created_at TIMESTAMPTZ DEFAULT NOW(),
--   give NUMERIC NOT NULL,
--   save NUMERIC NOT NULL,
--   live NUMERIC NOT NULL,
--   mat NUMERIC NOT NULL,
--   mara NUMERIC NOT NULL,
--   blue_total NUMERIC DEFAULT 0,
--   blue_statement NUMERIC DEFAULT 0,
--   gold_total NUMERIC DEFAULT 0,
--   gold_statement NUMERIC DEFAULT 0,
--   discover_total NUMERIC DEFAULT 0,
--   discover_statement NUMERIC DEFAULT 0
-- );
--
-- ALTER TABLE balance_snapshots ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Enable read access for all users" ON balance_snapshots
--   FOR SELECT USING (true);
--
-- CREATE POLICY "Enable insert access for all users" ON balance_snapshots
--   FOR INSERT WITH CHECK (true);
