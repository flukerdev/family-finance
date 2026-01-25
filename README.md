# Family Finance - Simple Dashboard

A clean, simple family finance tracking app for Mat & Mara. No authentication, no complexity - just straightforward balance tracking and reporting.

## Features

- 📊 **Dashboard**: Real-time view of all account balances with health score
- 💰 **Update Tab**: Quick balance updates saved to Supabase
- 📈 **Reports Tab**: Weekly financial tracking and trends
- ⚙️ **Settings Tab**: Edit all configuration values (pay amounts, splits, due dates, monthly bills)

## Stack

- React + Vite
- Supabase (two tables: `balance_snapshots` and `app_config`)
- No authentication, no routing complexity

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Supabase**:
   Create a `.env` file:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```

3. **Set up database**:
   The app uses two tables:
   - `balance_snapshots` - stores balance history
   - `app_config` - stores application settings

   Run [create-config-table.sql](create-config-table.sql) in your Supabase SQL Editor to create the config table with default values.

   If you need to clean up old auth tables from previous versions, run [cleanup-auth-tables.sql](cleanup-auth-tables.sql) in your Supabase SQL Editor.

4. **Run the app**:
   ```bash
   npm run dev
   ```

## Database Schema

The app only needs one table:

```sql
CREATE TABLE balance_snapshots (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  give NUMERIC NOT NULL,
  save NUMERIC NOT NULL,
  live NUMERIC NOT NULL,
  mat NUMERIC NOT NULL,
  mara NUMERIC NOT NULL,
  blue_total NUMERIC DEFAULT 0,
  blue_statement NUMERIC DEFAULT 0,
  gold_total NUMERIC DEFAULT 0,
  gold_statement NUMERIC DEFAULT 0,
  discover_total NUMERIC DEFAULT 0,
  discover_statement NUMERIC DEFAULT 0
);

ALTER TABLE balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON balance_snapshots
  FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON balance_snapshots
  FOR INSERT WITH CHECK (true);
```

## Usage

1. **Dashboard**: View your financial health score and current balances
2. **Update**: Enter new balances and click "Save Snapshot"
3. **Reports**: Review weekly changes and trends
4. **Settings**: Edit pay amounts, budget splits, due dates, and monthly bills (syncs across all devices via Supabase)

## Production

Build for production:
```bash
npm run build
```

Deploy the `dist` folder to your hosting service.

## Notes

- This is the simple version for personal use
- A SaaS version with authentication is being developed separately
- All buttons are functional and tested
- Settings are stored in Supabase and sync across all devices
- Payday schedules are hardcoded in the app (Mat: 1st & 15th, Mara: 1st & 15th)

## License

Personal use only
