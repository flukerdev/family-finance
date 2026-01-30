import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the project root (one level up from server/)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Debug: Log loaded credentials (masked)
console.log('Plaid Client ID:', process.env.PLAID_CLIENT_ID ? `${process.env.PLAID_CLIENT_ID.substring(0, 8)}...` : 'NOT SET');
console.log('Plaid Secret:', process.env.PLAID_SECRET ? `${process.env.PLAID_SECRET.substring(0, 8)}...` : 'NOT SET');
console.log('Plaid Environment:', process.env.PLAID_ENV || 'NOT SET');

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
    const { public_token, institution } = req.body;
    const response = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const { access_token, item_id } = response.data;

    // Store access token in Supabase with institution name
    const { data, error } = await supabase
      .from('plaid_items')
      .insert({
        item_id,
        access_token,
        institution_name: institution?.name || 'Unknown',
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
        // Add institution info to each account
        const accountsWithInstitution = response.data.accounts.map(acc => ({
          ...acc,
          institution_name: item.institution_name
        }));
        allAccounts.push(...accountsWithInstitution);
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

// List all accounts with details (for mapping configuration)
app.get('/api/accounts/list', async (req, res) => {
  try {
    const { data: items, error } = await supabase
      .from('plaid_items')
      .select('*');

    if (error || !items || items.length === 0) {
      return res.json({ accounts: [] });
    }

    const allAccounts = [];
    for (const item of items) {
      try {
        const response = await plaidClient.accountsBalanceGet({
          access_token: item.access_token,
        });
        for (const acc of response.data.accounts) {
          allAccounts.push({
            account_id: acc.account_id,
            name: acc.name,
            official_name: acc.official_name,
            type: acc.type,
            subtype: acc.subtype,
            institution: item.institution_name,
            balance: acc.balances.current,
            mask: acc.mask // Last 4 digits
          });
        }
      } catch (error) {
        console.error(`Error fetching accounts for item ${item.item_id}:`, error);
      }
    }

    // Log accounts for debugging
    console.log('\n=== PLAID ACCOUNTS ===');
    allAccounts.forEach(acc => {
      console.log(`  ${acc.institution} | ${acc.name} | ${acc.type}/${acc.subtype} | $${acc.balance} | ID: ${acc.account_id}`);
    });
    console.log('======================\n');

    res.json({ accounts: allAccounts });
  } catch (error) {
    console.error('Error listing accounts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Account mapping is now stored in Supabase account_mappings table
// and managed via the UI in Settings tab

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

    // Fetch account mappings from database
    const { data: mappings } = await supabase
      .from('account_mappings')
      .select('*');

    const accountMapping = {};
    (mappings || []).forEach(m => {
      accountMapping[m.plaid_account_id] = m.app_account_type;
    });

    // Fetch balances for all items
    const allAccounts = [];
    for (const item of items) {
      try {
        const response = await plaidClient.accountsBalanceGet({
          access_token: item.access_token,
        });
        const accountsWithInstitution = response.data.accounts.map(acc => ({
          ...acc,
          institution_name: item.institution_name
        }));
        allAccounts.push(...accountsWithInstitution);
      } catch (error) {
        console.error(`Error fetching balances for item ${item.item_id}:`, error);
      }
    }

    // Log all accounts for mapping reference
    console.log('\n=== SYNCING ACCOUNTS ===');
    allAccounts.forEach(acc => {
      const mapped = accountMapping[acc.account_id] || 'UNMAPPED';
      console.log(`  [${mapped}] ${acc.institution_name} | ${acc.name} | $${acc.balances.current} | ID: ${acc.account_id}`);
    });

    // Initialize balance snapshot
    const balanceSnapshot = {
      give: null,
      save: null,
      live: null,
      mat: null,
      mara: null,
      blue_total: null,
      blue_statement: null,
      gold_total: null,
      gold_statement: null,
      discover_total: null,
      discover_statement: null,
    };

    // Map accounts using database configuration
    let mappedCount = 0;
    for (const account of allAccounts) {
      const appAccountType = accountMapping[account.account_id];
      const balance = account.balances.current || 0;

      if (appAccountType) {
        // Credit card balances are negative in Plaid, we want positive
        if (appAccountType.includes('blue') || appAccountType.includes('gold') || appAccountType.includes('discover')) {
          balanceSnapshot[appAccountType] = Math.abs(balance);
        } else {
          balanceSnapshot[appAccountType] = balance;
        }
        mappedCount++;
      }
    }

    console.log(`=== Mapped ${mappedCount}/${allAccounts.length} accounts ===\n`);

    // Check if any accounts are mapped
    if (mappedCount === 0) {
      console.log('⚠️  WARNING: No accounts are mapped! Configure mappings in Settings tab.');
      return res.json({
        success: false,
        message: 'No accounts mapped. Go to Settings to configure account mappings.',
        accounts: allAccounts.map(a => ({ id: a.account_id, name: a.name, institution: a.institution_name, balance: a.balances.current }))
      });
    }

    // Only save if we have mapped accounts
    // Remove null values (unmapped accounts) - keep existing values
    const filteredSnapshot = {};
    for (const [key, value] of Object.entries(balanceSnapshot)) {
      if (value !== null) {
        filteredSnapshot[key] = value;
      }
    }

    // Get current snapshot to merge with
    const { data: currentSnapshot } = await supabase
      .from('balance_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    // Merge: use new values where mapped, keep old values where not
    const mergedSnapshot = currentSnapshot?.[0]
      ? { ...currentSnapshot[0], ...filteredSnapshot }
      : filteredSnapshot;

    // Remove id and created_at from merge
    delete mergedSnapshot.id;
    delete mergedSnapshot.created_at;

    // Save to Supabase
    const { data, error } = await supabase
      .from('balance_snapshots')
      .insert(mergedSnapshot)
      .select();

    if (error) {
      console.error('Error saving snapshot:', error);
      return res.status(500).json({ error: error.message });
    }

    // Update last_synced for all items
    await supabase
      .from('plaid_items')
      .update({ last_synced: new Date().toISOString() })
      .neq('id', 0);

    res.json({ success: true, snapshot: data[0], mapped: mappedCount, total: allAccounts.length });
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

// ============================================
// ACCOUNT MAPPING ENDPOINTS
// ============================================

// Get all account mappings from database
app.get('/api/mappings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('account_mappings')
      .select('*');

    if (error) {
      console.error('Error fetching mappings:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ mappings: data || [] });
  } catch (error) {
    console.error('Error getting mappings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save account mappings to database
app.post('/api/mappings', async (req, res) => {
  try {
    const { mappings } = req.body;

    if (!mappings || !Array.isArray(mappings)) {
      return res.status(400).json({ error: 'Invalid mappings format' });
    }

    // Delete existing mappings and insert new ones
    await supabase.from('account_mappings').delete().neq('id', 0);

    if (mappings.length > 0) {
      const { error } = await supabase
        .from('account_mappings')
        .insert(mappings);

      if (error) {
        console.error('Error saving mappings:', error);
        return res.status(500).json({ error: error.message });
      }
    }

    res.json({ success: true, count: mappings.length });
  } catch (error) {
    console.error('Error saving mappings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all Plaid accounts with their current mappings
app.get('/api/accounts/with-mappings', async (req, res) => {
  try {
    // Get Plaid items
    const { data: items, error: itemsError } = await supabase
      .from('plaid_items')
      .select('*');

    if (itemsError || !items || items.length === 0) {
      return res.json({ accounts: [] });
    }

    // Get current mappings
    const { data: mappings } = await supabase
      .from('account_mappings')
      .select('*');

    const mappingLookup = {};
    (mappings || []).forEach(m => {
      mappingLookup[m.plaid_account_id] = m.app_account_type;
    });

    // Fetch accounts from Plaid
    const allAccounts = [];
    for (const item of items) {
      try {
        const response = await plaidClient.accountsBalanceGet({
          access_token: item.access_token,
        });
        for (const acc of response.data.accounts) {
          allAccounts.push({
            account_id: acc.account_id,
            name: acc.name,
            official_name: acc.official_name,
            type: acc.type,
            subtype: acc.subtype,
            institution: item.institution_name,
            balance: acc.balances.current,
            mask: acc.mask,
            mapped_to: mappingLookup[acc.account_id] || null
          });
        }
      } catch (error) {
        console.error(`Error fetching accounts for item ${item.item_id}:`, error);
      }
    }

    res.json({ accounts: allAccounts });
  } catch (error) {
    console.error('Error listing accounts with mappings:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
