-- Create plaid_items table to store Plaid access tokens
CREATE TABLE IF NOT EXISTS plaid_items (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  item_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  institution_name TEXT,
  last_synced TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;

-- Create policies for read/write access
CREATE POLICY "Enable read access for all users" ON plaid_items
  FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON plaid_items
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON plaid_items
  FOR UPDATE USING (true);

CREATE POLICY "Enable delete access for all users" ON plaid_items
  FOR DELETE USING (true);

-- Create account_mappings table to map Plaid accounts to app accounts
CREATE TABLE IF NOT EXISTS account_mappings (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  plaid_account_id TEXT NOT NULL UNIQUE,
  plaid_account_name TEXT NOT NULL,
  app_account_type TEXT NOT NULL,
  is_credit_card BOOLEAN DEFAULT false,
  is_statement_balance BOOLEAN DEFAULT false
);

-- Enable RLS for account_mappings
ALTER TABLE account_mappings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for all users" ON account_mappings
  FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON account_mappings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON account_mappings
  FOR UPDATE USING (true);

CREATE POLICY "Enable delete access for all users" ON account_mappings
  FOR DELETE USING (true);
