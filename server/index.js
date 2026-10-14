import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import payoffRouter from './payoff.js';

// Get the directory of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the project root (one level up from server/)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
app.set('trust proxy', 1); // behind Vercel's proxy

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
  'https://flipbudget.app',
  'https://www.flipbudget.app',
  // Vercel preview + project deployments
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
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

// ─── Sandbox Plaid client (for test mode) ─────────────────────────────────────
// A second Plaid client that always points to Plaid's sandbox environment.
// Used when the frontend passes X-Test-Mode: true from localhost.
// Sandbox calls are FREE — no API charges. Test credentials: user_good / pass_good
let plaidClientSandbox = null;
if (process.env.PLAID_SANDBOX_SECRET) {
  const sandboxConfig = new Configuration({
    basePath: PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SANDBOX_SECRET,
      },
    },
  });
  plaidClientSandbox = new PlaidApi(sandboxConfig);
  console.log('✓ Sandbox Plaid client initialized (test mode available)');
} else {
  console.log('⚠ PLAID_SANDBOX_SECRET not set — test mode will use production Plaid');
}

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

// ─── Test mode middleware ─────────────────────────────────────────────────────
// When the frontend sends X-Test-Mode: true from localhost, this middleware
// swaps in the sandbox Plaid client so all Plaid calls hit the free sandbox.
// SECURITY: The localhost origin check ensures this NEVER works from production.
const resolveTestMode = (req, res, next) => {
  const isTestMode = req.headers['x-test-mode'] === 'true';
  const origin = req.headers.origin || '';
  const isLocalhost = !origin || /^http:\/\/localhost(:\d+)?$/.test(origin);

  if (isTestMode && isLocalhost && plaidClientSandbox) {
    req.plaidClient = plaidClientSandbox;
    req.isTestMode = true;
  } else {
    req.plaidClient = plaidClient;
    req.isTestMode = false;
  }
  next();
};
app.use('/api', resolveTestMode);

// Payoff + P&L routes (server/payoff.js)
app.use('/api', payoffRouter);

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

    const response = await req.plaidClient.linkTokenCreate(linkTokenConfig);
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

    const response = await req.plaidClient.itemPublicTokenExchange({
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
        const response = await req.plaidClient.accountsBalanceGet({
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
        const response = await req.plaidClient.accountsBalanceGet({
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
    const force = req.query.force === 'true';

    // Rate limit: skip saving a new snapshot if the most recent one is less than 1 hour old
    // force=true bypasses this check (used after first mapping save)
    if (!force) {
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

    // Fetch account mappings from database (select all columns including new flexible ones)
    const { data: mappings } = await req.supabase
      .from('account_mappings')
      .select('*')
      .eq('user_id', req.userId);

    // Fetch credit_cards table for card metadata (label, paid_from_bucket, etc.)
    const { data: creditCards } = await req.supabase
      .from('credit_cards')
      .select('*')
      .eq('user_id', req.userId);

    const creditCardLookup = {};
    (creditCards || []).forEach(c => {
      creditCardLookup[c.card_id] = c;
    });

    // Fetch app_config for split percentages (used for primary-mode accounts)
    const { data: configRows } = await req.supabase
      .from('app_config')
      .select('*')
      .limit(1);
    const config = configRows?.[0] || {};

    // Build a lookup: plaid_account_id → full mapping row
    const mappingLookup = {};
    (mappings || []).forEach(m => {
      mappingLookup[m.plaid_account_id] = m;
    });

    // Fetch balances for all items
    const allAccounts = [];
    for (const item of items) {
      try {
        const response = await req.plaidClient.accountsBalanceGet({
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

    // ── Build JSONB snapshot objects ───────────────────────────────────────
    // buckets: { give, save, live, person1, person2, ... } — checking/savings
    // cards:   { blue: { total, statement }, gold: { total, statement }, ... }
    const buckets = {};
    const cards = {};

    // ── Build legacy flat snapshot for backward compatibility ──────────────
    // Still write old columns so existing frontend queries keep working.
    const legacySnapshot = {
      give: null, save: null, live: null, mat: null, mara: null,
      blue_total: null, blue_statement: null,
      gold_total: null, gold_statement: null,
      discover_total: null, discover_statement: null,
    };

    let mappedCount = 0;

    for (const account of allAccounts) {
      const mapping = mappingLookup[account.account_id];
      if (!mapping) continue;

      const mode = mapping.mapping_mode;

      // ── Fallback: old-style mapping (no mapping_mode set) ──────────────
      // If the row only has app_account_type (pre-migration data), use legacy logic.
      if (!mode && mapping.app_account_type) {
        const appType = mapping.app_account_type;
        const balance = account.balances.current || 0;
        const isCC = appType.includes('blue') || appType.includes('gold') || appType.includes('discover');

        if (isCC) {
          legacySnapshot[appType] = Math.abs(balance);
          // Also populate cards JSONB using the card_id if available
          if (mapping.card_id) {
            if (!cards[mapping.card_id]) cards[mapping.card_id] = {};
            cards[mapping.card_id].total = Math.abs(balance);
          }
        } else {
          legacySnapshot[appType] = balance;
          buckets[appType] = balance;
        }
        mappedCount++;
        continue;
      }

      // ── New mapping modes ──────────────────────────────────────────────
      if (mode === 'direct') {
        // Direct: entire balance goes into one bucket
        const balance = account.balances.current || 0;
        const bucket = mapping.bucket;
        buckets[bucket] = (buckets[bucket] || 0) + balance;

        // Legacy column mapping: person1→mat, person2→mara
        const legacyKey = bucket === 'person1' ? 'mat' : bucket === 'person2' ? 'mara' : bucket;
        if (legacyKey in legacySnapshot) {
          legacySnapshot[legacyKey] = (legacySnapshot[legacyKey] || 0) + balance;
        }
        mappedCount++;

      } else if (mode === 'primary') {
        // Primary: paycheck account — split balance across multiple buckets by percentage
        // Splits come from app_config (split_give, split_save) and fixed live contributions
        const balance = account.balances.current || 0;
        const splitGive = parseFloat(config.split_give) || 0.20;
        const splitSave = parseFloat(config.split_save) || 0.20;

        // Apply percentage splits — these ADD to buckets (a primary account feeds multiple)
        const giveAmount = balance * splitGive;
        const saveAmount = balance * splitSave;
        const remainder = balance - giveAmount - saveAmount;

        buckets['give'] = (buckets['give'] || 0) + giveAmount;
        buckets['save'] = (buckets['save'] || 0) + saveAmount;
        // Remainder split evenly to live for now (frontend can refine further)
        buckets['live'] = (buckets['live'] || 0) + remainder;

        // Legacy: add to flat columns
        legacySnapshot['give'] = (legacySnapshot['give'] || 0) + giveAmount;
        legacySnapshot['save'] = (legacySnapshot['save'] || 0) + saveAmount;
        legacySnapshot['live'] = (legacySnapshot['live'] || 0) + remainder;
        mappedCount++;

      } else if (mode === 'credit_card') {
        // Credit card: Plaid reports CC balances as negative (money owed), we store positive
        const totalBalance = Math.abs(account.balances.current || 0);
        // Statement balance: Plaid's limit_amount is not reliable for statement; use
        // balances.limit as a proxy if available, otherwise fall back to current balance.
        // The most accurate source is account.balances.last_statement_balance when Plaid provides it.
        const statementBalance = Math.abs(
          account.balances.last_statement_balance
          ?? account.balances.current
          ?? 0
        );

        const cardId = mapping.card_id;
        if (cardId) {
          cards[cardId] = { total: totalBalance, statement: statementBalance };

          // Legacy column mapping: blue/gold/discover
          if (cardId === 'blue') {
            legacySnapshot['blue_total'] = totalBalance;
            legacySnapshot['blue_statement'] = statementBalance;
          } else if (cardId === 'gold') {
            legacySnapshot['gold_total'] = totalBalance;
            legacySnapshot['gold_statement'] = statementBalance;
          } else if (cardId === 'discover') {
            legacySnapshot['discover_total'] = totalBalance;
            legacySnapshot['discover_statement'] = statementBalance;
          }
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

    // ── Build the merged snapshot ──────────────────────────────────────────
    // Remove null values from legacySnapshot so we only overwrite what we mapped
    const filteredLegacy = {};
    for (const [key, value] of Object.entries(legacySnapshot)) {
      if (value !== null) {
        filteredLegacy[key] = value;
      }
    }

    // Get the most recent snapshot so we can merge (preserve unmapped old values)
    const { data: currentSnapshot } = await req.supabase
      .from('balance_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    const prev = currentSnapshot?.[0] || {};

    // Merge legacy flat columns: old values first, then overwrite with new mapped values
    const mergedSnapshot = {
      ...filteredLegacy,
    };

    // Dual-write: include JSONB columns if they have data
    // Only include buckets/cards if we actually built them (avoids overwriting with empty objects)
    if (Object.keys(buckets).length > 0) {
      // Merge with previous JSONB buckets so unmapped buckets aren't lost
      mergedSnapshot.buckets = { ...(prev.buckets || {}), ...buckets };
    }
    if (Object.keys(cards).length > 0) {
      mergedSnapshot.cards = { ...(prev.cards || {}), ...cards };
    }

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
        await req.plaidClient.itemRemove({ access_token: item.access_token });
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
// Accepts BOTH old format (app_account_type) and new format (mapping_mode + bucket/card_id).
app.post('/api/mappings', async (req, res) => {
  try {
    const { mappings } = req.body;

    if (!mappings || !Array.isArray(mappings)) {
      return res.status(400).json({ error: 'Invalid mappings format' });
    }

    // Valid values for each field in the new format
    const validModes = ['direct', 'primary', 'credit_card'];
    const validBuckets = ['give', 'save', 'live', 'person1', 'person2'];
    const validPaidFrom = ['live', 'person1', 'person2'];
    // Old format valid types (kept for backward compat)
    const validLegacyTypes = ['give', 'save', 'live', 'mat', 'mara', 'blue_total', 'gold_total', 'discover_total'];

    // Rows to upsert into credit_cards table (built while validating)
    const creditCardUpserts = [];

    for (const m of mappings) {
      if (!m.plaid_account_id || typeof m.plaid_account_id !== 'string') {
        return res.status(400).json({ error: 'Each mapping must have a plaid_account_id string' });
      }

      const hasNewFormat = !!m.mapping_mode;
      const hasLegacyFormat = !!m.app_account_type;

      if (!hasNewFormat && !hasLegacyFormat) {
        return res.status(400).json({ error: `Mapping for ${m.plaid_account_id} must have either mapping_mode or app_account_type` });
      }

      if (hasNewFormat) {
        // Validate new-format fields
        if (!validModes.includes(m.mapping_mode)) {
          return res.status(400).json({ error: `Invalid mapping_mode: ${m.mapping_mode}. Must be one of: ${validModes.join(', ')}` });
        }

        if (m.mapping_mode === 'direct') {
          if (!m.bucket || !validBuckets.includes(m.bucket)) {
            return res.status(400).json({ error: `Invalid bucket: ${m.bucket}. Must be one of: ${validBuckets.join(', ')}` });
          }
        }

        if (m.mapping_mode === 'credit_card') {
          if (!m.card_id || typeof m.card_id !== 'string') {
            return res.status(400).json({ error: `credit_card mapping for ${m.plaid_account_id} must have a card_id` });
          }
          if (m.paid_from_bucket && !validPaidFrom.includes(m.paid_from_bucket)) {
            return res.status(400).json({ error: `Invalid paid_from_bucket: ${m.paid_from_bucket}. Must be one of: ${validPaidFrom.join(', ')}` });
          }
          // Queue a credit_cards upsert for this card
          creditCardUpserts.push({
            user_id: req.userId,
            card_id: m.card_id,
            label: m.card_label || m.card_id,
            paid_from_bucket: m.paid_from_bucket || null,
            plaid_account_id: m.plaid_account_id,
            // due_day and statement_close_day are set via POST /api/credit-cards separately
          });
        }
      } else {
        // Legacy format: validate app_account_type
        if (!validLegacyTypes.includes(m.app_account_type)) {
          return res.status(400).json({ error: `Invalid app_account_type: ${m.app_account_type}` });
        }
      }
    }

    // Delete existing mappings for this user and insert new ones
    await req.supabase.from('account_mappings').delete().eq('user_id', req.userId);

    if (mappings.length > 0) {
      // Add user_id to each mapping row, stripping fields that belong to credit_cards not account_mappings
      const mappingsWithUser = mappings.map(({ due_day, card_label, ...m }) => ({ ...m, user_id: req.userId }));
      const { error } = await req.supabase
        .from('account_mappings')
        .insert(mappingsWithUser);

      if (error) {
        console.error('Error saving mappings:', error);
        return res.status(500).json({ error: error.message });
      }
    }

    // Upsert credit card rows if any credit_card-mode mappings were saved
    if (creditCardUpserts.length > 0) {
      const { error: ccError } = await req.supabase
        .from('credit_cards')
        .upsert(creditCardUpserts, { onConflict: 'user_id,card_id' });

      if (ccError) {
        console.error('Error upserting credit_cards:', ccError);
        // Non-fatal: mappings saved, card metadata failed
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
      mappingLookup[m.plaid_account_id] = m;
    });

    // Fetch credit_cards for label lookups
    const { data: creditCards } = await req.supabase
      .from('credit_cards')
      .select('*')
      .eq('user_id', req.userId);
    const cardLabelLookup = {};
    (creditCards || []).forEach(c => {
      cardLabelLookup[c.card_id] = c.label;
    });

    // Fetch accounts from Plaid
    const allAccounts = [];
    for (const item of items) {
      try {
        const response = await req.plaidClient.accountsBalanceGet({
          access_token: item.access_token,
        });
        for (const acc of response.data.accounts) {
          const m = mappingLookup[acc.account_id] || null;
          allAccounts.push({
            account_id: acc.account_id,
            name: acc.name,
            official_name: acc.official_name,
            type: acc.type,
            subtype: acc.subtype,
            institution: item.institution_name,
            balance: acc.balances.current,
            mask: acc.mask,
            // Old field — kept for backward compat
            mapped_to: m ? (m.app_account_type || null) : null,
            // New flexible mapping fields
            mapping_mode: m?.mapping_mode || null,
            bucket: m?.bucket || null,
            card_id: m?.card_id || null,
            card_label: m?.card_id ? (cardLabelLookup[m.card_id] || m.card_id) : null,
            paid_from_bucket: m?.paid_from_bucket || null,
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

// ============================================
// CREDIT CARD ENDPOINTS
// ============================================

// Get all credit cards for this user, ordered by due_day
app.get('/api/credit-cards', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('credit_cards')
      .select('*')
      .order('due_day', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Error fetching credit cards:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ credit_cards: data || [] });
  } catch (error) {
    console.error('Error in GET /api/credit-cards:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Create or update a credit card config
// Upserts on (user_id, card_id) — call this from Settings to set due dates, labels, etc.
app.post('/api/credit-cards', async (req, res) => {
  try {
    const { card_id, label, due_day, statement_close_day, paid_from_bucket, plaid_account_id } = req.body;

    if (!card_id || typeof card_id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid card_id' });
    }

    const validPaidFrom = ['live', 'person1', 'person2'];
    if (paid_from_bucket && !validPaidFrom.includes(paid_from_bucket)) {
      return res.status(400).json({ error: `Invalid paid_from_bucket. Must be one of: ${validPaidFrom.join(', ')}` });
    }

    if (due_day !== undefined && due_day !== null) {
      const day = parseInt(due_day, 10);
      if (isNaN(day) || day < 1 || day > 31) {
        return res.status(400).json({ error: 'due_day must be an integer between 1 and 31' });
      }
    }

    if (statement_close_day !== undefined && statement_close_day !== null) {
      const day = parseInt(statement_close_day, 10);
      if (isNaN(day) || day < 1 || day > 31) {
        return res.status(400).json({ error: 'statement_close_day must be an integer between 1 and 31' });
      }
    }

    const row = {
      user_id: req.userId,
      card_id,
      ...(label !== undefined && { label }),
      ...(due_day !== undefined && { due_day }),
      ...(statement_close_day !== undefined && { statement_close_day }),
      ...(paid_from_bucket !== undefined && { paid_from_bucket }),
      ...(plaid_account_id !== undefined && { plaid_account_id }),
    };

    const { data, error } = await req.supabase
      .from('credit_cards')
      .upsert(row, { onConflict: 'user_id,card_id' })
      .select()
      .single();

    if (error) {
      console.error('Error upserting credit card:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, credit_card: data });
  } catch (error) {
    console.error('Error in POST /api/credit-cards:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TRANSACTION SYNC ENDPOINT
// ============================================
// Syncs transactions from Plaid using the cursor-based /transactions/sync API.
// - First call: fetches all historical transactions (typically ~2 years)
// - Subsequent calls: only fetches new/modified/removed since last cursor
// - 4-hour throttle per user to prevent excessive API calls
//
// Cost: Covered by the $0.30/connected account/month Transactions fee.
// The sync calls themselves are NOT billed per-call.

app.post('/api/sync_transactions', async (req, res) => {
  try {
    const force = req.query.force === 'true';

    // ── Step 1: Check 4-hour throttle ──────────────────────────────────────
    // Look at the most recently updated cursor for this user.
    // If it was updated less than 4 hours ago, skip the sync.
    // force=true bypasses this check (used after first mapping save)
    if (!force) {
      const { data: recentCursors } = await req.supabase
        .from('sync_cursors')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (recentCursors && recentCursors.length > 0) {
        const lastSync = new Date(recentCursors[0].updated_at).getTime();
        const fourHours = 4 * 60 * 60 * 1000;
        if (Date.now() - lastSync < fourHours) {
          const nextSyncAt = new Date(lastSync + fourHours).toISOString();
          return res.json({
            success: true,
            skipped: true,
            message: 'Transactions were synced recently. Next sync available after throttle window.',
            next_sync_at: nextSyncAt,
          });
        }
      }
    }

    // ── Step 2: Fetch Plaid items and account mappings ─────────────────────
    const { data: items, error: itemsError } = await req.supabase
      .from('plaid_items')
      .select('*');

    if (itemsError) {
      console.error('Error fetching plaid items:', itemsError);
      return res.status(500).json({ error: itemsError.message });
    }

    if (!items || items.length === 0) {
      return res.json({ success: false, message: 'No connected accounts' });
    }

    // Build a lookup: plaid_account_id → app_account_type string
    // Supports both old format (app_account_type) and new format (mapping_mode + bucket/card_id).
    // For new format:
    //   direct   → bucket value (e.g. 'give', 'save', 'live', 'person1', 'person2')
    //   credit_card → card_id value (e.g. 'blue', 'gold', 'discover')
    //   primary  → 'primary'
    // For old format: app_account_type as-is
    const { data: mappings } = await req.supabase
      .from('account_mappings')
      .select('plaid_account_id, app_account_type, mapping_mode, bucket, card_id');

    const accountTypeMap = {};
    (mappings || []).forEach(m => {
      if (m.mapping_mode) {
        if (m.mapping_mode === 'direct' && m.bucket) {
          accountTypeMap[m.plaid_account_id] = m.bucket;
        } else if (m.mapping_mode === 'credit_card' && m.card_id) {
          accountTypeMap[m.plaid_account_id] = m.card_id;
        } else if (m.mapping_mode === 'primary') {
          accountTypeMap[m.plaid_account_id] = 'primary';
        } else {
          accountTypeMap[m.plaid_account_id] = m.app_account_type || 'unmapped';
        }
      } else if (m.app_account_type) {
        // Old format — use as-is
        accountTypeMap[m.plaid_account_id] = m.app_account_type;
      }
    });

    // ── Step 3: Sync each Plaid item ──────────────────────────────────────
    let totalAdded = 0;
    let totalModified = 0;
    let totalRemoved = 0;

    for (const item of items) {
      // Load the stored cursor for this item (empty string = first sync)
      const { data: cursorRows } = await req.supabase
        .from('sync_cursors')
        .select('cursor')
        .eq('item_id', item.item_id)
        .limit(1);

      let cursor = cursorRows && cursorRows.length > 0 ? cursorRows[0].cursor : '';

      // Plaid may paginate — keep calling until has_more is false
      let hasMore = true;
      while (hasMore) {
        const syncResponse = await req.plaidClient.transactionsSync({
          access_token: item.access_token,
          cursor: cursor,
          count: 500, // Max per page
        });

        const { added, modified, removed, next_cursor, has_more } = syncResponse.data;

        // ── Process ADDED transactions ──────────────────────────────────
        if (added.length > 0) {
          const rows = added.map(txn => ({
            user_id: req.userId,
            plaid_transaction_id: txn.transaction_id,
            plaid_account_id: txn.account_id,
            app_account_type: accountTypeMap[txn.account_id] || 'unmapped',
            amount: txn.amount,
            date: txn.date,
            name: txn.name || null,
            merchant_name: txn.merchant_name || null,
            category: txn.category ? JSON.stringify(txn.category) : null,
            personal_finance_category: txn.personal_finance_category
              ? JSON.stringify(txn.personal_finance_category) : null,
            pending: txn.pending || false,
          }));

          // Upsert: if a transaction already exists (same user + plaid_transaction_id),
          // update it. This handles the case where a "pending" transaction gets re-added
          // after being removed when it posts.
          const { error: insertError } = await req.supabase
            .from('transactions')
            .upsert(rows, { onConflict: 'user_id,plaid_transaction_id' });

          if (insertError) {
            console.error('Error inserting transactions:', insertError);
          } else {
            totalAdded += added.length;
          }
        }

        // ── Process MODIFIED transactions ───────────────────────────────
        // These are transactions that changed (e.g., pending → posted, amount adjusted).
        if (modified.length > 0) {
          const rows = modified.map(txn => ({
            user_id: req.userId,
            plaid_transaction_id: txn.transaction_id,
            plaid_account_id: txn.account_id,
            app_account_type: accountTypeMap[txn.account_id] || 'unmapped',
            amount: txn.amount,
            date: txn.date,
            name: txn.name || null,
            merchant_name: txn.merchant_name || null,
            category: txn.category ? JSON.stringify(txn.category) : null,
            personal_finance_category: txn.personal_finance_category
              ? JSON.stringify(txn.personal_finance_category) : null,
            pending: txn.pending || false,
            updated_at: new Date().toISOString(),
          }));

          const { error: updateError } = await req.supabase
            .from('transactions')
            .upsert(rows, { onConflict: 'user_id,plaid_transaction_id' });

          if (updateError) {
            console.error('Error updating transactions:', updateError);
          } else {
            totalModified += modified.length;
          }
        }

        // ── Process REMOVED transactions ────────────────────────────────
        // Plaid removes transactions when they were temporary (e.g., pending cleared)
        // or the bank reversed them.
        if (removed.length > 0) {
          const removedIds = removed.map(txn => txn.transaction_id);

          const { error: deleteError } = await req.supabase
            .from('transactions')
            .delete()
            .in('plaid_transaction_id', removedIds);

          if (deleteError) {
            console.error('Error removing transactions:', deleteError);
          } else {
            totalRemoved += removed.length;
          }
        }

        // Advance cursor and check if more pages remain
        cursor = next_cursor;
        hasMore = has_more;
      }

      // ── Step 4: Save the new cursor ─────────────────────────────────────
      // Upsert: creates a new row on first sync, updates on subsequent syncs.
      const { error: cursorError } = await req.supabase
        .from('sync_cursors')
        .upsert({
          user_id: req.userId,
          item_id: item.item_id,
          cursor: cursor,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,item_id' });

      if (cursorError) {
        console.error('Error saving sync cursor:', cursorError);
      }
    }

    res.json({
      success: true,
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved,
    });
  } catch (error) {
    console.error('Error syncing transactions:', error.response?.data || error.message);
    res.status(500).json({
      error: error.response?.data?.error_message || error.message,
      code: error.response?.data?.error_code,
    });
  }
});

// ─── Transaction Read Endpoint ────────────────────────────────────────────
// Returns the authenticated user's transactions with optional filtering and pagination.
// Query params: account_type, start_date, end_date, limit (default 50, max 200), offset

// Includes old-style types (mat, mara, blue_total, etc.) for backward compat,
// plus new flexible types (person1, person2, primary, card_id values like blue/gold/discover).
const VALID_ACCOUNT_TYPES = [
  // Legacy bucket names
  'give', 'save', 'live', 'mat', 'mara',
  // Legacy credit card identifiers
  'blue_total', 'gold_total', 'discover_total',
  // New flexible bucket names
  'person1', 'person2', 'primary',
  // New credit card id values (short names used in credit_cards.card_id)
  'blue', 'gold', 'discover',
  // Fallback
  'unmapped',
];

app.get('/api/transactions', async (req, res) => {
  try {
    const { account_type, start_date, end_date } = req.query;

    // Validate account_type if provided
    if (account_type && !VALID_ACCOUNT_TYPES.includes(account_type)) {
      return res.status(400).json({
        error: `Invalid account_type. Must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}`,
      });
    }

    // Validate date formats if provided (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (start_date && !dateRegex.test(start_date)) {
      return res.status(400).json({ error: 'Invalid start_date format. Use YYYY-MM-DD.' });
    }
    if (end_date && !dateRegex.test(end_date)) {
      return res.status(400).json({ error: 'Invalid end_date format. Use YYYY-MM-DD.' });
    }

    // Parse and clamp limit/offset
    let limit = parseInt(req.query.limit, 10);
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;

    let offset = parseInt(req.query.offset, 10);
    if (isNaN(offset) || offset < 0) offset = 0;

    // Build query — RLS scopes to authenticated user automatically
    let query = req.supabase
      .from('transactions')
      .select('*', { count: 'exact' });

    if (account_type) {
      query = query.eq('app_account_type', account_type);
    }
    if (start_date) {
      query = query.gte('date', start_date);
    }
    if (end_date) {
      query = query.lte('date', end_date);
    }

    query = query
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching transactions:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      transactions: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error in GET /api/transactions:', error.message);
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
            await req.plaidClient.itemRemove({ access_token: item.access_token });
          }
        } catch (plaidErr) {
          // Log but continue — token may already be invalid
          console.error(`Error revoking Plaid token for item ${item.item_id}:`, plaidErr.message);
        }
      }
    }

    // Step 2: Delete all user data from every table (RLS scopes to this user)
    const tables = ['transactions', 'sync_cursors', 'account_mappings', 'balance_snapshots', 'app_config', 'user_consents', 'plaid_items', 'credit_cards'];
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

// ─── Test data reset (test mode only) ─────────────────────────────────────────
// Wipes all user data from the 7 tables WITHOUT deleting the auth account,
// so you can immediately test again without re-signing up.
// Only works when X-Test-Mode: true is sent from localhost.
app.post('/api/test-reset', async (req, res) => {
  if (!req.isTestMode) {
    return res.status(403).json({ error: 'Test reset only available in test mode on localhost' });
  }

  try {
    const userId = req.userId;
    const tables = ['transactions', 'sync_cursors', 'account_mappings',
                    'balance_snapshots', 'app_config', 'user_consents', 'plaid_items', 'credit_cards'];

    for (const table of tables) {
      const { error } = await req.supabase
        .from(table)
        .delete()
        .eq('user_id', userId);
      if (error) console.error(`Test reset: error deleting from ${table}:`, error.message);
    }

    console.log(`✓ Test data reset complete for user ${userId}`);
    res.json({ success: true, message: 'Test data cleared. You will see onboarding again.' });
  } catch (error) {
    console.error('Error during test reset:', error.message);
    res.status(500).json({ error: 'Failed to reset test data' });
  }
});

// ─── Transaction Analysis (Onboarding) ─────────────────────────────────────────
// Analyzes stored transactions to detect income patterns and recurring bills.
// Called during onboarding Step 11 so the user can confirm what we found.
app.post('/api/analyze-transactions', async (req, res) => {
  try {
    const userId = req.userId;
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const startDate = twoYearsAgo.toISOString().split('T')[0];

    const { data: txns, error } = await req.supabase
      .from('transactions')
      .select('amount, date, name, merchant_name, plaid_account_id')
      .eq('user_id', userId)
      .gte('date', startDate)
      .order('date', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    // ── Income Detection ─────────────────────────────────────────────────────
    // Negative amounts in Plaid = money coming IN (deposits)
    const deposits = (txns || []).filter(t => t.amount < 0);

    // Cluster by amount (±5% tolerance)
    const clusters = [];
    for (const dep of deposits) {
      const amt = Math.abs(dep.amount);
      let found = false;
      for (const cluster of clusters) {
        if (Math.abs(cluster.median - amt) / cluster.median <= 0.05) {
          cluster.items.push(dep);
          found = true;
          break;
        }
      }
      if (!found) clusters.push({ median: amt, items: [dep] });
    }

    // For clusters with ≥4 occurrences, compute frequency and confidence
    const incomeStreams = [];
    for (const cluster of clusters) {
      if (cluster.items.length < 4) continue;
      const sorted = cluster.items.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      const dates = sorted.map(i => new Date(i.date));
      const intervals = [];
      for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
      }
      const medianInterval = intervals.slice().sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
      const frequency = medianInterval <= 9 ? 'weekly'
        : medianInterval <= 16 ? 'biweekly'
        : medianInterval <= 17 ? 'semi-monthly'
        : 'monthly';

      const amounts = sorted.map(i => Math.abs(i.amount));
      const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const variance = amounts.map(a => Math.abs(a - avgAmount) / avgAmount);
      const maxVariance = Math.max(...variance);
      const confidence = cluster.items.length >= 8 && maxVariance < 0.05 ? 0.95
        : cluster.items.length >= 4 ? 0.6 + (cluster.items.length - 4) * 0.04
        : 0.5;

      incomeStreams.push({
        id: `income_${incomeStreams.length}`,
        label: 'Paycheck',
        amount: Math.round(avgAmount * 100) / 100,
        frequency,
        anchorDate: sorted[sorted.length - 1].date,
        confidence: Math.min(0.99, confidence),
        occurrences: cluster.items.length,
      });
    }
    // Sort by occurrences descending, return top 2
    incomeStreams.sort((a, b) => b.occurrences - a.occurrences);
    const income = incomeStreams.slice(0, 2);

    // ── Bill Detection ───────────────────────────────────────────────────────
    // Positive amounts in Plaid = money going OUT
    const outgoing = (txns || []).filter(t => t.amount > 0);

    // Group by normalized merchant name
    const merchantGroups = {};
    for (const t of outgoing) {
      const key = (t.merchant_name || t.name || '').toUpperCase().trim().replace(/\s+\d+$/, '');
      if (!key) continue;
      if (!merchantGroups[key]) merchantGroups[key] = [];
      merchantGroups[key].push(t);
    }

    // Known bill keyword mappings
    const billKeywords = {
      rent: [/rent/i, /zelle.*rent/i, /landlord/i, /lease/i],
      gym: [/planet\s*fitness/i, /gym/i, /crossfit/i, /ymca/i, /equinox/i, /anytime\s*fitness/i, /la\s*fitness/i],
      power: [/electric/i, /power/i, /energy/i, /utilities/i, /pge/i, /con\s*ed/i, /duke\s*energy/i, /aps\b/i, /aes\b/i],
      insurance: [/insurance/i, /geico/i, /progressive/i, /allstate/i, /state\s*farm/i],
      groceries: [/walmart/i, /kroger/i, /safeway/i, /whole\s*foods/i, /target/i, /costco/i, /aldi/i, /trader\s*joe/i, /publix/i, /heb\b/i],
      gas: [/shell/i, /exxon/i, /chevron/i, /bp\b/i, /mobil/i, /sunoco/i, /speedway/i, /circle\s*k/i, /wawa/i, /gas\s*station/i],
      dateNights: [/restaurant/i, /dining/i, /doordash/i, /grubhub/i, /uber\s*eats/i],
    };

    const bills = [];
    for (const [merchant, items] of Object.entries(merchantGroups)) {
      if (items.length < 3) continue;
      const sorted = items.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      const dates = sorted.map(i => new Date(i.date));
      const intervals = [];
      for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
      }
      const medianInterval = intervals.length > 0
        ? intervals.slice().sort((a, b) => a - b)[Math.floor(intervals.length / 2)]
        : 0;

      // Only keep recurring monthly-ish (25–35 day interval)
      if (medianInterval < 20 || medianInterval > 40) continue;

      const amounts = sorted.map(i => i.amount);
      const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const variance = amounts.map(a => Math.abs(a - avgAmount) / avgAmount);
      const maxVariance = Math.max(...variance);
      const isVariable = maxVariance > 0.15;

      // Find modal day of month
      const days = sorted.map(i => new Date(i.date).getDate());
      const dayCounts = {};
      for (const d of days) dayCounts[d] = (dayCounts[d] || 0) + 1;
      const modalDay = parseInt(Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0][0]);
      const dueDay = modalDay >= 28 ? 'last' : modalDay;

      // Attempt to map to a known bill key
      let mappedBillKey = null;
      for (const [key, patterns] of Object.entries(billKeywords)) {
        if (patterns.some(p => p.test(merchant))) { mappedBillKey = key; break; }
      }
      // Also check: large amounts likely rent
      if (!mappedBillKey && avgAmount > 800) mappedBillKey = 'rent';

      const confidence = items.length >= 8 && maxVariance < 0.05 ? 0.95
        : items.length >= 5 ? 0.75
        : 0.6;

      bills.push({
        id: mappedBillKey ? `bill_${mappedBillKey}` : `bill_${bills.length}`,
        name: merchant.charAt(0) + merchant.slice(1).toLowerCase(),
        amount: Math.round(avgAmount * 100) / 100,
        dueDay,
        isVariable,
        confidence,
        mappedBillKey,
        occurrences: items.length,
      });
    }

    // Deduplicate by mappedBillKey (keep highest confidence per key)
    const billMap = {};
    for (const b of bills) {
      const key = b.mappedBillKey || b.id;
      if (!billMap[key] || b.confidence > billMap[key].confidence) billMap[key] = b;
    }
    const dedupedBills = Object.values(billMap).sort((a, b) => b.occurrences - a.occurrences);

    res.json({ income, bills: dedupedBills });
  } catch (err) {
    console.error('Error analyzing transactions:', err);
    res.status(500).json({ error: err.message });
  }
});

// Analyzes 12 months of stored transactions to detect recurring monthly expenses
// and income streams for the Live Calculation onboarding step.
// Returns { income, autoDetected, needsReview } where:
//   autoDetected = high-confidence recurring expenses (auto-categorized)
//   needsReview  = monthly-ish recurring charges that need user confirmation (Yes/No)
app.post('/api/analyze-spending', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
    const startDate = twelveMonthsAgo.toISOString().split('T')[0];
    const monthsInRange = 12;

    const { data: txns, error } = await req.supabase
      .from('transactions')
      .select('amount, date, name, merchant_name, personal_finance_category')
      .eq('user_id', userId)
      .gte('date', startDate)
      .eq('pending', false)
      .order('date', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    // ── Income Detection (same logic as analyze-transactions) ─────────────────
    const deposits = (txns || []).filter(t => t.amount < 0);
    const incomeClusters = [];
    for (const dep of deposits) {
      const amt = Math.abs(dep.amount);
      let found = false;
      for (const cluster of incomeClusters) {
        if (Math.abs(cluster.median - amt) / cluster.median <= 0.05) {
          cluster.items.push(dep);
          found = true;
          break;
        }
      }
      if (!found) incomeClusters.push({ median: amt, items: [dep] });
    }
    const incomeStreams = [];
    for (const cluster of incomeClusters) {
      if (cluster.items.length < 4) continue;
      const sorted = cluster.items.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      const dates = sorted.map(i => new Date(i.date));
      const intervals = [];
      for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
      }
      const medianInterval = intervals.slice().sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
      const frequency = medianInterval <= 9 ? 'weekly'
        : medianInterval <= 16 ? 'biweekly'
        : medianInterval <= 17 ? 'semi-monthly'
        : 'monthly';
      const amounts = sorted.map(i => Math.abs(i.amount));
      const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const variance = amounts.map(a => Math.abs(a - avgAmount) / avgAmount);
      const maxVariance = Math.max(...variance);
      const confidence = cluster.items.length >= 8 && maxVariance < 0.05 ? 0.95
        : cluster.items.length >= 4 ? 0.6 + (cluster.items.length - 4) * 0.04 : 0.5;
      incomeStreams.push({
        id: `income_${incomeStreams.length}`,
        label: 'Paycheck',
        amount: Math.round(avgAmount * 100) / 100,
        frequency,
        anchorDate: sorted[sorted.length - 1].date,
        confidence: Math.min(0.99, confidence),
        occurrences: cluster.items.length,
      });
    }
    incomeStreams.sort((a, b) => b.occurrences - a.occurrences);
    const income = incomeStreams.slice(0, 2);

    // ── Expense Detection ──────────────────────────────────────────────────────
    const outgoing = (txns || []).filter(t => t.amount > 0);

    // Merchant keyword → category map (comprehensive)
    const expenseKeywords = {
      rent:          [/rent/i, /landlord/i, /lease/i, /mortgage/i, /property\s*mgmt/i, /zelle.*rent/i],
      groceries:     [/walmart/i, /kroger/i, /safeway/i, /whole\s*foods/i, /target/i, /costco/i, /aldi/i,
                      /trader\s*joe/i, /publix/i, /heb\b/i, /meijer/i, /wegmans/i, /sprouts/i, /market/i,
                      /food\s*lion/i, /giant/i, /stop\s*&?\s*shop/i],
      gas:           [/shell/i, /exxon/i, /chevron/i, /bp\b/i, /mobil/i, /sunoco/i, /speedway/i,
                      /circle\s*k/i, /wawa/i, /gas\s*station/i, /pilot\s*travel/i, /loves\s*travel/i,
                      /racetrac/i, /kwik\s*trip/i],
      power:         [/electric/i, /power/i, /energy/i, /utilities/i, /pge\b/i, /con\s*ed/i,
                      /duke\s*energy/i, /aps\b/i, /aes\b/i, /dominion/i, /xcel/i, /pacific\s*gas/i,
                      /georgia\s*power/i, /pepco/i, /entergy/i],
      insurance:     [/insurance/i, /geico/i, /progressive/i, /allstate/i, /state\s*farm/i,
                      /liberty\s*mutual/i, /nationwide/i, /usaa/i, /farmers\s*ins/i, /amica/i],
      gym:           [/planet\s*fitness/i, /gym/i, /crossfit/i, /ymca/i, /equinox/i,
                      /anytime\s*fitness/i, /la\s*fitness/i, /24\s*hour\s*fitness/i, /crunch\s*fitness/i,
                      /orange\s*theory/i, /peloton/i, /fitness/i],
      dateNights:    [/doordash/i, /grubhub/i, /uber\s*eats/i, /postmates/i, /seamless/i,
                      /restaurant/i, /dining/i, /dine\s*in/i],
      subscriptions: [/netflix/i, /spotify/i, /hulu/i, /disney\+?/i, /amazon\s*prime/i,
                      /apple\.com\/bill/i, /apple\s*one/i, /google\s*one/i, /google\s*storage/i,
                      /microsoft\s*365/i, /adobe/i, /hbo/i, /paramount\+?/i, /peacock/i,
                      /youtube\s*premium/i, /dropbox/i, /icloud/i, /sling\s*tv/i, /fubo/i,
                      /discovery\+/i, /espn\+?/i, /pandora/i, /tidal/i, /deezer/i,
                      /audible/i, /kindle/i, /scribd/i, /duolingo/i, /headspace/i,
                      /calm/i, /noom/i, /whoop/i, /strava/i],
    };

    // Plaid personal_finance_category.detailed → expense category
    const pfcDetailedMap = {
      'FOOD_AND_DRINK_GROCERIES':            'groceries',
      'FOOD_AND_DRINK_SUPERMARKETS_AND_GROCERIES': 'groceries',
      'FOOD_AND_DRINK_RESTAURANTS':          'dateNights',
      'FOOD_AND_DRINK_FAST_FOOD':            'dateNights',
      'FOOD_AND_DRINK_COFFEE':               'dateNights',
      'TRANSPORTATION_GAS_AND_PETROL':       'gas',
      'TRANSPORTATION_FUEL':                 'gas',
      'RENT_AND_UTILITIES_RENT':             'rent',
      'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY': 'power',
      'RENT_AND_UTILITIES_UTILITIES':        'power',
      'INSURANCE_AUTO_INSURANCE':            'insurance',
      'INSURANCE_HOMEOWNERS_INSURANCE':      'insurance',
      'INSURANCE_RENTERS_INSURANCE':         'insurance',
      'INSURANCE_LIFE_INSURANCE':            'insurance',
      'GENERAL_SERVICES_GYMS_AND_FITNESS_CENTERS': 'gym',
      'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS': 'gym',
      'ENTERTAINMENT_SUBSCRIPTION_SERVICE':  'subscriptions',
      'GENERAL_MERCHANDISE_SUPERSTORES':     'groceries',
      'GENERAL_MERCHANDISE_DISCOUNT_STORES': 'groceries',
    };

    // Plaid personal_finance_category.primary → category hint (fallback only)
    const pfcPrimaryHint = {
      'SUBSCRIPTION': 'Looks like a subscription',
      'ENTERTAINMENT': 'Looks like entertainment',
      'FOOD_AND_DRINK': 'Looks like food or dining',
      'TRANSPORTATION': 'Looks like transportation',
      'RENT_AND_UTILITIES': 'Looks like a utility or bill',
      'INSURANCE_AND_PROTECTION': 'Looks like insurance',
      'GENERAL_MERCHANDISE': 'Looks like a store purchase',
    };

    // Normalize merchant name for grouping
    const normalizeMerchant = (name) =>
      (name || '').toUpperCase().trim().replace(/\s+\d+$/, '').replace(/\s{2,}/g, ' ');

    // Group outgoing transactions by normalized merchant name
    const merchantGroups = {};
    for (const t of outgoing) {
      const key = normalizeMerchant(t.merchant_name || t.name);
      if (!key) continue;
      if (!merchantGroups[key]) merchantGroups[key] = [];
      merchantGroups[key].push(t);
    }

    const autoDetected = [];
    const needsReview = [];

    for (const [merchant, items] of Object.entries(merchantGroups)) {
      if (items.length < 2) continue;

      const sorted = items.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      const dates = sorted.map(i => new Date(i.date));
      const intervals = [];
      for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
      }
      if (intervals.length === 0) continue;
      const medianInterval = intervals.slice().sort((a, b) => a - b)[Math.floor(intervals.length / 2)];

      // Only keep monthly-ish recurrence (20–45 day interval)
      if (medianInterval < 20 || medianInterval > 45) continue;

      const amounts = sorted.map(i => i.amount);
      const totalAmount = amounts.reduce((s, a) => s + a, 0);
      const avgAmount = totalAmount / amounts.length;
      const variance = amounts.map(a => Math.abs(a - avgAmount) / avgAmount);
      const maxVariance = Math.max(...variance);

      // Monthly average: total / number of months in range
      const monthlyAmount = Math.round((totalAmount / monthsInRange) * 100) / 100;
      if (monthlyAmount < 5) continue; // Skip tiny amounts

      // Determine category: PFC detailed > keyword match > PFC primary hint
      let category = null;
      let confidence = 0.50;
      let categoryHint = null;

      // 1. Try Plaid PFC detailed (use most recent transaction's category)
      const latestTxn = sorted[sorted.length - 1];
      if (latestTxn.personal_finance_category) {
        try {
          const pfc = typeof latestTxn.personal_finance_category === 'string'
            ? JSON.parse(latestTxn.personal_finance_category)
            : latestTxn.personal_finance_category;
          if (pfc?.detailed && pfcDetailedMap[pfc.detailed]) {
            category = pfcDetailedMap[pfc.detailed];
            confidence = 0.80;
          } else if (pfc?.primary && pfcPrimaryHint[pfc.primary]) {
            categoryHint = pfcPrimaryHint[pfc.primary];
            confidence = 0.65;
          }
        } catch {}
      }

      // 2. Try keyword match (overrides PFC primary hint; can upgrade PFC-detected category)
      for (const [cat, patterns] of Object.entries(expenseKeywords)) {
        if (patterns.some(p => p.test(merchant))) {
          category = cat;
          confidence = items.length >= 8 && maxVariance < 0.05 ? 0.95 : 0.85;
          break;
        }
      }

      // 3. Large-amount fallback: likely rent
      if (!category && avgAmount > 800) {
        category = 'rent';
        confidence = 0.75;
      }

      const lastSeen = sorted[sorted.length - 1].date;
      const displayName = merchant.charAt(0) + merchant.slice(1).toLowerCase();

      if (confidence >= 0.75 || category) {
        // High confidence or known category → auto-detected
        autoDetected.push({
          id: `auto_${autoDetected.length}`,
          name: displayName,
          monthlyAmount,
          category,
          confidence,
          occurrences: items.length,
        });
      } else {
        // Low confidence, monthly-ish, no category → needs user review
        needsReview.push({
          id: `review_${needsReview.length}`,
          name: displayName,
          monthlyAmount,
          occurrences: items.length,
          lastSeen,
          categoryHint,
        });
      }
    }

    // Deduplicate autoDetected by category (keep highest confidence per category)
    // Exception: subscriptions can have multiple entries (Netflix + Spotify are different)
    const autoMap = {};
    const autoSubscriptions = [];
    for (const item of autoDetected) {
      if (item.category === 'subscriptions') {
        autoSubscriptions.push(item);
        continue;
      }
      if (!autoMap[item.category] || item.confidence > autoMap[item.category].confidence) {
        autoMap[item.category] = item;
      }
    }
    const dedupedAuto = [...Object.values(autoMap), ...autoSubscriptions]
      .sort((a, b) => b.monthlyAmount - a.monthlyAmount);

    // Cap needsReview at 15 items, sorted by amount descending (highest impact first)
    const cappedReview = needsReview
      .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
      .slice(0, 15);

    res.json({ income, autoDetected: dedupedAuto, needsReview: cappedReview });
  } catch (err) {
    console.error('Error analyzing spending:', err);
    res.status(500).json({ error: err.message });
  }
});

// On Vercel this module is imported by api/index.js and exported as a serverless
// function, so we only listen when run directly (`npm run server`).
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
