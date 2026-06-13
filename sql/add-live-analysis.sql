-- Adds monthly_subscriptions to app_config for recurring subscription expenses
-- detected during the Live Calculation onboarding step (streaming, software, etc.)
-- Run in Supabase SQL Editor before testing the new onboarding flow.
ALTER TABLE app_config ADD COLUMN IF NOT EXISTS monthly_subscriptions NUMERIC DEFAULT 0;
