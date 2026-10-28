-- ============================================
-- Migration: create-flow-lines
-- Created: 2026-10-27
-- Purpose: One table that drives the Flow page (Give/Save/Live sankey) and the
--   "due soon" reminders. Every line is money that moves on a cadence:
--   paycheck income, bucket outflows (tithe, Roth, Piedmont plan, mortgage...),
--   and lumpy bills like Mara's six-month auto insurance.
-- Paste into the Supabase SQL editor and run once.
-- ============================================

CREATE TABLE IF NOT EXISTS flow_lines (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,          -- income_person1 | income_person2 | give | save | live | person1 | person2
  category TEXT,                 -- grouping label inside the bucket (Housing, Food, Cars, Retirement...)
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL,       -- amount per occurrence, at the cadence below
  cadence TEXT NOT NULL DEFAULT 'monthly',   -- biweekly | monthly | six_months | annual | once
  next_due DATE,                 -- next occurrence; advanced by the app when marked paid
  start_date DATE,               -- line is inactive before this
  end_date DATE,                 -- line is inactive after this (Roth draws end Apr 2027)
  paid_how TEXT,                 -- free text: 'autopay Amex', 'Zelle to parents', 'Schwab pulls from Save'
  color TEXT,                    -- optional override: give | save | live | person | accent | danger | success
  sort INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  note TEXT
);

ALTER TABLE flow_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own rows select" ON flow_lines;
DROP POLICY IF EXISTS "own rows insert" ON flow_lines;
DROP POLICY IF EXISTS "own rows update" ON flow_lines;
DROP POLICY IF EXISTS "own rows delete" ON flow_lines;
CREATE POLICY "own rows select" ON flow_lines FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own rows insert" ON flow_lines FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own rows update" ON flow_lines FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own rows delete" ON flow_lines FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_flow_lines_user ON flow_lines(user_id, bucket, sort);

-- ROLLBACK
-- DROP TABLE IF EXISTS flow_lines;
