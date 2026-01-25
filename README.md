# Family Finance - Simple Dashboard

A clean, simple family finance tracking app for Mat & Mara. No authentication, no complexity - just straightforward balance tracking and reporting.

## Features

- 📊 **Dashboard**: Real-time view of all account balances with health score
- 💰 **Update Tab**: Quick balance updates saved to Supabase
- 📈 **Reports Tab**: Weekly financial tracking and trends

## Stack

- React + Vite
- Supabase (single table: `balance_snapshots`)
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
   The app uses a single table: `balance_snapshots`

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
- Hardcoded payday schedules in CONFIG object (easy to modify in src/App.jsx)

## License

Personal use only
