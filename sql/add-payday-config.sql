-- Migration: Add payday anchor/frequency columns to app_config
-- Run in Supabase SQL Editor before deploying onboarding v2.
--
-- These columns store the detected payday schedule from onboarding analysis.
-- Existing rows (Mat & Mara) will have NULLs — getUpcomingPaydays() falls back
-- to hardcoded 2026 anchor dates when these are NULL, so production behavior
-- is unchanged until they re-onboard.

ALTER TABLE app_config
  ADD COLUMN IF NOT EXISTS payday_1_anchor DATE,
  ADD COLUMN IF NOT EXISTS payday_1_frequency TEXT DEFAULT 'biweekly',
  ADD COLUMN IF NOT EXISTS payday_2_anchor DATE,
  ADD COLUMN IF NOT EXISTS payday_2_frequency TEXT DEFAULT 'biweekly';
