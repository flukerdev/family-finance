-- ============================================================================
-- FLEXIBLE ACCOUNTS MIGRATION
-- ============================================================================
-- Restructures the database from hardcoded 5-checking + 3-credit-card columns
-- to a flexible system using JSONB for buckets/cards and a credit_cards table.
--
-- This migration:
-- 1. Creates the `credit_cards` table (0-N cards per user)
-- 2. Adds new columns to `account_mappings` (mapping_mode, bucket, etc.)
-- 3. Adds JSONB columns to `balance_snapshots` (buckets, cards)
-- 4. Migrates existing data into the new columns
-- 5. Keeps old columns for dual-read/write during transition
--
-- Run this in the Supabase SQL Editor.
-- ============================================================================

-- ─── 1. Create credit_cards table ──────────────────────────────────────────
-- Stores user-defined credit cards with due dates and which bucket pays them.

CREATE TABLE IF NOT EXISTS credit_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,                    -- stable identifier (e.g., 'blue', 'gold', or auto-generated)
  label TEXT NOT NULL,                      -- user-visible name (e.g., "Chase Sapphire")
  due_day INT NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  statement_close_day INT CHECK (statement_close_day >= 1 AND statement_close_day <= 31),
  paid_from_bucket TEXT NOT NULL CHECK (paid_from_bucket IN ('live', 'person1', 'person2')),
  plaid_account_id TEXT,                    -- links to Plaid if connected (nullable for manual cards)
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, card_id)
);

-- RLS: users can only access their own cards
ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credit cards"
  ON credit_cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own credit cards"
  ON credit_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own credit cards"
  ON credit_cards FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own credit cards"
  ON credit_cards FOR DELETE
  USING (auth.uid() = user_id);


-- ─── 2. Add columns to account_mappings ────────────────────────────────────
-- mapping_mode: 'direct' (1 account = 1 bucket), 'primary' (splits into all),
--               'credit_card' (mapped as a credit card)

ALTER TABLE account_mappings
  ADD COLUMN IF NOT EXISTS mapping_mode TEXT DEFAULT 'direct'
    CHECK (mapping_mode IN ('direct', 'primary', 'credit_card')),
  ADD COLUMN IF NOT EXISTS bucket TEXT
    CHECK (bucket IS NULL OR bucket IN ('give', 'save', 'live', 'person1', 'person2')),
  ADD COLUMN IF NOT EXISTS paid_from_bucket TEXT
    CHECK (paid_from_bucket IS NULL OR paid_from_bucket IN ('live', 'person1', 'person2')),
  ADD COLUMN IF NOT EXISTS card_id TEXT,
  ADD COLUMN IF NOT EXISTS card_label TEXT;


-- ─── 3. Add JSONB columns to balance_snapshots ─────────────────────────────
-- buckets: { "give": 500, "save": 1200, "live": 3000, "person1": 450, "person2": 380 }
-- cards:   { "blue": { "total": 1500, "statement": 800 }, "gold": { ... } }

ALTER TABLE balance_snapshots
  ADD COLUMN IF NOT EXISTS buckets JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cards JSONB DEFAULT '{}'::jsonb;


-- ─── 4. Migrate existing data ──────────────────────────────────────────────

-- 4a. Populate buckets JSONB from old columns (mat→person1, mara→person2)
UPDATE balance_snapshots
SET buckets = jsonb_build_object(
  'give', COALESCE(give, 0),
  'save', COALESCE(save, 0),
  'live', COALESCE(live, 0),
  'person1', COALESCE(mat, 0),
  'person2', COALESCE(mara, 0)
)
WHERE buckets = '{}'::jsonb OR buckets IS NULL;

-- 4b. Populate cards JSONB from old columns
UPDATE balance_snapshots
SET cards = jsonb_build_object(
  'blue', jsonb_build_object('total', COALESCE(blue_total, 0), 'statement', COALESCE(blue_statement, 0)),
  'gold', jsonb_build_object('total', COALESCE(gold_total, 0), 'statement', COALESCE(gold_statement, 0)),
  'discover', jsonb_build_object('total', COALESCE(discover_total, 0), 'statement', COALESCE(discover_statement, 0))
)
WHERE cards = '{}'::jsonb OR cards IS NULL;

-- 4c. Populate account_mappings new columns from old app_account_type
-- Direct-mapped checking accounts
UPDATE account_mappings
SET mapping_mode = 'direct',
    bucket = CASE app_account_type
      WHEN 'give' THEN 'give'
      WHEN 'save' THEN 'save'
      WHEN 'live' THEN 'live'
      WHEN 'mat' THEN 'person1'
      WHEN 'mara' THEN 'person2'
      ELSE NULL
    END
WHERE app_account_type IN ('give', 'save', 'live', 'mat', 'mara')
  AND (mapping_mode IS NULL OR mapping_mode = 'direct');

-- Credit card mappings
UPDATE account_mappings
SET mapping_mode = 'credit_card',
    card_id = CASE app_account_type
      WHEN 'blue_total' THEN 'blue'
      WHEN 'gold_total' THEN 'gold'
      WHEN 'discover_total' THEN 'discover'
      ELSE NULL
    END,
    card_label = CASE app_account_type
      WHEN 'blue_total' THEN 'Blue Amex'
      WHEN 'gold_total' THEN 'Gold Amex'
      WHEN 'discover_total' THEN 'Discover'
      ELSE NULL
    END,
    paid_from_bucket = CASE app_account_type
      WHEN 'blue_total' THEN 'live'
      WHEN 'gold_total' THEN 'person1'
      WHEN 'discover_total' THEN 'person2'
      ELSE NULL
    END
WHERE app_account_type IN ('blue_total', 'gold_total', 'discover_total')
  AND (mapping_mode IS NULL OR mapping_mode = 'direct');

-- 4d. Create credit_cards rows from existing card mappings
-- Only inserts if credit_cards table is empty for this user (idempotent)
INSERT INTO credit_cards (user_id, card_id, label, due_day, statement_close_day, paid_from_bucket, plaid_account_id)
SELECT DISTINCT
  am.user_id,
  am.card_id,
  am.card_label,
  CASE am.card_id
    WHEN 'blue' THEN COALESCE((SELECT ac.due_date_blue FROM app_config ac WHERE ac.user_id = am.user_id LIMIT 1), 8)
    WHEN 'gold' THEN COALESCE((SELECT ac.due_date_gold FROM app_config ac WHERE ac.user_id = am.user_id LIMIT 1), 15)
    WHEN 'discover' THEN COALESCE((SELECT ac.due_date_discover FROM app_config ac WHERE ac.user_id = am.user_id LIMIT 1), 2)
    ELSE 1
  END,
  CASE am.card_id
    WHEN 'blue' THEN 14
    WHEN 'gold' THEN 21
    WHEN 'discover' THEN 25
    ELSE NULL
  END,
  am.paid_from_bucket,
  am.plaid_account_id
FROM account_mappings am
WHERE am.mapping_mode = 'credit_card'
  AND am.card_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM credit_cards cc
    WHERE cc.user_id = am.user_id AND cc.card_id = am.card_id
  );

-- 4e. Update transactions: rename mat→person1, mara→person2
UPDATE transactions
SET app_account_type = 'person1'
WHERE app_account_type = 'mat';

UPDATE transactions
SET app_account_type = 'person2'
WHERE app_account_type = 'mara';


-- ─── 5. Add credit_cards to test-reset and account deletion ────────────────
-- NOTE: The server code must be updated to include 'credit_cards' in the tables
-- array for both DELETE /api/account and POST /api/test-reset endpoints.
-- Old columns are preserved until Sub-Phase E cleanup.

-- ============================================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================================
-- SELECT buckets, cards FROM balance_snapshots LIMIT 5;
-- SELECT mapping_mode, bucket, card_id, paid_from_bucket FROM account_mappings;
-- SELECT * FROM credit_cards;
-- SELECT DISTINCT app_account_type FROM transactions WHERE app_account_type IN ('mat', 'mara');
--   ^ Should return 0 rows (all renamed to person1/person2)
