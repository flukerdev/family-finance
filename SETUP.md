# Family Finance Dashboard - Setup Guide

This guide walks you through setting up your personal finance dashboard. Follow each step in order.

---

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and log in
2. Click **"New Project"**
3. Fill in:
   - **Name:** `family-finance` (or whatever you want)
   - **Database Password:** Create a strong password (save this somewhere)
   - **Region:** Choose closest to you
4. Click **"Create new project"**
5. Wait ~2 minutes for it to set up

---

## Step 2: Create the Database Table

1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Paste this entire SQL block:

```sql
-- Create the balance_snapshots table
CREATE TABLE balance_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  give DECIMAL(10,2) NOT NULL DEFAULT 0,
  save DECIMAL(10,2) NOT NULL DEFAULT 0,
  live DECIMAL(10,2) NOT NULL DEFAULT 0,
  mat DECIMAL(10,2) NOT NULL DEFAULT 0,
  mara DECIMAL(10,2) NOT NULL DEFAULT 0,
  blue_statement DECIMAL(10,2) NOT NULL DEFAULT 0,
  gold_statement DECIMAL(10,2) NOT NULL DEFAULT 0,
  discover_statement DECIMAL(10,2) NOT NULL DEFAULT 0
);

-- Enable Row Level Security (RLS)
ALTER TABLE balance_snapshots ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations (since you're not using auth)
-- This is fine for a personal/family app not exposed publicly
CREATE POLICY "Allow all operations" ON balance_snapshots
  FOR ALL USING (true) WITH CHECK (true);

-- Create an index for faster queries by date
CREATE INDEX idx_balance_snapshots_created_at ON balance_snapshots(created_at DESC);

-- Insert your initial snapshot with today's balances
INSERT INTO balance_snapshots (give, save, live, mat, mara, blue_statement, gold_statement, discover_statement)
VALUES (5018.36, 7787.67, 1216.59, 694.79, 945.91, 0, 758.56, 1381.76);
```

4. Click **"Run"** (or press Cmd+Enter / Ctrl+Enter)
5. You should see "Success" message

---

## Step 3: Get Your Supabase Credentials

1. In Supabase, click **"Settings"** (gear icon) in the left sidebar
2. Click **"API"** under Configuration
3. You'll need two values:
   - **Project URL:** Copy the URL under "Project URL" (looks like `https://xxxxx.supabase.co`)
   - **anon public key:** Copy the key under "Project API keys" → "anon" → "public"

---

## Step 4: Deploy to Vercel

### Option A: Deploy via GitHub (Recommended)

1. Create a new GitHub repository:
   - Go to [github.com/new](https://github.com/new)
   - Name it `family-finance`
   - Keep it private
   - Click "Create repository"

2. Push the code to GitHub:
   ```bash
   cd family-finance
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/family-finance.git
   git push -u origin main
   ```

3. Deploy on Vercel:
   - Go to [vercel.com](https://vercel.com) and log in
   - Click **"Add New..."** → **"Project"**
   - Import your `family-finance` repository
   - Before deploying, expand **"Environment Variables"**
   - Add these two variables:
     - `VITE_SUPABASE_URL` = your Project URL from Step 3
     - `VITE_SUPABASE_ANON_KEY` = your anon public key from Step 3
   - Click **"Deploy"**

### Option B: Deploy via Vercel CLI

1. Install Vercel CLI if you haven't:
   ```bash
   npm install -g vercel
   ```

2. In the `family-finance` folder, run:
   ```bash
   vercel
   ```

3. Follow the prompts, then add environment variables:
   ```bash
   vercel env add VITE_SUPABASE_URL
   vercel env add VITE_SUPABASE_ANON_KEY
   ```

4. Redeploy with the variables:
   ```bash
   vercel --prod
   ```

---

## Step 5: Test It Out

1. Visit your deployed URL (Vercel will give you one like `family-finance-xxxxx.vercel.app`)
2. You should see the dashboard with your initial balances
3. Try updating balances in the "Update" tab
4. Check that the health score updates

---

## Troubleshooting

**"Error loading data" on the dashboard?**
- Double-check your environment variables in Vercel
- Make sure there are no extra spaces in the values
- Redeploy after changing env variables

**Blank screen?**
- Open browser console (F12) and check for errors
- Verify Supabase credentials are correct

**Data not saving?**
- Check Supabase → Table Editor → balance_snapshots to see if rows are being created
- Verify RLS policy was created (run the SQL again if needed)

---

## Local Development (Optional)

If you want to run locally:

1. Create a `.env` file in the project root:
   ```
   VITE_SUPABASE_URL=your_project_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```

2. Install dependencies and run:
   ```bash
   npm install
   npm run dev
   ```

3. Open http://localhost:5173

---

## Understanding the App

### Health Score (1-100)

The score drops based on these priorities (in order):
1. **-30 points:** An account can't cover its credit card payment by the due date
2. **-20 points:** LIVE account projected to be short for rent
3. **-5 points:** Personal accounts below $50

### Timeline

Shows the next 8 events (paydays and due dates) sorted by date. Green dots are money coming in, red dots are money going out.

### Reports

- **Weekly Report:** Compares your oldest snapshot from 7+ days ago to today
- **Monthly Report:** Compares your oldest snapshot from 30+ days ago to today
- **Kickback Detection:** If LIVE has more than $150 buffer, it suggests kickback

---

## Future Improvements

When you're ready to expand:
- Add transaction logging for category breakdowns
- Add authentication so only you and Mara can access
- Add push notifications for weekly reports
- Connect to bank APIs (Plaid) for automatic balance updates

Let me know if you hit any snags!
