import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Plaid client
const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});
const plaidClient = new PlaidApi(plaidConfig);

// Initialize Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Create link token for Plaid Link
app.post('/api/create_link_token', async (req, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: 'family-finance-user',
      },
      client_name: 'Family Finance',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error creating link token:', error);
    res.status(500).json({ error: error.message });
  }
});

// Exchange public token for access token
app.post('/api/exchange_public_token', async (req, res) => {
  try {
    const { public_token } = req.body;
    const response = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const { access_token, item_id } = response.data;

    // Store access token in Supabase
    const { data, error } = await supabase
      .from('plaid_items')
      .insert({
        item_id,
        access_token,
        created_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      console.error('Error storing access token:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, item_id });
  } catch (error) {
    console.error('Error exchanging public token:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get balances from all connected accounts
app.get('/api/balances', async (req, res) => {
  try {
    // Fetch all stored Plaid items
    const { data: items, error } = await supabase
      .from('plaid_items')
      .select('*');

    if (error) {
      console.error('Error fetching items:', error);
      return res.status(500).json({ error: error.message });
    }

    if (!items || items.length === 0) {
      return res.json({ accounts: [] });
    }

    // Fetch balances for all items
    const allAccounts = [];
    for (const item of items) {
      try {
        const response = await plaidClient.accountsBalanceGet({
          access_token: item.access_token,
        });
        allAccounts.push(...response.data.accounts);
      } catch (error) {
        console.error(`Error fetching balances for item ${item.item_id}:`, error);
      }
    }

    res.json({ accounts: allAccounts });
  } catch (error) {
    console.error('Error getting balances:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sync balances to Supabase balance_snapshots
app.post('/api/sync_balances', async (req, res) => {
  try {
    // Fetch all stored Plaid items
    const { data: items, error: itemsError } = await supabase
      .from('plaid_items')
      .select('*');

    if (itemsError) {
      console.error('Error fetching items:', itemsError);
      return res.status(500).json({ error: itemsError.message });
    }

    if (!items || items.length === 0) {
      return res.json({ success: false, message: 'No connected accounts' });
    }

    // Fetch balances for all items
    const allAccounts = [];
    for (const item of items) {
      try {
        const response = await plaidClient.accountsBalanceGet({
          access_token: item.access_token,
        });
        allAccounts.push(...response.data.accounts);
      } catch (error) {
        console.error(`Error fetching balances for item ${item.item_id}:`, error);
      }
    }

    // Map account names to our balance fields
    const balanceSnapshot = {
      give: 0,
      save: 0,
      live: 0,
      mat: 0,
      mara: 0,
      blue_total: 0,
      blue_statement: 0,
      gold_total: 0,
      gold_statement: 0,
      discover_total: 0,
      discover_statement: 0,
    };

    // You'll need to map Plaid accounts to your account types
    // This is a placeholder - you'll customize based on your actual account names
    for (const account of allAccounts) {
      const accountName = account.name.toLowerCase();
      const balance = account.balances.current || 0;

      // Map accounts based on name matching
      if (accountName.includes('give')) balanceSnapshot.give = balance;
      else if (accountName.includes('save')) balanceSnapshot.save = balance;
      else if (accountName.includes('live')) balanceSnapshot.live = balance;
      else if (accountName.includes('mat') && !accountName.includes('statement')) balanceSnapshot.mat = balance;
      else if (accountName.includes('mara')) balanceSnapshot.mara = balance;
      else if (accountName.includes('blue') && accountName.includes('statement')) balanceSnapshot.blue_statement = Math.abs(balance);
      else if (accountName.includes('blue')) balanceSnapshot.blue_total = Math.abs(balance);
      else if (accountName.includes('gold') && accountName.includes('statement')) balanceSnapshot.gold_statement = Math.abs(balance);
      else if (accountName.includes('gold')) balanceSnapshot.gold_total = Math.abs(balance);
      else if (accountName.includes('discover') && accountName.includes('statement')) balanceSnapshot.discover_statement = Math.abs(balance);
      else if (accountName.includes('discover')) balanceSnapshot.discover_total = Math.abs(balance);
    }

    // Save to Supabase
    const { data, error } = await supabase
      .from('balance_snapshots')
      .insert(balanceSnapshot)
      .select();

    if (error) {
      console.error('Error saving snapshot:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, snapshot: data[0] });
  } catch (error) {
    console.error('Error syncing balances:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a connected item
app.delete('/api/items/:item_id', async (req, res) => {
  try {
    const { item_id } = req.params;

    // Delete from Supabase
    const { error } = await supabase
      .from('plaid_items')
      .delete()
      .eq('item_id', item_id);

    if (error) {
      console.error('Error deleting item:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
