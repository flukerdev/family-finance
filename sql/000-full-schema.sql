-- ============================================================================
-- FLIP: FULL SCHEMA FOR A FRESH SUPABASE PROJECT
-- Created 2026-10-13. Consolidates every migration in sql/ (plaid, config,
-- user auth + RLS, consents, transactions, flexible accounts, payoff/P&L).
-- Paste the whole file into the Supabase SQL editor and run once.
-- Safe to re-run: everything is IF NOT EXISTS / DROP POLICY IF EXISTS.
-- Every table is scoped to auth.users via user_id and locked down with RLS.
-- ============================================================================

-- ─── plaid_items: one row per connected institution (holds the access token) ─
CREATE TABLE IF NOT EXISTS plaid_items (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  institution_name TEXT,
  last_synced TIMESTAMPTZ
);

-- ─── account_mappings: Plaid account -> app bucket / card ────────────────────
CREATE TABLE IF NOT EXISTS account_mappings (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaid_account_id TEXT NOT NULL UNIQUE,
  plaid_account_name TEXT NOT NULL,
  app_account_type TEXT NOT NULL,                -- legacy: give|save|live|mat|mara|blue_total|gold_total|discover_total
  is_credit_card BOOLEAN DEFAULT false,
  is_statement_balance BOOLEAN DEFAULT false,
  mapping_mode TEXT DEFAULT 'direct' CHECK (mapping_mode IN ('direct', 'primary', 'credit_card')),
  bucket TEXT CHECK (bucket IS NULL OR bucket IN ('give', 'save', 'live', 'person1', 'person2')),
  paid_from_bucket TEXT CHECK (paid_from_bucket IS NULL OR paid_from_bucket IN ('live', 'person1', 'person2')),
  card_id TEXT,
  card_label TEXT
);

-- ─── credit_cards: user-defined cards, due/close days, who pays ──────────────
CREATE TABLE IF NOT EXISTS credit_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  label TEXT NOT NULL,
  due_day INT NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  statement_close_day INT CHECK (statement_close_day >= 1 AND statement_close_day <= 31),
  paid_from_bucket TEXT NOT NULL CHECK (paid_from_bucket IN ('live', 'person1', 'person2')),
  plaid_account_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, card_id)
);

-- ─── balance_snapshots: point-in-time balances (legacy flat + JSONB) ─────────
CREATE TABLE IF NOT EXISTS balance_snapshots (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  give NUMERIC, save NUMERIC, live NUMERIC, mat NUMERIC, mara NUMERIC,
  blue_total NUMERIC, blue_statement NUMERIC,
  gold_total NUMERIC, gold_statement NUMERIC,
  discover_total NUMERIC, discover_statement NUMERIC,
  buckets JSONB DEFAULT '{}'::jsonb,              -- { give, save, live, person1, person2 }
  cards JSONB DEFAULT '{}'::jsonb                 -- { blue: { total, statement }, ... }
);

-- ─── app_config: one row per user, everything configurable in Settings ───────
CREATE TABLE IF NOT EXISTS app_config (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mat_pay_amount NUMERIC DEFAULT 0,
  mara_pay_amount NUMERIC DEFAULT 0,
  split_give NUMERIC DEFAULT 0.20,
  split_save NUMERIC DEFAULT 0.20,
  split_mat_live NUMERIC DEFAULT 0,
  split_mara_live NUMERIC DEFAULT 0,
  cushion NUMERIC DEFAULT 150,
  due_date_blue INTEGER DEFAULT 8,
  due_date_gold INTEGER DEFAULT 15,
  due_date_discover INTEGER DEFAULT 2,
  due_date_rent TEXT DEFAULT 'last',
  statement_close_blue INTEGER,
  statement_close_gold INTEGER,
  statement_close_discover INTEGER,
  monthly_rent NUMERIC DEFAULT 0,
  monthly_insurance NUMERIC DEFAULT 0,
  monthly_gym NUMERIC DEFAULT 0,
  monthly_date_nights NUMERIC DEFAULT 0,
  monthly_power NUMERIC DEFAULT 0,
  monthly_groceries NUMERIC DEFAULT 0,
  monthly_gas NUMERIC DEFAULT 0,
  monthly_subscriptions NUMERIC DEFAULT 0,
  onboarding_complete BOOLEAN DEFAULT false,
  person_1_name TEXT DEFAULT 'Person 1',
  person_2_name TEXT DEFAULT 'Person 2',
  is_joint_budget BOOLEAN DEFAULT false,
  payday_1_anchor DATE,
  payday_1_frequency TEXT DEFAULT 'biweekly',
  payday_2_anchor DATE,
  payday_2_frequency TEXT DEFAULT 'biweekly',
  UNIQUE (user_id)                                -- app upserts on user_id
);

-- ─── user_consents: Plaid compliance ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_consents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,                     -- privacy_policy | plaid_data_access | terms_of_service
  policy_version TEXT NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ DEFAULT NULL
);

-- ─── transactions + sync_cursors ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaid_transaction_id TEXT NOT NULL,
  plaid_account_id TEXT NOT NULL,
  app_account_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,                        -- Plaid: positive = money out, negative = money in
  date DATE NOT NULL,
  name TEXT,
  merchant_name TEXT,
  category TEXT,
  personal_finance_category TEXT,
  pending BOOLEAN DEFAULT false,
  UNIQUE (user_id, plaid_transaction_id)
);

CREATE TABLE IF NOT EXISTS sync_cursors (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  cursor TEXT NOT NULL,
  UNIQUE (user_id, item_id)
);

-- ─── payoff + P&L ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS allocation_rules (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,                          -- case-insensitive substring of merchant_name / name
  bucket TEXT NOT NULL,                           -- give|save|live|person1|person2|marriage_starter
  card_id TEXT,                                   -- NULL = every card
  UNIQUE (user_id, pattern, card_id)
);

CREATE TABLE IF NOT EXISTS transaction_allocations (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plaid_transaction_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  note TEXT,
  UNIQUE (user_id, plaid_transaction_id)
);

CREATE TABLE IF NOT EXISTS payoffs (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE,
  statement_amount NUMERIC,
  allocations JSONB,
  transfers JSONB,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, card_id, period_end)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_plaid_items_user_id ON plaid_items(user_id);
CREATE INDEX IF NOT EXISTS idx_account_mappings_user_id ON account_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_user_id ON balance_snapshots(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_config_user_id ON app_config(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_user_type ON user_consents(user_id, consent_type);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(plaid_account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_app_type_date ON transactions(app_account_type, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_plaid_id ON transactions(plaid_transaction_id);
CREATE INDEX IF NOT EXISTS idx_sync_cursors_user_id ON sync_cursors(user_id);
CREATE INDEX IF NOT EXISTS idx_alloc_rules_user ON allocation_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_txn_alloc_user_txn ON transaction_allocations(user_id, plaid_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payoffs_user_card ON payoffs(user_id, card_id, period_end DESC);

-- ─── RLS: every table, own rows only ─────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'plaid_items','account_mappings','credit_cards','balance_snapshots','app_config',
    'user_consents','transactions','sync_cursors','allocation_rules','transaction_allocations','payoffs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "own rows select" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "own rows insert" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "own rows update" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "own rows delete" ON %I', t);
    EXECUTE format('CREATE POLICY "own rows select" ON %I FOR SELECT USING (user_id = auth.uid())', t);
    EXECUTE format('CREATE POLICY "own rows insert" ON %I FOR INSERT WITH CHECK (user_id = auth.uid())', t);
    EXECUTE format('CREATE POLICY "own rows update" ON %I FOR UPDATE USING (user_id = auth.uid())', t);
    EXECUTE format('CREATE POLICY "own rows delete" ON %I FOR DELETE USING (user_id = auth.uid())', t);
  END LOOP;
END $$;
