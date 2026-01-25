# Plaid Integration Setup Guide

## Quick Start

### 1. Get Plaid Credentials (5 minutes)

1. Go to [Plaid Dashboard](https://dashboard.plaid.com/signup)
2. Sign up for a free account
3. Create a new application
4. Navigate to **Team Settings > Keys**
5. Copy your:
   - **Client ID**
   - **Sandbox Secret** (for testing)

### 2. Configure Environment Variables

Create or update your `.env` file:

```bash
# Existing Supabase config
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key

# New Plaid config
PLAID_CLIENT_ID=your_plaid_client_id_here
PLAID_SECRET=your_plaid_sandbox_secret_here
PLAID_ENV=sandbox
```

### 3. Set Up Database

Run this in your Supabase SQL Editor:

```sql
-- Copy and paste the contents of create-plaid-table.sql
```

Or upload the file directly to Supabase.

### 4. Run the App

**Terminal 1 - Backend Server:**
```bash
npm run server
```

You should see: `Server running on port 3001`

**Terminal 2 - Frontend App:**
```bash
npm run dev
```

You should see: `Local: http://localhost:5173/`

### 5. Connect Your Accounts

1. Open `http://localhost:5173`
2. Go to **Settings** tab
3. Click **"Connect Bank Account"**
4. In Plaid Sandbox, use these test credentials:
   - **Institution**: Select any bank (e.g., Chase)
   - **Username**: `user_good`
   - **Password**: `pass_good`
5. Select the accounts you want to link
6. Click **Continue**

### 6. Sync Your Balances

1. Go to **Dashboard** tab
2. Click **"Sync Bank Accounts"** button
3. Check the console for any errors
4. Your balances should update automatically!

---

## Account Mapping

The app maps Plaid accounts to your categories based on account names. You may need to customize this in `server/index.js`:

```javascript
// Lines 147-160 in server/index.js
for (const account of allAccounts) {
  const accountName = account.name.toLowerCase();
  const balance = account.balances.current || 0;

  // Customize these mappings based on your actual account names
  if (accountName.includes('give')) balanceSnapshot.give = balance;
  else if (accountName.includes('save')) balanceSnapshot.save = balance;
  // ... etc
}
```

### How to Find Your Account Names:

1. After connecting accounts, check the server console
2. Add a `console.log(account.name)` in the mapping loop
3. Update the matching logic to match your actual account names

---

## Testing with Plaid Sandbox

Plaid Sandbox is **free** and doesn't connect to real banks. Test credentials:

| Use Case | Username | Password |
|----------|----------|----------|
| Success flow | `user_good` | `pass_good` |
| Invalid credentials | `user_bad` | `pass_good` |
| Account locked | `user_locked` | `pass_good` |

See [Plaid Sandbox Guide](https://plaid.com/docs/sandbox/test-credentials/) for more.

---

## Troubleshooting

### "Make sure the server is running"
- Check Terminal 1 - is the server running?
- Try `curl http://localhost:3001/api/balances` - should return `{"accounts":[]}`

### Plaid Link won't open
- Check `.env` - are `PLAID_CLIENT_ID` and `PLAID_SECRET` set?
- Check browser console for errors
- Restart the server after changing `.env`

### Accounts connected but balances not syncing
- Check `server/index.js` account mapping logic
- Add `console.log(allAccounts)` to see account names
- Verify `create-plaid-table.sql` was run in Supabase

### CORS errors
- Make sure both servers are running
- Frontend should be on `localhost:5173`
- Backend should be on `localhost:3001`

---

## Going to Production

When you're ready to use **real bank accounts**:

1. Complete Plaid's verification process
2. Upgrade to **Development** or **Production** environment
3. Update `.env`:
   ```
   PLAID_ENV=development  # or 'production'
   PLAID_SECRET=your_development_secret
   ```
4. Get real bank credentials (no more test accounts)

**Note:** Plaid charges per account after free tier. Check [pricing](https://plaid.com/pricing/).

---

## Next Steps

If you like the Plaid integration and want to merge it to main:

```bash
# Switch to main branch
git checkout main

# Merge plaid-integration
git merge plaid-integration

# Push to GitHub
git push
```

If you don't like it and want to go back:

```bash
# Just switch back to main
git checkout main

# Your main branch is untouched!
```

---

## Support

- [Plaid Documentation](https://plaid.com/docs/)
- [Plaid Quickstart Guide](https://plaid.com/docs/quickstart/)
- Check `server/index.js` comments for implementation details
