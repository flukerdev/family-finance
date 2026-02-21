import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the project root (one level up from server/)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();

// ─── Security headers ───────────────────────────────────────────────────────
// helmet() sets a collection of HTTP headers that protect against common attacks:
//  - Strict-Transport-Security: forces browsers to use HTTPS
//  - X-Content-Type-Options: prevents MIME-type sniffing
//  - X-Frame-Options: prevents your site from being embedded in iframes (clickjacking)
//  - X-XSS-Protection: enables browser XSS filtering
//  - Content-Security-Policy: restricts where resources can load from
//  - And several others
app.use(helmet());

// ─── CORS — restrict which websites can call this API ────────────────────────
// In development: allow localhost (any port) so Vite dev server can reach the API.
// In production: only allow your Vercel domain.
// ALLOWED_ORIGINS env var lets you add extra origins (comma-separated) if needed.
const allowedOrigins = [
  'https://family-finance-rouge.vercel.app',
  // Always allow localhost for development
  /^http:\/\/localhost(:\d+)?$/,
];

// If you set ALLOWED_ORIGINS in .env, those get added too (comma-separated URLs)
if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',').forEach(origin => {
    allowedOrigins.push(origin.trim());
  });
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, mobile apps)
    if (!origin) return callback(null, true);
    // Check if the origin matches any allowed string or regex
    const allowed = allowedOrigins.some(allowed =>
      allowed instanceof RegExp ? allowed.test(origin) : allowed === origin
    );
    if (allowed) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json());

// Rate limiting — prevents API abuse
// General limiter: 100 requests per 15 minutes per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Strict limiter for sensitive endpoints: 10 requests per 15 minutes
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

app.use('/api', generalLimiter);

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

// Supabase URL and keys — anon key for per-request user clients, service role for admin operations
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Admin Supabase client — uses the service role key to bypass RLS.
// Only used for operations that require admin privileges (e.g., deleting auth users).
// NEVER expose this key to the frontend.
const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Auth middleware: verifies the user's Supabase JWT and creates a
// per-request Supabase client that acts as that user (so RLS works).
// Attaches req.supabase (authenticated client) and req.userId.
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  // Create a Supabase client with the user's JWT — RLS policies apply automatically
  const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  // Verify the token by fetching the user
  const { data: { user }, error } = await userSupabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.supabase = userSupabase;
  req.userId = user.id;
  next();
};

// Apply auth middleware to all /api routes
app.use('/api', requireAuth);

// Create link token for Plaid Link
app.post('/api/create_link_token', strictLimiter, async (req, res) => {
  try {
    // Use 'transactions' which is commonly available
    // 'auth' and 'balance' may have restrictions
    const products = ['transactions'];

    const linkTokenConfig = {
      user: {
        client_user_id: req.userId,
      },
      client_name: 'Family Finance',
      products: products,
      country_codes: ['US'],
      language: 'en',
    };

    // Note: No redirect_uri needed for Limited Production (non-OAuth banks only)
    // OAuth banks require HTTPS redirect URIs and full production access

    const response = await plaidClient.linkTokenCreate(linkTokenConfig);
    res.json(response.data);
  } catch (error) {
    console.error('Error creating link token:', error.response?.data || error.message);
    res.status(500).json({
      error: error.response?.data?.error_message || error.message,
      code: error.response?.data?.error_code
    });
  }
});

// Exchange public token for access token
app.post('/api/exchange_public_token', strictLimiter, async (req, res) => {
  try {
    const { public_token, institution } = req.body;

    if (!public_token || typeof public_token !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid public_token' });
    }

    const response = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const { access_token, item_id } = response.data;

    // Store access token in Supabase with institution name
    const { data, error } = await req.supabase
      .from('plaid_items')
      .insert({
        item_id,
        access_token,
        institution_name: institution?.name || 'Unknown',
        created_at: new Date().toISOString(),
        user_id: req.userId,
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
    const { data: items, error } = await req.supabase
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
    const { data: items, error } = await req.supabase
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
    // Rate limit: skip saving a new snapshot if the most recent one is less than 1 hour old
    const { data: recentSnapshot } = await req.supabase
      .from('balance_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (recentSnapshot && recentSnapshot.length > 0) {
      const lastTime = new Date(recentSnapshot[0].created_at).getTime();
      const oneHour = 60 * 60 * 1000;
      if (Date.now() - lastTime < oneHour) {
        return res.json({ success: true, snapshot: recentSnapshot[0], skipped: true, message: 'Recent snapshot exists' });
      }
    }

    // Fetch all stored Plaid items
    const { data: items, error: itemsError } = await req.supabase
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
    const { data: mappings } = await req.supabase
      .from('account_mappings')
      .select('*')
      .eq('user_id', req.userId);

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

    // Check if any accounts are mapped
    if (mappedCount === 0) {
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
    const { data: currentSnapshot } = await req.supabase
      .from('balance_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    // Merge: use new values where mapped, keep old values where not
    const mergedSnapshot = currentSnapshot?.[0]
      ? { ...currentSnapshot[0], ...filteredSnapshot }
      : filteredSnapshot;

    // Remove id and created_at from merge, add user_id
    delete mergedSnapshot.id;
    delete mergedSnapshot.created_at;
    mergedSnapshot.user_id = req.userId;

    // Save to Supabase
    const { data, error } = await req.supabase
      .from('balance_snapshots')
      .insert(mergedSnapshot)
      .select();

    if (error) {
      console.error('Error saving snapshot:', error);
      return res.status(500).json({ error: error.message });
    }

    // Update last_synced for all items
    await req.supabase
      .from('plaid_items')
      .update({ last_synced: new Date().toISOString() })
      .neq('id', 0);

    res.json({ success: true, snapshot: data[0], mapped: mappedCount, total: allAccounts.length });
  } catch (error) {
    console.error('Error syncing balances:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a connected item — revokes Plaid token first, then removes from DB
app.delete('/api/items/:item_id', async (req, res) => {
  try {
    const { item_id } = req.params;

    if (!item_id || typeof item_id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid item_id' });
    }

    // Fetch the access token so we can revoke it with Plaid
    const { data: item } = await req.supabase
      .from('plaid_items')
      .select('access_token')
      .eq('item_id', item_id)
      .single();

    // Revoke the Plaid access token (prevents further data retrieval)
    if (item?.access_token) {
      try {
        await plaidClient.itemRemove({ access_token: item.access_token });
      } catch (plaidErr) {
        // Log but don't block deletion — token may already be invalid
        console.error('Error revoking Plaid token (continuing with deletion):', plaidErr.message);
      }
    }

    // Delete from Supabase
    const { error } = await req.supabase
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
    const { data, error } = await req.supabase
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

    // Validate each mapping has required fields
    const validAccountTypes = ['give', 'save', 'live', 'mat', 'mara', 'blue_total', 'gold_total', 'discover_total'];
    for (const m of mappings) {
      if (!m.plaid_account_id || typeof m.plaid_account_id !== 'string') {
        return res.status(400).json({ error: 'Each mapping must have a plaid_account_id string' });
      }
      if (!m.app_account_type || !validAccountTypes.includes(m.app_account_type)) {
        return res.status(400).json({ error: `Invalid app_account_type: ${m.app_account_type}` });
      }
    }

    // Delete existing mappings for this user and insert new ones
    await req.supabase.from('account_mappings').delete().eq('user_id', req.userId);

    if (mappings.length > 0) {
      // Add user_id to each mapping
      const mappingsWithUser = mappings.map(m => ({ ...m, user_id: req.userId }));
      const { error } = await req.supabase
        .from('account_mappings')
        .insert(mappingsWithUser);

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
    const { data: items, error: itemsError } = await req.supabase
      .from('plaid_items')
      .select('*');

    if (itemsError || !items || items.length === 0) {
      return res.json({ accounts: [] });
    }

    // Get current mappings
    const { data: mappings } = await req.supabase
      .from('account_mappings')
      .select('*')
      .eq('user_id', req.userId);

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

// ─── Consent Endpoints ────────────────────────────────────────────────────
// Records and checks user consent for privacy policy, Plaid data access, etc.
// Consent timestamps are recorded server-side for compliance (Plaid Q10).

// Check if the user has an active consent of a given type
app.get('/api/consent', async (req, res) => {
  try {
    const { type } = req.query;
    if (!type) {
      return res.status(400).json({ error: 'Missing consent type query parameter' });
    }

    const { data, error } = await req.supabase
      .from('user_consents')
      .select('*')
      .eq('consent_type', type)
      .is('revoked_at', null)
      .limit(1);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ granted: data && data.length > 0, consent: data?.[0] || null });
  } catch (error) {
    console.error('Error checking consent:', error.message);
    res.status(500).json({ error: 'Failed to check consent' });
  }
});

// Record a new consent
app.post('/api/consent', async (req, res) => {
  try {
    const { consent_type, policy_version } = req.body;
    if (!consent_type || !policy_version) {
      return res.status(400).json({ error: 'Missing consent_type or policy_version' });
    }

    const allowedTypes = ['privacy_policy', 'plaid_data_access', 'terms_of_service'];
    if (!allowedTypes.includes(consent_type)) {
      return res.status(400).json({ error: 'Invalid consent_type' });
    }

    const { data, error } = await req.supabase
      .from('user_consents')
      .insert({
        consent_type,
        policy_version,
        user_id: req.userId,
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, consent: data });
  } catch (error) {
    console.error('Error recording consent:', error.message);
    res.status(500).json({ error: 'Failed to record consent' });
  }
});

// ─── Account Deletion Endpoint ────────────────────────────────────────────
// Full account deletion per DATA_RETENTION_POLICY.md:
// 1. Revoke all Plaid access tokens
// 2. Delete all user data from every table
// 3. Delete the Supabase auth user
// This is a destructive, irreversible operation gated behind OTP on the frontend.

app.delete('/api/account', strictLimiter, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Account deletion not available — SUPABASE_SERVICE_ROLE_KEY not configured' });
    }

    const userId = req.userId;

    // Step 1: Revoke all Plaid access tokens
    const { data: items } = await req.supabase
      .from('plaid_items')
      .select('access_token, item_id');

    if (items && items.length > 0) {
      for (const item of items) {
        try {
          if (item.access_token) {
            await plaidClient.itemRemove({ access_token: item.access_token });
          }
        } catch (plaidErr) {
          // Log but continue — token may already be invalid
          console.error(`Error revoking Plaid token for item ${item.item_id}:`, plaidErr.message);
        }
      }
    }

    // Step 2: Delete all user data from every table (RLS scopes to this user)
    const tables = ['account_mappings', 'balance_snapshots', 'app_config', 'user_consents', 'plaid_items'];
    for (const table of tables) {
      const { error } = await req.supabase
        .from(table)
        .delete()
        .eq('user_id', userId);
      if (error) {
        console.error(`Error deleting from ${table}:`, error.message);
      }
    }

    // Step 3: Delete the auth user (requires service role key)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      console.error('Error deleting auth user:', authError.message);
      return res.status(500).json({ error: 'Failed to delete auth user: ' + authError.message });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting account:', error.message);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
