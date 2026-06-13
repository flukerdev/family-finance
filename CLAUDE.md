# Flip — Family Finance Dashboard

## Project Overview
Flip is a personal finance web app for a married couple (Mat & Mara) who follow a "Give First, Save Second, Live Last" budgeting system. The app connects to real bank accounts via Plaid and provides a real-time health score, budget tracking, bill timeline, and analytics across 5 checking accounts and 3 credit cards.

This is Mat's personal project. He is learning web development — **always explain what changes are being made and why**. Prioritize teaching over speed.

## Tech Stack
- **Frontend:** React 18 + Vite (runs on port 5176)
- **Backend:** Express server in `server/` directory (runs on port 3001)
- **Database:** Supabase (hosted Postgres)
- **Bank Integration:** Plaid API (production access LIVE)
- **Security:** helmet (HTTP headers), express-rate-limit, CORS whitelist
- **Styling:** Inline styles via theme system (no CSS framework)
- **Language:** JavaScript (JSX), not TypeScript
- **Charts:** Recharts (ComposedChart, Line, Area, XAxis, YAxis, etc.)

## Key Commands
- `npm run dev` — Start Vite frontend (port 5173)
- `npm run server` — Start Express backend (port 3001)
- `npm test` — Run Vitest tests (available after Phase 3)
- `npx vite build` — Production build (verify no errors)
- IMPORTANT: **Both must be running simultaneously** for Plaid features to work
- IMPORTANT: **Server MUST be restarted after any .env changes** — it reads .env on startup only

## Project Structure
```
/
├── CLAUDE.md              ← You are here
├── PLAN.md                ← MVP roadmap v2 (authoritative — 9 phases, see this for what to build next)
├── STATUS.md              ← Development status tracker
├── MATH_AUDIT.md          ← Calculation audit results
├── .env                   ← Plaid + Supabase credentials (never commit)
├── package.json
├── vite.config.js
├── vercel.json            ← SPA routing config (rewrites all paths to index.html)
├── sql/                   ← Supabase migration files
│   ├── create-plaid-table.sql
│   ├── create-config-table.sql
│   ├── add-user-auth.sql
│   ├── create-user-consents-table.sql
│   ├── create-transactions-table.sql
│   ├── add-onboarding-columns.sql  ← Adds onboarding + person name columns to app_config
│   ├── fix-rls-security.sql        ← RLS audit/fix script (balance_snapshots leak fix)
│   └── flexible-accounts-migration.sql ← Flexible accounts: credit_cards table, JSONB columns, data migration
├── server/
│   └── index.js           ← Express backend (Plaid API, auth, consent, transactions)
├── src/
│   ├── App.jsx            ← Main app (~5800 lines): all views, state, calculations
│   ├── main.jsx           ← React entry point
│   └── components/
│       ├── Onboarding.jsx       ← First-time user onboarding wizard (10 steps)
│       ├── PlaidLink.jsx        ← Bank connection flow via Plaid Link
│       ├── AccountMappingUI.jsx ← Maps Plaid accounts → app buckets
│       ├── BalanceChart.jsx     ← Single-account balance history (Area chart)
│       ├── CreditCardChart.jsx  ← CC total/statement vs account balance (Area + Lines + overage shading)
│       ├── NetPositionChart.jsx ← Net worth over time (checking minus CC balances)
│       ├── SafeToSpendChart.jsx ← Personal account projection to next due date (monotone + daily interpolation)
│       └── BudgetHealthChart.jsx← LIVE account projection to end of month (daily burn rate)
├── shared/                ← (Phase 3) Shared financial logic — imported by both web and mobile
│   ├── financial.js       ← Pure calculation functions (splits, paydays, bills, projections)
│   ├── health.js          ← Health score engine
│   ├── formatting.js      ← Display helpers (calc strings, currency, dates)
│   └── __tests__/         ← Vitest tests for shared logic
├── branding/              ← (Phase 5) Design tokens, logo assets, icon assets
├── mobile/                ← (Phase 6) Expo/React Native iPhone app
│   ├── app/               ← Expo Router file-based routes
│   ├── lib/               ← API client, theme, Supabase init
│   └── components/        ← React Native chart and UI components
├── security/              ← Security & compliance documentation
└── .claude/
    ├── agents/            ← Subagent definitions (frontend, backend, supabase, lead)
    └── commands/          ← Custom slash commands
```

## Deployment
- **Hosting:** Vercel (auto-deploys from GitHub main branch)
- **Production URL:** https://family-finance-rouge.vercel.app
- **Public privacy policy:** https://family-finance-rouge.vercel.app/privacy (no login required)
- **SPA routing:** `vercel.json` rewrites all paths to `index.html` so React handles routing

## Environment Variables (.env in project root)
```
VITE_SUPABASE_URL=<supabase-url>
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
VITE_API_URL=<production-api-url>  # defaults to http://localhost:3001 if not set
PLAID_CLIENT_ID=<plaid-client-id>
PLAID_SECRET=<plaid-secret>
PLAID_ENV=production
PLAID_SANDBOX_SECRET=<plaid-sandbox-secret>  # enables test mode (sandbox Plaid client)
PORT=3001
ALLOWED_ORIGINS=<extra-cors-origins>  # optional, comma-separated URLs
```
- The server uses explicit path resolution to load .env: `dotenv.config({ path: path.resolve(__dirname, '../.env') })`
- Debug logging on startup shows masked credential values — if you see "NOT SET", the .env is not loading

## Git Workflow
- `main` branch = production/stable code
- Feature branches for experiments
- Always confirm which branch we're on before making changes
- Commit frequently with descriptive messages
- Do not push to main without Mat's approval

## Code Style
- ES modules (`import`/`export`), NOT CommonJS (`require`)
- React functional components with hooks
- Inline styles via theme tokens (see Theme System below)
- Descriptive variable names over clever short ones

---

## THEME SYSTEM (Ink Wash)

All UI colors use semantic theme tokens — never hardcode hex values.

```js
const theme = themes[themeMode]; // 'dark' or 'light'
// Use: theme.bg, theme.cardBg, theme.text, theme.textMuted, theme.textDimmed
// Status: theme.success, theme.danger, theme.warning
// Accounts: theme.give, theme.save, theme.live, theme.mat, theme.mara
// Derived: theme.dangerBg, theme.successBg, theme.dangerLight, theme.successLight
```

The `createStyles(theme, fonts)` function generates all shared style objects from theme tokens.

---

## APP.JSX ARCHITECTURE (~5300 lines)

### Key Sections (approximate line ranges — use Grep to find exact positions)
| Section | ~Lines | Purpose |
|---------|--------|---------|
| Theme system + styles | 1–1100 | Theme tokens, `createStyles()`, all shared style objects |
| State declarations | 1600–1670 | `useState` hooks for all app state |
| Auth functions (OTP) | 1670–1810 | signup, login, logout, sendEmailOtp, verifyEmailOtp |
| Financial functions | 1810–2900 | getPersonalSplits, calculateDisposableIncome, calculateHealth, etc. |
| Consent functions | 2040–2095 | grantPlaidConsent, recordSignupConsent |
| Sync & Plaid | 2097–2200 | syncBalances, syncTransactions, handleMappingSaved, handlePlaidSuccess |
| Data fetching | 2200–3060 | fetchConfig, fetchSnapshots, fetchConnectedAccounts, fetchPlaidMappings |
| Chart data (useMemo) | 3060–3150 | transforms snapshots into chart-ready arrays |
| Public routes | 3482–3590 | `/privacy` page (renders before auth gate, no login required) |
| Auth gate + login UI | 3590–3800 | Login/signup form, OTP verification screen |
| Onboarding gate | ~4098 | Shows `<Onboarding>` when `onboardingComplete === false && connectedAccounts.length === 0` |
| Dashboard view | 3800–4400 | Health score carousel, donut, suggestions, alerts, budget health |
| Accounts view | 4400–4500 | Account list + chart drill-down |
| Calendar view | 4500–4700 | Monthly calendar with bill markers |
| Popup system | 4700–5100 | Slide-in panels for safeToSpend, positiveDetail, budgetHealth, etc. |
| Bottom nav | 5100–5150 | Home → Accounts → Calendar |

### Key Patterns

**Popup system:** `setActivePopup({ type: 'safeToSpend', person, data, calculation })` → renders in the popup section at bottom of JSX. Each type has its own render block.

**disposableData pattern:** Objects passed to `SafeToSpendChart` with shape:
```js
{ accountBalance, nextPaymentAmount, nextDueDate, cushion, paydaysBeforeDue, depositAmounts }
```
`depositAmounts` is an array of `{ date, type, amount }` with exact per-payday splits.

**Carousel pattern:** Horizontal swipe containers using `transform: translateX(-${slide * 100}%)` with touch handlers and dot indicators.

**Name parameterization:** Person names are stored in `config.person1Name` / `config.person2Name` (from `app_config.person_1_name` / `person_2_name`). All UI strings use these instead of hardcoded "Mat"/"Mara". Chart components receive `person1Name`/`person2Name` as props. DEFAULT_CONFIG defaults to 'Mat'/'Mara' for backwards compatibility.

### Key Financial Functions
- `getPersonalSplits()` — Computes exact per-paycheck splits for Mat/Mara personal accounts
- `calculateDisposableIncome(person)` — Returns disposableData object for mat/mara
- `calculateBudgetHealth()` — Returns projected EOM LIVE balance, surplus/deficit, health score
- `calculateHealth()` — Master function: computes score (0-100), alerts[], positives[], scoreBreakdown
- `generateBillPaymentCalculation()` — Formatted calc string: Balance → Deposits → Projected → Payment → Remaining → Funds
- `generateDisposableCalculation()` — Same order for safe-to-spend calculations

---

## THE FINANCIAL SYSTEM — CORE DOMAIN KNOWLEDGE

This section describes exactly how Mat and Mara's money flows. Every feature in this app must reflect these rules accurately. If any feature contradicts these rules, the feature is wrong.

### Income
- **Mat's net biweekly pay:** $2,018.55
- **Mara's net biweekly pay:** $1,302.06
- Paychecks land on **opposite weeks** — one paycheck arrives every week
- Combined monthly take-home (approx): ~$6,641.22

### The 5 Accounts (Checking + Savings)
Money flows from each paycheck in this exact order:

| Step | Account | Mat's Paycheck | Mara's Paycheck | Purpose |
|------|---------|---------------|-----------------|---------|
| 1 | **GIVE** | 20% ($403.71) | 20% ($260.41) | Tithing (50%) + Generosity (50%) |
| 2 | **SAVE** | 20% ($403.71) | 20% ($260.41) | Savings, future investments |
| 3 | **LIVE** | $984.00 | $656.00 | Shared household expenses |
| 4 | **MAT** | $113.57 | $62.62 | Mat's personal spending |
| 5 | **MARA** | $113.57 | $62.62 | Mara's personal spending |

- LIVE budget per 4-week cycle: **$3,280**
- The "remainder" after Give + Save + Live gets split 50/50 into Mat and Mara accounts

### The 3 Credit Cards
| Card | Used For | Payment Due | Paid From |
|------|----------|-------------|-----------|
| **Blue Cash Preferred (Amex)** | All LIVE expenses (groceries, gas, gym, dates, power) | 8th of each month | LIVE account |
| **Gold Delta (Amex)** | Mat's personal expenses | 15th of each month | MAT account |
| **Discover** | Mara's personal expenses | 2nd of each month | MARA account |

### LIVE Account Monthly Expenses
| Line Item | Amount | Notes |
|-----------|--------|-------|
| Rent | $2,135/month | Paid via Zelle, last day of month |
| Groceries | Variable | On Blue Amex |
| Gas | Variable | On Blue Amex |
| Insurance | $28/month | On Blue Amex |
| Gym | $100/month | On Blue Amex |
| Date nights | $200/month | On Blue Amex |
| Power bill | $70–$225/month | Fluctuates heavily (poor insulation) |

- LIVE account starts each month with ~$150 safety buffer (configurable in Settings as `cushion`)
- Rent is paid directly from LIVE checking (Zelle), NOT on the credit card
- All other LIVE expenses go on the Blue Cash Preferred Amex

**Note:** Most financial values (pay amounts, LIVE contributions, monthly bills, cushion) are configurable in the Settings tab and stored in Supabase `app_config` table.

### End-of-Month Kickback
- Any surplus remaining in LIVE at month-end gets split 50/50 into Mat and Mara accounts
- Example: $200 surplus → $100 to Mat, $100 to Mara
- This is a reward/incentive system for staying under budget

### GIVE Account Breakdown
- 50% Tithing (currently accumulating — not tithing to a church yet)
- 50% Generosity: $300/month to friends on missions + gifts (weddings, Christmas, etc.)

### SAVE Account & Investment Vehicles
- Currently depositing into a savings account, not yet distributing to investments
- Existing accounts (not yet funded from SAVE): Long-term investment, Short-term investment, both have Roth IRAs, Mat has 401(k), Mara does not, plus a High Yield Savings Account
- Future goal: Build a consistent "money filtration system" from SAVE into these vehicles

---

## FEATURE GOALS & ROADMAP STATUS

See **PLAN.md** for the full 8-phase MVP roadmap with detailed deliverables and Claude Code prompts.

### Implemented (Web)
- **Health Score (1–100)** — 4 categories, donut chart, suggestions carousel, alerts, positives
- **Bill Timeline** — Calendar view with bill markers, payday indicators, color-coded
- **Dashboard** — Health score, safe-to-spend, budget health projections
- **Accounts** — Account list with chart drill-down
- **Plaid Integration** — Link flow (consent gate, no OTP), account mapping with auto-sync, balance sync (production)
- **Transaction Sync** — Cursor-based incremental sync from Plaid, 4-hour throttle (Phase 1 complete)
- **Transaction Read API** — Paginated, filterable endpoint for stored transactions (Phase 1 complete)
- **Onboarding Flow (Phase 2, in progress)** — 10-step wizard: welcome slides → privacy → names → Plaid connect → account mapping → sync → done. Stored in `Onboarding.jsx`. Detects first-time users via `onboardingComplete === false && connectedAccounts.length === 0`.
- **Name Parameterization** — All "Mat"/"Mara" UI strings replaced with `config.person1Name`/`config.person2Name` from `app_config`

### Phase 2: Transaction Display + Onboarding + Manual Import (Next)
- Transaction list view with filters
- First-time user onboarding flow — Phase A (basic) complete, Phase B (smart detection, tap-to-match mapping) pending
- Manual account entry option (for users not ready to connect via Plaid)

### Phase 3: Shared Code Extraction
- Extract financial logic from App.jsx → `/shared/` folder
- Add Vitest tests for financial calculations

### Phase 4: Analytics, Give/Save/Live & Recurring Detection
- LIVE spending breakdown by category (actual vs. budgeted)
- Give/Save/Live allocation tracking
- Recurring transaction detection via Plaid (`/transactions/recurring/get`)

### Phase 5: UI/UX Design System & Branding
- Finalize typography (heading + body font pairing), color palette (light + dark), component library in Figma
- Logo, app icon, icon suite, animation specs (subtle polish: transitions, count-ups, skeletons)
- Implement design tokens in code, install Motion (web animations), remove theme editor from Settings
- Chart visual refresh, skeleton loaders replacing spinners
- Branding guide document (single source of truth for both web and mobile)

### Phase 6–7: Expo iPhone App + Onboarding
- Native iOS app via Expo/React Native
- Same backend, shared financial logic from `/shared/`
- Mobile onboarding flow (swipeable cards, native Plaid Link SDK)
- Swipe-based transaction refinement (re-categorize, split, flag)
- Moti animations matching web Motion animations

### Phase 8: Email Notifications
- Weekly digest, paycheck alerts, bill reminders, overspending alerts
- Notification preferences (per-user toggles)
- Scheduled jobs via cron

### Phase 9: TestFlight & App Store
- Friends & family launch (5–20 users)

### Deferred to v2
- Push notifications, analytics tooling (PostHog/Sentry), two-user households, Android, billing

---

## KNOWN ISSUES & GOTCHAS

1. **500 error on `/api/create_link_token`** — This has happened multiple times. Almost always caused by:
   - Server not running (need `npm run server`)
   - Server started before .env was updated (restart server)
   - .env file not loading (check the path resolution in server/index.js)
   - Check server console for "NOT SET" in credential debug output

2. **Plaid Link loads multiple times warning** — The `link-initialize.js` script can be embedded more than once. Not a breaking issue but appears in console.

3. **npm rollup error on Windows** — If you see `Cannot find module @rollup/rollup-win32-x64-msvc`, fix with:
   ```bash
   rm -rf node_modules package-lock.json && npm install
   ```

4. **Plaid is now in production mode** — If you need to switch environments, update both `PLAID_ENV` and `PLAID_SECRET` in .env, then restart server.

5. **App.jsx is large (~5800 lines)** — Use Grep to find specific functions/sections rather than reading the whole file. The "Key Sections" table above gives approximate line ranges. After Phase 3, financial logic will move to `/shared/`.

6. **Vite port** — `vite.config.js` has no port set, so Vite defaults to 5173.

---

## SUPABASE TABLES

### `plaid_items`
Stores Plaid access tokens for connected bank/card institutions.
- `item_id` (TEXT, unique)
- `access_token` (TEXT)
- `institution_name` (TEXT)
- `user_id` (UUID, references auth.users) — added by add-user-auth.sql
- `last_synced` (TIMESTAMPTZ)

### `account_mappings`
Maps each Plaid account to an app bucket. Supports old format (app_account_type) and new flexible format (mapping_mode + bucket/card_id).
- `plaid_account_id` (TEXT, unique)
- `plaid_account_name` (TEXT)
- `app_account_type` (TEXT) — legacy: one of: give, save, live, mat, mara, blue_total, gold_total, discover_total
- `is_credit_card` (BOOLEAN)
- `is_statement_balance` (BOOLEAN)
- `mapping_mode` (TEXT) — new: one of: `direct`, `primary`, `credit_card`
- `bucket` (TEXT) — new: for direct/primary modes: give, save, live, person1, person2
- `card_id` (TEXT) — new: for credit_card mode: references credit_cards.card_id (e.g. 'blue', 'gold', 'discover')
- `paid_from_bucket` (TEXT) — new: for credit_card mode: which bucket pays this card (live, person1, person2)

### `credit_cards`
Stores credit card configuration (metadata, due dates, which bucket pays each card).
- `card_id` (TEXT) — short identifier (e.g. 'blue', 'gold', 'discover', or any custom string)
- `label` (TEXT) — display name (e.g. 'Blue Cash Preferred')
- `due_day` (INTEGER) — day of month the payment is due (1–31)
- `statement_close_day` (INTEGER) — day of month the statement closes (1–31)
- `paid_from_bucket` (TEXT) — which bucket pays this card (live, person1, person2)
- `plaid_account_id` (TEXT) — the Plaid account ID for this card
- **Unique:** `(user_id, card_id)`

### `balance_snapshots`
Point-in-time balance snapshots for all accounts. Up to 30 fetched, ordered by `created_at DESC`.
- `give`, `save`, `live`, `mat`, `mara` (NUMERIC) — legacy flat checking account balances
- `blue_total`, `blue_statement` (NUMERIC) — legacy Blue Amex balances
- `gold_total`, `gold_statement` (NUMERIC) — legacy Gold Amex balances
- `discover_total`, `discover_statement` (NUMERIC) — legacy Discover balances
- `buckets` (JSONB) — new flexible checking balances: `{ give, save, live, person1, person2, ... }`
- `cards` (JSONB) — new flexible credit card balances: `{ blue: { total, statement }, gold: { ... }, ... }`
- `created_at` (TIMESTAMPTZ)
- Note: server dual-writes both old flat columns AND new JSONB columns during transition

### `app_config`
Stores all configurable financial values (pay amounts, splits, bills, cushion, due dates) and onboarding state.
- `mat_pay_amount`, `mara_pay_amount` (NUMERIC)
- `split_give`, `split_save` (NUMERIC) — percentage as decimal (0.2 = 20%)
- `mat_live`, `mara_live` (NUMERIC) — LIVE contributions
- `cushion` (NUMERIC) — safety buffer amount
- Monthly bills: `rent`, `groceries`, `gas`, `date_nights`, `power`, `gym`, `insurance`
- Due dates: `blue_due`, `gold_due`, `discover_due`
- `onboarding_complete` (BOOLEAN, default false) — prevents re-showing onboarding
- `person_1_name` (TEXT, default 'Person 1') — parameterized user name (replaces hardcoded "Mat")
- `person_2_name` (TEXT, default 'Person 2') — parameterized user name (replaces hardcoded "Mara")
- `is_joint_budget` (BOOLEAN, default false) — whether this is a two-person budget
- `created_at` (TIMESTAMPTZ)

### `user_consents`
Tracks user consent for privacy policy, Plaid data access, and terms of service.
- `id` (UUID, primary key)
- `user_id` (UUID, references auth.users)
- `consent_type` (TEXT) — 'privacy_policy', 'plaid_data_access', 'terms_of_service'
- `policy_version` (TEXT) — '1.0', '1.1', etc.
- `granted_at` (TIMESTAMPTZ)
- `revoked_at` (TIMESTAMPTZ, nullable)

### `transactions`
Stores individual bank/card transactions from Plaid.
- `plaid_transaction_id` (TEXT) — Plaid's unique ID (deduplication key)
- `plaid_account_id` (TEXT) — which Plaid account it came from
- `app_account_type` (TEXT) — denormalized from account_mappings (give, save, live, mat, mara, blue_total, etc.)
- `amount` (NUMERIC) — positive = money out, negative = refund/income
- `date` (DATE) — transaction date
- `name`, `merchant_name` (TEXT) — raw and cleaned merchant names
- `category` (TEXT) — Plaid legacy category (JSON string)
- `personal_finance_category` (TEXT) — Plaid detailed category (JSON string)
- `pending` (BOOLEAN) — true while bank is still processing
- **Unique:** `(user_id, plaid_transaction_id)`

### `sync_cursors`
Tracks the Plaid sync cursor for incremental transaction fetching per item.
- `item_id` (TEXT) — which Plaid item (bank connection) this cursor is for
- `cursor` (TEXT) — cursor string from Plaid's /transactions/sync response
- **Unique:** `(user_id, item_id)`

### `credit_cards`
User-defined credit cards with due dates and which bucket pays them.
- `card_id` (TEXT) — stable identifier (e.g., 'blue', 'gold', or auto-generated)
- `label` (TEXT) — user-visible name (e.g., "Chase Sapphire")
- `due_day` (INT) — day of month payment is due
- `statement_close_day` (INT, nullable)
- `paid_from_bucket` (TEXT) — 'live', 'person1', or 'person2'
- `plaid_account_id` (TEXT, nullable) — links to Plaid if connected
- **Unique:** `(user_id, card_id)`

### Flexible Account System (balance_snapshots JSONB)
- `buckets` (JSONB) — `{ "give": 500, "save": 1200, "live": 3000, "person1": 450, "person2": 380 }`
- `cards` (JSONB) — `{ "blue": { "total": 1500, "statement": 800 }, "gold": { ... } }`
- Old flat columns (give, save, live, mat, mara, blue_total, etc.) preserved for backward compat

### Account Mapping Modes (account_mappings)
- `mapping_mode` TEXT: `'direct'` | `'primary'` | `'credit_card'`
- `bucket` TEXT: for direct mode — which bucket (give/save/live/person1/person2)
- `paid_from_bucket` TEXT: for credit_card mode
- `card_id` TEXT: for credit_card mode — links to credit_cards table

### App Bucket Values for `app_account_type` (legacy):
- `give` — Give checking account
- `save` — Save checking account
- `live` — Live checking account
- `mat` / `person1` — Person 1's personal checking
- `mara` / `person2` — Person 2's personal checking
- `blue_total` / `blue` — Blue Cash Preferred Amex balance
- `gold_total` / `gold` — Gold Delta Amex balance
- `discover_total` / `discover` — Discover card balance

---

## SERVER SECURITY (server/index.js)

- **helmet** — Sets HTTP security headers (HSTS, X-Content-Type-Options, X-Frame-Options, CSP, etc.)
- **CORS whitelist** — Only allows requests from `https://family-finance-rouge.vercel.app` and `localhost`. Extra origins via `ALLOWED_ORIGINS` env var.
- **Rate limiting** — General: 100 req/15min. Sensitive endpoints: 10 req/15min (`/api/create_link_token`, `/api/exchange_public_token`, `/api/account`).
- **JWT auth** — `requireAuth` middleware on all `/api` routes verifies Supabase JWT tokens.
- **Account deletion** — `DELETE /api/account` revokes all Plaid tokens, deletes all user data (transactions, sync_cursors, account_mappings, balance_snapshots, app_config, user_consents, plaid_items, credit_cards), deletes auth account.

## ALL ENDPOINTS (server/index.js)

### Plaid Connection
- `POST /api/create_link_token` (strict limit) — Creates Plaid Link token for bank connection flow
- `POST /api/exchange_public_token` (strict limit) — Exchanges public token for permanent access token

### Balances & Accounts
- `GET /api/balances` — Fetch current balances for all connected accounts
- `GET /api/accounts/list` — List all Plaid accounts with details
- `GET /api/accounts/with-mappings` — Get accounts with current app bucket mappings
- `POST /api/sync_balances` — Sync balance snapshot to Supabase (1-hour throttle, `?force=true` bypasses)
- `DELETE /api/items/:item_id` — Delete a Plaid connection (revokes token first)

### Account Mapping
- `GET /api/mappings` — Fetch all account mappings
- `POST /api/mappings` — Save account mappings (validates app_account_type)

### Transaction Sync & Read
- `POST /api/sync_transactions` — Cursor-based incremental sync from Plaid (4-hour throttle, `?force=true` bypasses)
  - First call: fetches ~2 years of history; subsequent: only new/modified/removed
  - Returns: `{ success, added, modified, removed }` or `{ skipped, next_sync_at }`
  - Auto-triggered after mapping save via `handleMappingSaved()` in App.jsx
- `GET /api/transactions` — Read transactions with optional filtering and pagination
  - Query params: `account_type`, `start_date` (YYYY-MM-DD), `end_date`, `limit` (default 50, max 200), `offset`
  - Returns: `{ transactions, total, limit, offset }`
  - Ordered by date descending, secondary sort on `created_at`
  - RLS scopes to authenticated user automatically

### Credit Cards
- `GET /api/credit-cards` — Returns all credit_cards rows for user, ordered by due_day
  - Response: `{ credit_cards: [{ card_id, label, due_day, statement_close_day, paid_from_bucket, plaid_account_id }] }`
- `POST /api/credit-cards` — Create or update a credit card config (upserts on user_id + card_id)
  - Request: `{ card_id, label?, due_day?, statement_close_day?, paid_from_bucket?, plaid_account_id? }`
  - Response: `{ success: true, credit_card: { ... } }`

### Credit Cards
- `GET /api/credit-cards` — List all credit cards for authenticated user
- `POST /api/credit-cards` — Create/update credit card config (upserts on user_id + card_id)

### Consent & Account Management
- `GET /api/consent?type=<type>` — Check if user has active consent
- `POST /api/consent` — Record consent (privacy_policy, plaid_data_access, terms_of_service)
- `DELETE /api/account` (strict limit) — Full account deletion with Plaid revocation

### Transaction Analysis
- `POST /api/analyze-transactions` — Analyzes stored transactions to detect income streams and recurring bills
  - No request body needed (uses authenticated user's transactions from past 2 years)
  - Response: `{ income: [{ id, label, amount, frequency, anchorDate, confidence, occurrences }], bills: [{ id, name, amount, dueDay, isVariable, confidence, mappedBillKey, occurrences }] }`
  - Income: clusters deposits (negative Plaid amounts) by ±5% amount tolerance, returns top 2 streams
  - Bills: groups outgoing charges by merchant name, keeps monthly-ish (20–40 day intervals), deduplicates by `mappedBillKey`
  - Called during onboarding Step 11 so the user can confirm what was auto-detected

### Test Mode
- `POST /api/test-reset` — Wipes all 8 user data tables without deleting auth account (test mode only, localhost only)

## PLAID PRICING (Production Account)

| Product | Rate | Notes |
|---------|------|-------|
| Balance | $0.10 per call | Used by `/api/balances`, `/api/sync_balances`, `/api/accounts/*` |
| Transactions | $0.30 per account/month | Covers unlimited `/api/sync_transactions` calls |
| Recurring Transactions | $0.15 per account/month | Planned for Phase 4 (`/api/transactions/recurring`) |
| Transactions Refresh | $0.12 per call | Not yet used |

- **Current accounts:** 8 total (5 checking + 3 credit cards) → ~$2.40/month for Transactions
- **Cost controls:** Balance sync has 1-hour throttle, transaction sync has 4-hour throttle
- **Monitor usage:** Plaid Dashboard → Activity tab

## PUBLIC ROUTES (no login required)

- `/privacy` — Renders the full privacy policy. Checked via `window.location.pathname` before the auth gate in App.jsx. Required by Plaid for compliance.

## TEST MODE (Local Development)

Test mode provides free Plaid sandbox calls, skips email OTP, and adds a one-click data reset.

**How to activate:** Visit `http://localhost:5173/?testmode=true`
- Only works on `localhost` — the `?testmode` param is ignored on production (Vercel)
- Yellow "TEST MODE — Sandbox Data Only" banner appears at top of screen
- Plaid Link shows sandbox institutions (e.g. "First Platypus Bank") — credentials: `user_good` / `pass_good`
- Signup skips email OTP verification (test account must have email pre-confirmed in Supabase dashboard)
- "Reset Test Data" button in Settings wipes all 7 tables without deleting auth account

**Architecture:**
- `isTestMode` constant at module scope in App.jsx — reads `?testmode` from URL + checks `localhost`
- `authFetch` sends `X-Test-Mode: true` header on every API call when active
- Server middleware `resolveTestMode` checks header + localhost origin → swaps `req.plaidClient` to sandbox client
- All Plaid API calls use `req.plaidClient` (not the global `plaidClient`) so the correct client is used per request
- `POST /api/test-reset` is guarded by `req.isTestMode` — returns 403 if not in test mode

**Setup (one-time):**
1. Add `PLAID_SANDBOX_SECRET=<value>` to `.env` (get from Plaid Dashboard → Keys → Sandbox)
2. Create test user in Supabase Dashboard → Authentication → Users (manually confirm email)
3. Restart Express server

## WHEN DEBUGGING
1. Always check which branch you're on first (`git branch`)
2. Check if both servers are running (Vite on 5173, Express on 3001)
3. Check server console output for credential loading status
4. Check browser console (F12) for network errors — CORS errors may indicate the origin isn't whitelisted
5. If .env was changed, restart the Express server
6. Use `npx vite build` to check for compile errors without running the app
