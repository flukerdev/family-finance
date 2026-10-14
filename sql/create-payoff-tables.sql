-- ============================================
-- Migration: create-payoff-tables
-- Created: 2026-10-13
-- Purpose: Card payoff workflow + monthly P&L.
--   allocation_rules        merchant pattern -> bucket, applied automatically
--   transaction_allocations per-transaction bucket override (what you tapped)
--   payoffs                 record of each completed card payoff (transfers made)
-- Paste into the Supabase SQL editor and run once.
-- ============================================

CREATE TABLE IF NOT EXISTS allocation_rules (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,              -- case-insensitive substring matched against merchant_name, then name
  bucket TEXT NOT NULL,               -- give | save | live | person1 | person2 | marriage_starter
  card_id TEXT,                       -- NULL = applies to every card
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
  statement_amount NUMERIC,           -- what was actually paid to the card
  allocations JSONB,                  -- { live: 812.40, person1: 95.10, ... }
  transfers JSONB,                    -- [{ from: 'live', to: 'person1', amount: 812.40 }, ...]
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, card_id, period_end)
);

ALTER TABLE allocation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payoffs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['allocation_rules','transaction_allocations','payoffs'] LOOP
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

CREATE INDEX IF NOT EXISTS idx_alloc_rules_user ON allocation_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_txn_alloc_user_txn ON transaction_allocations(user_id, plaid_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payoffs_user_card ON payoffs(user_id, card_id, period_end DESC);

-- ROLLBACK
-- DROP TABLE IF EXISTS payoffs; DROP TABLE IF EXISTS transaction_allocations; DROP TABLE IF EXISTS allocation_rules;
