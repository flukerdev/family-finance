-- ============================================
-- Migration: create-user-consents-table
-- Created: 2026-02-17
-- Purpose: Track user consent for privacy policy, Plaid data access,
--          and terms of service. Required for Plaid compliance (Q10).
-- ============================================

CREATE TABLE IF NOT EXISTS user_consents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,       -- 'privacy_policy', 'plaid_data_access', 'terms_of_service'
  policy_version TEXT NOT NULL,     -- '1.0', '1.1', etc.
  granted_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ DEFAULT NULL
);

-- Enable RLS
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

-- Users can only view their own consents
CREATE POLICY "Users can view their own consents"
  ON user_consents FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own consents
CREATE POLICY "Users can insert their own consents"
  ON user_consents FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own consents (for revoking)
CREATE POLICY "Users can update their own consents"
  ON user_consents FOR UPDATE
  USING (user_id = auth.uid());

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON user_consents(user_id);

-- Index for checking specific consent types per user
CREATE INDEX IF NOT EXISTS idx_user_consents_user_type ON user_consents(user_id, consent_type);

-- ============================================
-- ROLLBACK (run this to undo the migration)
-- ============================================
-- DROP POLICY IF EXISTS "Users can view their own consents" ON user_consents;
-- DROP POLICY IF EXISTS "Users can insert their own consents" ON user_consents;
-- DROP POLICY IF EXISTS "Users can update their own consents" ON user_consents;
-- DROP INDEX IF EXISTS idx_user_consents_user_id;
-- DROP INDEX IF EXISTS idx_user_consents_user_type;
-- DROP TABLE IF EXISTS user_consents;
