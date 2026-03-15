# Family Finance - Simple Dashboard (Plaid Integration Branch)

A clean, simple family finance tracking app for Mat & Mara with **automatic bank account syncing via Plaid**. This experimental branch adds live bank connection features while maintaining the simplicity of the main app.

## Features

- 📊 **Dashboard**: Real-time view of all account balances with health score
- 🔄 **Auto-Sync**: Connect bank accounts via Plaid and automatically sync balances
- 💰 **Update Tab**: Quick balance updates saved to Supabase (manual or auto-synced)
- 📈 **Reports Tab**: Weekly financial tracking and trends
- ⚙️ **Settings Tab**: Edit all configuration values + connect bank accounts

## Stack

- **Frontend**: React + Vite
- **Backend**: Express server for Plaid API integration
- **Database**: Supabase (three tables: `balance_snapshots`, `app_config`, `plaid_items`)
- **Bank Integration**: Plaid API
- No authentication, no routing complexity

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Create a `.env` file:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   PLAID_CLIENT_ID=your_plaid_client_id
   PLAID_SECRET=your_plaid_secret
   PLAID_ENV=sandbox
   ```

   **Get Plaid credentials:**
   - Sign up at [Plaid Dashboard](https://dashboard.plaid.com/signup)
   - Create a new application
   - Copy your Client ID and Sandbox Secret
   - Sandbox mode is free for testing

3. **Set up database**:
   The app uses three tables:
   - `balance_snapshots` - stores balance history
   - `app_config` - stores application settings
   - `plaid_items` - stores Plaid access tokens for connected banks

   Run these SQL files in your Supabase SQL Editor:
   1. [create-config-table.sql](sql/create-config-table.sql) - creates config table with default values
   2. [create-plaid-table.sql](sql/create-plaid-table.sql) - creates Plaid integration tables
   3. [add-user-auth.sql](sql/add-user-auth.sql) - adds user_id columns + RLS policies
   4. [create-user-consents-table.sql](sql/create-user-consents-table.sql) - consent tracking
   5. [create-transactions-table.sql](sql/create-transactions-table.sql) - transaction storage + sync cursors

4. **Run the app**:

   You need to run **two servers** (in separate terminals):

   **Terminal 1 - Backend server:**
   ```bash
   npm run server
   ```

   **Terminal 2 - Frontend app:**
   ```bash
   npm run dev
   ```

   The backend runs on `http://localhost:3001` and the frontend on `http://localhost:5173`

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

### First-Time Setup
1. Go to **Settings** tab
2. Click **"Connect Bank Account"** to link your banks via Plaid
3. Follow the Plaid Link flow to connect your accounts
4. Repeat for all bank accounts you want to track

### Daily Use
1. **Dashboard**: View your financial health score and current balances
   - Click **"Sync Bank Accounts"** button to auto-update all balances
2. **Update**: Manually enter balances if needed (or use auto-sync)
3. **Reports**: Review weekly changes and trends
4. **Settings**: Edit pay amounts, budget splits, due dates, monthly bills, and manage bank connections

### Account Mapping
The app automatically maps Plaid accounts to your finance categories based on account names:
- Accounts with "give" → Give account
- Accounts with "save" → Save account
- Accounts with "live" → Live account
- Accounts with "mat" → Mat's personal account
- Accounts with "mara" → Mara's personal account
- Credit cards are matched by name (blue/gold/discover)

**Note**: You may need to customize account mapping logic in `server/index.js` based on your actual account names.

## Production

Build for production:
```bash
npm run build
```

Deploy the `dist` folder to your hosting service.

## Notes

- **This is an experimental branch** - test the Plaid integration before merging to main
- To switch back to main branch without Plaid: `git checkout main`
- To merge Plaid features to main: `git checkout main && git merge plaid-integration && git push`
- Settings are stored in Supabase and sync across all devices
- Payday schedules are hardcoded in the app (Mat: 1st & 15th, Mara: 1st & 15th)
- Plaid Sandbox mode is free but requires test credentials (see Plaid docs)
- For production use, upgrade to Plaid Development or Production environment

## Troubleshooting

**"Make sure the server is running" error:**
- Ensure the backend server is running (`npm run server` in a separate terminal)
- Check that port 3001 is not in use

**Plaid Link not loading:**
- Verify your Plaid credentials in `.env`
- Check that `PLAID_ENV` is set to `sandbox`

**Account balances not syncing:**
- Verify account name mapping in `server/index.js`
- Check server console for errors
- Ensure you've run the SQL scripts in `sql/`

## License

Personal use only
