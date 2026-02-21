# Flip — Family Finance Dashboard

## Project Overview
Flip is a personal finance web app for a married couple (Mat & Mara) who follow a "Give First, Save Second, Live Last" budgeting system. The app connects to real bank accounts via Plaid and provides a real-time health score, budget tracking, bill timeline, and analytics across 5 checking accounts and 3 credit cards.

This is Mat's personal project. He is learning web development — **always explain what changes are being made and why**. Prioritize teaching over speed.

## Tech Stack
- **Frontend:** React 18 + Vite (runs on port 5176)
- **Backend:** Express server in `server/` directory (runs on port 3001)
- **Database:** Supabase (hosted Postgres)
- **Bank Integration:** Plaid API (sandbox mode currently, production access approved)
- **Styling:** Inline styles via theme system (no CSS framework)
- **Language:** JavaScript (JSX), not TypeScript
- **Charts:** Recharts (ComposedChart, Line, Area, XAxis, YAxis, etc.)

## Key Commands
- `npm run dev` — Start Vite frontend (port 5176)
- `npm run server` — Start Express backend (port 3001)
- `npx vite build` — Production build (verify no errors)
- IMPORTANT: **Both must be running simultaneously** for Plaid features to work
- IMPORTANT: **Server MUST be restarted after any .env changes** — it reads .env on startup only

## Project Structure
```
/
├── CLAUDE.md              ← You are here
├── .env                   ← Plaid + Supabase credentials (never commit)
├── package.json
├── vite.config.js
├── create-plaid-table.sql ← Supabase schema for Plaid tables
├── MATH_AUDIT.md          ← Calculation audit results
├── STATUS.md              ← Development status tracker
├── server/
│   └── index.js           ← Express backend (all Plaid API endpoints)
├── src/
│   ├── App.jsx            ← Main app (~4850 lines): all views, state, calculations
│   ├── main.jsx           ← React entry point
│   └── components/
│       ├── PlaidLink.jsx        ← Bank connection flow via Plaid Link
│       ├── AccountMappingUI.jsx ← Maps Plaid accounts → app buckets
│       ├── BalanceChart.jsx     ← Single-account balance history (Area chart)
│       ├── CreditCardChart.jsx  ← CC total/statement vs account balance (Area + Lines + overage shading)
│       ├── NetPositionChart.jsx ← Net worth over time (checking minus CC balances)
│       ├── SafeToSpendChart.jsx ← Personal account projection to next due date (monotone + daily interpolation)
│       └── BudgetHealthChart.jsx← LIVE account projection to end of month (daily burn rate)
└── .claude/
    ├── agents/            ← Subagent definitions (frontend, backend, supabase, lead)
    └── commands/          ← Custom slash commands
```

## Environment Variables (.env in project root)
```
VITE_SUPABASE_URL=<supabase-url>
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
PLAID_CLIENT_ID=<plaid-client-id>
PLAID_SECRET=<plaid-secret>
PLAID_ENV=sandbox
PORT=3001
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

## APP.JSX ARCHITECTURE (~4850 lines)

### Key Sections (approximate line ranges)
| Section | Lines | Purpose |
|---------|-------|---------|
| Theme system + styles | 1–1100 | Theme tokens, `createStyles()`, all shared style objects |
| State declarations | 1600–1670 | `useState` hooks for all app state |
| Financial functions | 1700–2900 | `getPersonalSplits()`, `getUpcomingPaydays()`, `getUpcomingBills()`, `calculatePaymentDate()`, `calculateDisposableIncome()`, `generateDisposableCalculation()`, `generateBillPaymentCalculation()`, `calculateBudgetHealth()`, `calculateHealth()`, `generateScoreSuggestions()` |
| Data fetching | 2950–3060 | `fetchConfig()`, `fetchSnapshots()`, Supabase queries |
| Chart data (useMemo) | 3060–3150 | `chartData` — transforms snapshots into chart-ready arrays |
| Dashboard view | 3500–4150 | Health score carousel, donut breakdown, suggestions, alerts/positives, budget health card, TBB cards |
| Accounts view | 4150–4250 | Account list + chart drill-down |
| Calendar view | 4250–4440 | Monthly calendar with bill markers |
| Popup system | 4440–4800 | `activePopup` state drives slide-in panels for: `safeToSpend`, `positiveDetail`, `budgetHealth`, `tbbDetail`, `alertDetail` |
| Bottom nav | 4800–4850 | Home → Accounts → Calendar |

### Key Patterns

**Popup system:** `setActivePopup({ type: 'safeToSpend', person, data, calculation })` → renders in the popup section at bottom of JSX. Each type has its own render block.

**disposableData pattern:** Objects passed to `SafeToSpendChart` with shape:
```js
{ accountBalance, nextPaymentAmount, nextDueDate, cushion, paydaysBeforeDue, depositAmounts }
```
`depositAmounts` is an array of `{ date, type, amount }` with exact per-payday splits.

**Carousel pattern:** Horizontal swipe containers using `transform: translateX(-${slide * 100}%)` with touch handlers and dot indicators.

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

## FEATURE GOALS (What we're building toward)

### Health Score (1–100) — IMPLEMENTED
- 4 scoring categories: Bills on Time (70pts), Safe to Spend (10pts), Budget Health (10pts), Total Balance Bonus (10pts)
- Interactive donut chart with hover/tap segment details
- Score suggestions carousel with improvement recommendations
- Alerts system for low budget health, negative safe-to-spend, bill shortfalls
- Positives system ("Looking Good") for on-track bills with projection charts

### Bill Timeline — IMPLEMENTED (Calendar tab)
- Monthly calendar view with bill markers and payday indicators
- Color-coded by financial health

### Analytics
- Line item breakdown: which LIVE categories (groceries, gas, dates, etc.) went over/under
- Where GIVE dollars went
- Where SAVE dollars went
- Where MAT/MARA personal dollars went

### Weekly Report (Sundays at 11am)
- Past week summary
- Where we stand in the current month
- Projected end-of-month status

### Monthly Report
- Full month analysis
- Kickback calculation
- Adjustment recommendations

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

4. **Plaid sandbox vs production** — Currently using sandbox. User has production access. When switching, update both `PLAID_ENV` and `PLAID_SECRET` in .env, then restart server.

5. **App.jsx is large (~4850 lines)** — Use Grep to find specific functions/sections rather than reading the whole file. The "Key Sections" table above gives approximate line ranges.

6. **Vite port** — `vite.config.js` has no port set, so Vite defaults to 5173. CLAUDE.md says 5176 but either may be in use depending on port availability.

---

## SUPABASE TABLES

### `plaid_items`
Stores Plaid access tokens for connected bank/card institutions.
- `item_id` (TEXT, unique)
- `access_token` (TEXT)
- `institution_name` (TEXT)
- `last_synced` (TIMESTAMPTZ)

### `account_mappings`
Maps each Plaid account to an app bucket.
- `plaid_account_id` (TEXT, unique)
- `plaid_account_name` (TEXT)
- `app_account_type` (TEXT) — one of: give, save, live, mat, mara, blue_total, gold_total, discover_total
- `is_credit_card` (BOOLEAN)
- `is_statement_balance` (BOOLEAN)

### `balance_snapshots`
Point-in-time balance snapshots for all accounts. Up to 30 fetched, ordered by `created_at DESC`.
- `give`, `save`, `live`, `mat`, `mara` (NUMERIC) — checking account balances
- `blue_total`, `blue_statement` (NUMERIC) — Blue Amex balances
- `gold_total`, `gold_statement` (NUMERIC) — Gold Amex balances
- `discover_total`, `discover_statement` (NUMERIC) — Discover balances
- `created_at` (TIMESTAMPTZ)

### `app_config`
Stores all configurable financial values (pay amounts, splits, bills, cushion, due dates).
- `mat_pay_amount`, `mara_pay_amount` (NUMERIC)
- `split_give`, `split_save` (NUMERIC) — percentage as decimal (0.2 = 20%)
- `mat_live`, `mara_live` (NUMERIC) — LIVE contributions
- `cushion` (NUMERIC) — safety buffer amount
- Monthly bills: `rent`, `groceries`, `gas`, `date_nights`, `power`, `gym`, `insurance`
- Due dates: `blue_due`, `gold_due`, `discover_due`
- `created_at` (TIMESTAMPTZ)

### App Bucket Values for `app_account_type`:
- `give` — Give checking account
- `save` — Save checking account
- `live` — Live checking account
- `mat` — Mat's personal checking
- `mara` — Mara's personal checking
- `blue_total` — Blue Cash Preferred Amex balance
- `gold_total` — Gold Delta Amex balance
- `discover_total` — Discover card balance

---

## WHEN DEBUGGING
1. Always check which branch you're on first (`git branch`)
2. Check if both servers are running (Vite on 5176, Express on 3001)
3. Check server console output for credential loading status
4. Check browser console (F12) for network errors
5. If .env was changed, restart the Express server
6. Use `npx vite build` to check for compile errors without running the app
