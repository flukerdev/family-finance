-- ============================================
-- Migration: create-transactions-table
-- Created: 2026-03-09
-- Purpose: Create tables for storing Plaid transactions and sync cursors.
--          Enables incremental transaction sync (Phase 1 of MVP roadmap).
-- ============================================

-- ============================================
-- TABLE 1: transactions
-- Stores individual transactions from Plaid.
-- Each row represents one bank/card transaction.
-- ============================================

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- User ownership (same pattern as all other tables)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Plaid identifiers
  plaid_transaction_id TEXT NOT NULL,         -- Plaid's unique ID for this transaction
  plaid_account_id TEXT NOT NULL,             -- Which Plaid account this came from

  -- App mapping (denormalized from account_mappings for query performance)
  -- Values: give, save, live, mat, mara, blue_total, gold_total, discover_total
  app_account_type TEXT NOT NULL,

  -- Transaction details
  amount NUMERIC NOT NULL,                    -- Positive = money spent, negative = refund/income (Plaid convention)
  date DATE NOT NULL,                         -- Transaction date (YYYY-MM-DD)
  name TEXT,                                  -- Transaction name (e.g. "WALMART")
  merchant_name TEXT,                         -- Cleaned merchant name (e.g. "Walmart")

  -- Plaid categorization
  -- category: legacy broad category array as JSON string (e.g. '["Food and Drink", "Groceries"]')
  -- personal_finance_category: Plaid's newer detailed category object as JSON string
  --   (e.g. '{"primary": "FOOD_AND_DRINK", "detailed": "FOOD_AND_DRINK_GROCERIES"}')
  category TEXT,
  personal_finance_category TEXT,

  -- Status
  pending BOOLEAN DEFAULT false,              -- true = bank hasn't finalized this yet

  -- Ensure no duplicate transactions per user
  UNIQUE (user_id, plaid_transaction_id)
);

-- ============================================
-- TABLE 2: sync_cursors
-- Tracks the Plaid sync cursor for each connected bank/card.
-- Used for incremental transaction fetching — send the cursor to Plaid
-- and it returns only new/modified/removed transactions since last sync.
-- ============================================

CREATE TABLE IF NOT EXISTS sync_cursors (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- User ownership
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Which Plaid item (bank connection) this cursor is for
  -- References plaid_items.item_id
  item_id TEXT NOT NULL,

  -- The cursor string from Plaid's /transactions/sync response
  -- Send this on the next sync call to get only changes since this point
  cursor TEXT NOT NULL,

  -- One cursor per item per user
  UNIQUE (user_id, item_id)
);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_cursors ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES: transactions
-- Each user can only access their own transactions.
-- Same pattern as add-user-auth.sql.
-- ============================================

CREATE POLICY "Users can view their own transactions"
  ON transactions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own transactions"
  ON transactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own transactions"
  ON transactions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own transactions"
  ON transactions FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- RLS POLICIES: sync_cursors
-- Each user can only access their own cursors.
-- ============================================

CREATE POLICY "Users can view their own sync cursors"
  ON sync_cursors FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own sync cursors"
  ON sync_cursors FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own sync cursors"
  ON sync_cursors FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own sync cursors"
  ON sync_cursors FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- INDEXES
-- Speed up the queries we'll run most often.
-- ============================================

-- Filter transactions by user (every query needs this)
CREATE INDEX IF NOT EXISTS idx_transactions_user_id
  ON transactions(user_id);

-- List transactions for a specific account, sorted by date (transaction list view)
CREATE INDEX IF NOT EXISTS idx_transactions_account_date
  ON transactions(plaid_account_id, date DESC);

-- Look up a specific transaction by Plaid ID (upserts during sync)
CREATE INDEX IF NOT EXISTS idx_transactions_plaid_id
  ON transactions(plaid_transaction_id);

-- Filter by app account type + date (e.g. "show me all LIVE transactions this month")
CREATE INDEX IF NOT EXISTS idx_transactions_app_type_date
  ON transactions(app_account_type, date DESC);

-- Filter transactions by user + date (dashboard queries: "this month's transactions")
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON transactions(user_id, date DESC);

-- Look up cursor by user (sync operations)
CREATE INDEX IF NOT EXISTS idx_sync_cursors_user_id
  ON sync_cursors(user_id);

-- ============================================
-- ROLLBACK (run this to undo the migration)
-- ============================================
-- DROP POLICY IF EXISTS "Users can view their own transactions" ON transactions;
-- DROP POLICY IF EXISTS "Users can insert their own transactions" ON transactions;
-- DROP POLICY IF EXISTS "Users can update their own transactions" ON transactions;
-- DROP POLICY IF EXISTS "Users can delete their own transactions" ON transactions;
-- DROP POLICY IF EXISTS "Users can view their own sync cursors" ON sync_cursors;
-- DROP POLICY IF EXISTS "Users can insert their own sync cursors" ON sync_cursors;
-- DROP POLICY IF EXISTS "Users can update their own sync cursors" ON sync_cursors;
-- DROP POLICY IF EXISTS "Users can delete their own sync cursors" ON sync_cursors;
-- DROP INDEX IF EXISTS idx_transactions_user_id;
-- DROP INDEX IF EXISTS idx_transactions_account_date;
-- DROP INDEX IF EXISTS idx_transactions_plaid_id;
-- DROP INDEX IF EXISTS idx_transactions_app_type_date;
-- DROP INDEX IF EXISTS idx_transactions_user_date;
-- DROP INDEX IF EXISTS idx_sync_cursors_user_id;
-- DROP TABLE IF EXISTS transactions;
-- DROP TABLE IF EXISTS sync_cursors;
