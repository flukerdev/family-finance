-- Add onboarding and person name columns to app_config
-- Run this in Supabase SQL Editor before deploying the onboarding feature

ALTER TABLE app_config
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS person_1_name TEXT DEFAULT 'Person 1',
  ADD COLUMN IF NOT EXISTS person_2_name TEXT DEFAULT 'Person 2',
  ADD COLUMN IF NOT EXISTS is_joint_budget BOOLEAN DEFAULT false;
