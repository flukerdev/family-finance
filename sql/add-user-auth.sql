-- ============================================
-- Migration: add-user-auth
-- Created: 2026-02-17
-- Purpose: Add user_id columns to all tables and replace wide-open RLS
--          policies with per-user isolation. Required for multi-user auth.
-- ============================================

-- IMPORTANT: Run this AFTER enabling Supabase Auth in the dashboard.
-- The user_id column references auth.users(id), which is created by Supabase Auth.

-- ============================================
-- STEP 1: Add user_id columns
-- ============================================

-- plaid_items: stores Plaid access tokens per user
ALTER TABLE plaid_items
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- account_mappings: maps Plaid accounts to app buckets per user
ALTER TABLE account_mappings
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- balance_snapshots: stores balance history per user
ALTER TABLE balance_snapshots
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- app_config: stores budget configuration per user
ALTER TABLE app_config
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================
-- STEP 2: Drop old wide-open RLS policies
-- These allowed ANY user to read/write ALL rows.
-- ============================================

-- plaid_items policies
DROP POLICY IF EXISTS "Enable read access for all users" ON plaid_items;
DROP POLICY IF EXISTS "Enable insert access for all users" ON plaid_items;
DROP POLICY IF EXISTS "Enable update access for all users" ON plaid_items;
DROP POLICY IF EXISTS "Enable delete access for all users" ON plaid_items;

-- account_mappings policies
DROP POLICY IF EXISTS "Enable read access for all users" ON account_mappings;
DROP POLICY IF EXISTS "Enable insert access for all users" ON account_mappings;
DROP POLICY IF EXISTS "Enable update access for all users" ON account_mappings;
DROP POLICY IF EXISTS "Enable delete access for all users" ON account_mappings;

-- app_config policies
DROP POLICY IF EXISTS "Enable read access for all users" ON app_config;
DROP POLICY IF EXISTS "Enable insert access for all users" ON app_config;
DROP POLICY IF EXISTS "Enable update access for all users" ON app_config;

-- ============================================
-- STEP 3: Create per-user RLS policies
-- Each user can only see/modify their own rows.
-- auth.uid() returns the currently authenticated user's ID.
-- ============================================

-- plaid_items: users can only access their own Plaid connections
CREATE POLICY "Users can view their own plaid items"
  ON plaid_items FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own plaid items"
  ON plaid_items FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own plaid items"
  ON plaid_items FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own plaid items"
  ON plaid_items FOR DELETE
  USING (user_id = auth.uid());

-- account_mappings: users can only access their own mappings
CREATE POLICY "Users can view their own account mappings"
  ON account_mappings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own account mappings"
  ON account_mappings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own account mappings"
  ON account_mappings FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own account mappings"
  ON account_mappings FOR DELETE
  USING (user_id = auth.uid());

-- balance_snapshots: users can only access their own snapshots
-- RLS needs to be enabled first (may not have been done for this table)
ALTER TABLE balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own balance snapshots"
  ON balance_snapshots FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own balance snapshots"
  ON balance_snapshots FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own balance snapshots"
  ON balance_snapshots FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own balance snapshots"
  ON balance_snapshots FOR DELETE
  USING (user_id = auth.uid());

-- app_config: users can only access their own config
CREATE POLICY "Users can view their own app config"
  ON app_config FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own app config"
  ON app_config FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own app config"
  ON app_config FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own app config"
  ON app_config FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- STEP 4: Add indexes on user_id for query performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_plaid_items_user_id ON plaid_items(user_id);
CREATE INDEX IF NOT EXISTS idx_account_mappings_user_id ON account_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_user_id ON balance_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_app_config_user_id ON app_config(user_id);

-- ============================================
-- STEP 5: Backfill existing data (RUN MANUALLY)
-- After creating your first user account, update existing rows
-- to belong to that user. Replace YOUR_USER_ID with your actual
-- auth.users id from the Supabase Auth dashboard.
-- ============================================

-- UPDATE plaid_items SET user_id = 'YOUR_USER_ID' WHERE user_id IS NULL;
-- UPDATE account_mappings SET user_id = 'YOUR_USER_ID' WHERE user_id IS NULL;
-- UPDATE balance_snapshots SET user_id = 'YOUR_USER_ID' WHERE user_id IS NULL;
-- UPDATE app_config SET user_id = 'YOUR_USER_ID' WHERE user_id IS NULL;

-- After backfilling, make user_id NOT NULL to prevent future orphaned rows:
-- ALTER TABLE plaid_items ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE account_mappings ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE balance_snapshots ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE app_config ALTER COLUMN user_id SET NOT NULL;

-- ============================================
-- ROLLBACK (run this to undo the migration)
-- ============================================
-- DROP POLICY IF EXISTS "Users can view their own plaid items" ON plaid_items;
-- DROP POLICY IF EXISTS "Users can insert their own plaid items" ON plaid_items;
-- DROP POLICY IF EXISTS "Users can update their own plaid items" ON plaid_items;
-- DROP POLICY IF EXISTS "Users can delete their own plaid items" ON plaid_items;
-- DROP POLICY IF EXISTS "Users can view their own account mappings" ON account_mappings;
-- DROP POLICY IF EXISTS "Users can insert their own account mappings" ON account_mappings;
-- DROP POLICY IF EXISTS "Users can update their own account mappings" ON account_mappings;
-- DROP POLICY IF EXISTS "Users can delete their own account mappings" ON account_mappings;
-- DROP POLICY IF EXISTS "Users can view their own balance snapshots" ON balance_snapshots;
-- DROP POLICY IF EXISTS "Users can insert their own balance snapshots" ON balance_snapshots;
-- DROP POLICY IF EXISTS "Users can update their own balance snapshots" ON balance_snapshots;
-- DROP POLICY IF EXISTS "Users can delete their own balance snapshots" ON balance_snapshots;
-- DROP POLICY IF EXISTS "Users can view their own app config" ON app_config;
-- DROP POLICY IF EXISTS "Users can insert their own app config" ON app_config;
-- DROP POLICY IF EXISTS "Users can update their own app config" ON app_config;
-- DROP POLICY IF EXISTS "Users can delete their own app config" ON app_config;
-- DROP INDEX IF EXISTS idx_plaid_items_user_id;
-- DROP INDEX IF EXISTS idx_account_mappings_user_id;
-- DROP INDEX IF EXISTS idx_balance_snapshots_user_id;
-- DROP INDEX IF EXISTS idx_app_config_user_id;
-- ALTER TABLE plaid_items DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE account_mappings DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE balance_snapshots DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE app_config DROP COLUMN IF EXISTS user_id;
