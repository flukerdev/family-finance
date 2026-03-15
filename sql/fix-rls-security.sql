-- ============================================================
-- FIX: Row Level Security audit and enforcement
-- RUN THIS IN SUPABASE SQL EDITOR
-- ============================================================

-- ─── STEP 1: DIAGNOSE ─────────────────────────────────────────
-- Run these SELECT queries first to understand the current state.
-- Do NOT run the fix steps until you've reviewed the output.

-- Check for rows with NULL user_id (orphaned data):
SELECT 'plaid_items' as tbl, COUNT(*) as null_rows FROM plaid_items WHERE user_id IS NULL
UNION ALL
SELECT 'account_mappings', COUNT(*) FROM account_mappings WHERE user_id IS NULL
UNION ALL
SELECT 'balance_snapshots', COUNT(*) FROM balance_snapshots WHERE user_id IS NULL
UNION ALL
SELECT 'app_config', COUNT(*) FROM app_config WHERE user_id IS NULL;

-- Check which RLS policies exist on each table:
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('plaid_items', 'account_mappings', 'balance_snapshots', 'app_config', 'transactions', 'sync_cursors', 'user_consents')
ORDER BY tablename, policyname;

-- Check if user_id is NOT NULL constrained:
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_name IN ('plaid_items', 'account_mappings', 'balance_snapshots', 'app_config')
  AND column_name = 'user_id'
ORDER BY table_name;

-- List all users to find your primary user ID:
SELECT id, email, created_at FROM auth.users ORDER BY created_at;


-- ─── STEP 2: BACKFILL (replace YOUR_PRIMARY_USER_ID) ──────────
-- After running Step 1, replace YOUR_PRIMARY_USER_ID below with
-- your matfluker34@gmail.com user UUID from the auth.users query.

-- UPDATE plaid_items SET user_id = 'YOUR_PRIMARY_USER_ID' WHERE user_id IS NULL;
-- UPDATE account_mappings SET user_id = 'YOUR_PRIMARY_USER_ID' WHERE user_id IS NULL;
-- UPDATE balance_snapshots SET user_id = 'YOUR_PRIMARY_USER_ID' WHERE user_id IS NULL;
-- UPDATE app_config SET user_id = 'YOUR_PRIMARY_USER_ID' WHERE user_id IS NULL;


-- ─── STEP 3: DROP BAD POLICIES + RECREATE CORRECT ONES ───────
-- This ensures all tables have per-user RLS, even if add-user-auth.sql
-- was partially applied.

-- plaid_items
DROP POLICY IF EXISTS "Enable read access for all users" ON plaid_items;
DROP POLICY IF EXISTS "Enable insert for all users" ON plaid_items;
DROP POLICY IF EXISTS "Enable update for all users" ON plaid_items;
DROP POLICY IF EXISTS "Enable delete for all users" ON plaid_items;
DROP POLICY IF EXISTS "Users can view their own plaid items" ON plaid_items;
DROP POLICY IF EXISTS "Users can insert their own plaid items" ON plaid_items;
DROP POLICY IF EXISTS "Users can update their own plaid items" ON plaid_items;
DROP POLICY IF EXISTS "Users can delete their own plaid items" ON plaid_items;

ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own plaid items" ON plaid_items FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own plaid items" ON plaid_items FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own plaid items" ON plaid_items FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete their own plaid items" ON plaid_items FOR DELETE USING (user_id = auth.uid());

-- account_mappings
DROP POLICY IF EXISTS "Enable read access for all users" ON account_mappings;
DROP POLICY IF EXISTS "Enable insert for all users" ON account_mappings;
DROP POLICY IF EXISTS "Enable update for all users" ON account_mappings;
DROP POLICY IF EXISTS "Enable delete for all users" ON account_mappings;
DROP POLICY IF EXISTS "Users can view their own mappings" ON account_mappings;
DROP POLICY IF EXISTS "Users can insert their own mappings" ON account_mappings;
DROP POLICY IF EXISTS "Users can update their own mappings" ON account_mappings;
DROP POLICY IF EXISTS "Users can delete their own mappings" ON account_mappings;

ALTER TABLE account_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own mappings" ON account_mappings FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own mappings" ON account_mappings FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own mappings" ON account_mappings FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete their own mappings" ON account_mappings FOR DELETE USING (user_id = auth.uid());

-- balance_snapshots
DROP POLICY IF EXISTS "Enable read access for all users" ON balance_snapshots;
DROP POLICY IF EXISTS "Enable insert for all users" ON balance_snapshots;
DROP POLICY IF EXISTS "Enable update for all users" ON balance_snapshots;
DROP POLICY IF EXISTS "Users can view their own balance snapshots" ON balance_snapshots;
DROP POLICY IF EXISTS "Users can insert their own balance snapshots" ON balance_snapshots;
DROP POLICY IF EXISTS "Users can update their own balance snapshots" ON balance_snapshots;

ALTER TABLE balance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own balance snapshots" ON balance_snapshots FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own balance snapshots" ON balance_snapshots FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own balance snapshots" ON balance_snapshots FOR UPDATE USING (user_id = auth.uid());

-- app_config
DROP POLICY IF EXISTS "Enable read access for all users" ON app_config;
DROP POLICY IF EXISTS "Enable insert for all users" ON app_config;
DROP POLICY IF EXISTS "Enable update for all users" ON app_config;
DROP POLICY IF EXISTS "Users can view their own config" ON app_config;
DROP POLICY IF EXISTS "Users can insert their own config" ON app_config;
DROP POLICY IF EXISTS "Users can update their own config" ON app_config;

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own config" ON app_config FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert their own config" ON app_config FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own config" ON app_config FOR UPDATE USING (user_id = auth.uid());


-- ─── STEP 4: ENFORCE NOT NULL (run AFTER backfill) ───────────
-- Only run these AFTER Step 2 backfill is complete and verified.
-- If any rows still have NULL user_id, these will fail.

-- ALTER TABLE plaid_items ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE account_mappings ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE balance_snapshots ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE app_config ALTER COLUMN user_id SET NOT NULL;


-- ─── STEP 5: VERIFY ──────────────────────────────────────────
-- After all steps, re-run Step 1 queries to confirm:
-- 1. Zero NULL user_id rows
-- 2. All policies use auth.uid() (no USING (true))
-- 3. user_id is NOT NULL on all tables
