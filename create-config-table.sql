-- Create app_config table to store application configuration
CREATE TABLE IF NOT EXISTS app_config (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  mat_pay_amount NUMERIC NOT NULL,
  mara_pay_amount NUMERIC NOT NULL,
  split_give NUMERIC NOT NULL,
  split_save NUMERIC NOT NULL,
  split_mat_live NUMERIC NOT NULL,
  split_mara_live NUMERIC NOT NULL,
  due_date_blue INTEGER NOT NULL,
  due_date_gold INTEGER NOT NULL,
  due_date_discover INTEGER NOT NULL,
  due_date_rent TEXT NOT NULL,
  monthly_rent NUMERIC NOT NULL,
  monthly_insurance NUMERIC NOT NULL,
  monthly_gym NUMERIC NOT NULL,
  monthly_date_nights NUMERIC NOT NULL,
  monthly_power NUMERIC NOT NULL,
  monthly_groceries NUMERIC NOT NULL,
  monthly_gas NUMERIC NOT NULL
);

-- Enable RLS
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Create policies for read/write access
CREATE POLICY "Enable read access for all users" ON app_config
  FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON app_config
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON app_config
  FOR UPDATE USING (true);

-- Insert default configuration
INSERT INTO app_config (
  mat_pay_amount,
  mara_pay_amount,
  split_give,
  split_save,
  split_mat_live,
  split_mara_live,
  due_date_blue,
  due_date_gold,
  due_date_discover,
  due_date_rent,
  monthly_rent,
  monthly_insurance,
  monthly_gym,
  monthly_date_nights,
  monthly_power,
  monthly_groceries,
  monthly_gas
) VALUES (
  2018.55,
  1302.06,
  0.20,
  0.20,
  984.00,
  656.00,
  8,
  15,
  2,
  'last',
  2135,
  28,
  100,
  200,
  120,
  500,
  270
);
