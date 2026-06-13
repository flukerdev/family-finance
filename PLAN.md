# Flip Budget — MVP Roadmap v2

**Updated: March 10, 2026**
**Pace: 5–10 hours/week | Solo developer | ~9 phases over ~8 months**

---

## What's Already Done (and It's Real)

This is not a prototype. The current Flip app is a working, deployed personal finance dashboard. Here is what exists today:

**Tech stack:**
- React 18 + Vite 5 frontend (SPA, client-side routing via `currentView` state)
- Express 5 backend in `server/index.js`
- Supabase (hosted Postgres) with 5 tables, all with per-user RLS
- Plaid API — **production access is LIVE**
- Email OTP auth via Supabase Auth
- Deployed on flipbudget.app with auto-deploy from GitHub main

**Working features:**
- Full theme system (Ink Wash dark/light) with `createStyles()` pattern
- Health score engine (0–100, 4 weighted categories)
- Safe-to-spend projections per person with payday-aware deposit scheduling
- Budget health projection (end-of-month LIVE balance with daily burn rate)
- Bill timeline with biweekly alternating payday logic
- 7 chart components (Balance, CreditCard, NetPosition, SafeToSpend, BudgetHealth, PlaidLink, AccountMappingUI)
- All financial values configurable via Settings UI → persisted to Supabase `app_config`
- Plaid Link flow, account mapping UI, balance snapshot sync (1-hour throttle)
- Transaction sync from Plaid (cursor-based, 4-hour throttle)
- Transaction read endpoint with filtering and pagination
- Account deletion with Plaid token revocation and full data cleanup
- Privacy policy at `/privacy` (public route, no login required)
- Consent tracking for Plaid compliance
- Security hardening: helmet, CORS whitelist, rate limiting, JWT auth middleware
- 3 views: Dashboard, Accounts, Calendar

**What does NOT exist yet:**
- Transaction categorization or display UI
- Onboarding flow for first-time users
- Manual account entry (non-Plaid)
- Recurring transaction detection
- Analytics or reporting
- Give/Save/Live breakdown page
- Transactions page
- Email notifications
- Expo/React Native app
- Any automated tests or test framework
- Plaid webhook handling
- Shared code extraction (all financial logic lives inline in App.jsx)

---

## Prerequisites (Start These Now)

These are not coding tasks. They take calendar time and should be started before Phase 1.

1. **Apple Developer Account ($99/year)** — Enroll at developer.apple.com. Approval can take 24–48 hours. Required before any TestFlight builds.

2. **Mac development environment** — Clone the repo on your Mac. Install Node.js, npm, Xcode (from App Store, ~12GB download), and Expo CLI. Windows stays primary for backend/web work. Mac becomes primary for Phases 5–8.

3. **Expo account** — Create a free account at expo.dev. Required for EAS Build (Expo's cloud build service) for TestFlight builds.

---

## Deferred to v2

These are good ideas that don't belong in a 5–20 user friends-and-family launch:

- **PostHog / analytics** — Console logs and direct feedback are sufficient for 5–20 users
- **Sentry / crash reporting** — Ask testers to screenshot errors
- **Sync cost ledger** — Review your Plaid dashboard manually at this scale
- **Admin dashboards** — Internal tooling for a product team you don't have
- **Push notifications** — Requires Expo push token infrastructure
- **Two-user household support** — Schema is already per-user; multi-user households are v2
- **Android** — Ship iPhone first, validate, then consider
- **Billing / subscriptions** — Friends and family launch = free
- **Referral program** — Premature for 5–20 users
- **20-account stress tests** — You have 8 accounts. Test with 8 accounts.

---

## Phase 1: Transaction Sync & Storage (Backend) ✅ COMPLETE

**Effort: 15–20 hours | Calendar: ~3 weeks | Machine: Windows**

### What happens and why

Right now Flip only stores balance snapshots — a single number per account taken at a point in time. To build analytics, categorization, or any meaningful financial intelligence, you need individual transactions.

Plaid already gives you access to transactions (your link token requests the `transactions` product), but the app never fetches or stores them. This phase adds a `transactions` table to Supabase and new Express endpoints to sync transactions from Plaid.

**Why backend first?** Both the web app and the future Expo app will consume the same API. Getting the data pipeline right before building UI prevents rework.

**How Plaid transaction sync works:** The Plaid Transactions API uses a cursor-based sync model. You call `/transactions/sync` with a cursor (empty string for the first call), and it returns added/modified/removed transactions plus a new cursor. You store the cursor and use it for incremental syncs. This handles deduplication automatically.

### Deliverables

1. **New Supabase table: `transactions`**
   - `id` (UUID, primary key)
   - `user_id` (UUID, references auth.users, with RLS)
   - `plaid_transaction_id` (TEXT, unique) — Plaid's transaction ID for deduplication
   - `plaid_account_id` (TEXT) — which Plaid account this came from
   - `app_account_type` (TEXT) — mapped bucket (give, save, live, mat, mara, blue_total, etc.)
   - `amount` (NUMERIC) — positive = money out, negative = money in (Plaid convention)
   - `date` (DATE)
   - `name` (TEXT) — merchant/description from Plaid
   - `merchant_name` (TEXT, nullable) — cleaned merchant name
   - `category` (TEXT[], nullable) — Plaid's category array
   - `personal_finance_category` (JSONB, nullable) — Plaid's detailed category
   - `pending` (BOOLEAN)
   - `created_at` (TIMESTAMPTZ)

2. **New Supabase table: `plaid_sync_cursors`**
   - `id` (UUID, primary key)
   - `user_id` (UUID, references auth.users, with RLS)
   - `item_id` (TEXT, references plaid_items.item_id)
   - `cursor` (TEXT) — Plaid sync cursor for incremental fetches
   - `last_synced` (TIMESTAMPTZ)

3. **New endpoint: `POST /api/sync_transactions`**
   - Fetches all Plaid items for the user
   - For each item, calls `/transactions/sync` with stored cursor (or empty string for first sync)
   - Processes added, modified, and removed transactions
   - Maps each transaction's `account_id` to `app_account_type` using existing `account_mappings`
   - Upserts into Supabase (insert new, update modified, delete removed)
   - Stores the new cursor for next incremental sync
   - Rate limited: 1 sync per 4 hours per user

4. **New endpoint: `GET /api/transactions`**
   - Returns transactions for the authenticated user
   - Query params: `account_type`, `start_date`, `end_date`, `limit` (default 50, max 200), `offset`
   - Ordered by date descending

5. **Migration file: `create-transactions-tables.sql`**

### Key files
- `create-transactions-tables.sql` (new)
- `server/index.js` — add sync and read endpoints

### Done when
- `POST /api/sync_transactions` returns real transactions from connected accounts ✅
- `GET /api/transactions` returns paginated, filterable results ✅
- Second sync uses the cursor (incremental, not full re-fetch) ✅
- 4-hour throttle prevents excessive Plaid calls ✅
- RLS prevents cross-user data access ✅

### Claude Code prompts

**Prompt 1.1 — Transaction schema**
> Design a Supabase schema for storing Plaid transactions and sync cursors. Include the SQL migration with table creation, per-user RLS policies, and indexes. The transactions table should store: plaid_transaction_id, plaid_account_id, app_account_type (mapped from account_mappings), amount, date, name, merchant_name, category, personal_finance_category, and pending status. The sync cursor table tracks the Plaid cursor per item for incremental syncs. Follow the patterns in `add-user-auth.sql` for RLS policies.

**Prompt 1.2 — Transaction sync endpoint**
> Add a `POST /api/sync_transactions` endpoint to `server/index.js` that syncs transactions from Plaid using the `/transactions/sync` cursor-based API. For each Plaid item, load the stored cursor (empty string if first sync), call Plaid's transactionsSync, process added/modified/removed transactions, map account IDs to app_account_type using account_mappings, upsert into the transactions table, and store the new cursor. Add a 4-hour throttle per user. Follow existing patterns for auth, error handling, and Supabase queries.

**Prompt 1.3 — Transaction read endpoint**
> Add a `GET /api/transactions` endpoint to `server/index.js` that returns the authenticated user's transactions. Support query params: account_type (filter by app bucket), start_date, end_date, limit (default 50, max 200), and offset. Return transactions ordered by date descending.

---

## Phase 2: Transaction Display + Onboarding + Manual Import (Web UI)

**Effort: 18–23 hours | Calendar: ~3 weeks | Machine: Windows**

### What happens and why

With transactions in Supabase, you show them in the web app. Build this on web first because: (1) you iterate faster on the platform you know, and (2) this validates your API design before the Expo app consumes it.

The Transactions view is a simple scrollable list with filters. No fancy swipe interactions — just a clear, readable list of where money went.

**Why onboarding now?** Right now, a first-time user logs in and sees an empty Dashboard with no guidance. The Plaid connection flow is buried in Settings. Before inviting friends and family to test, new users need a clear path: Welcome → Connect Accounts → Map Accounts → First Sync → Dashboard. This phase wraps existing components (PlaidLink, AccountMappingUI) in a guided onboarding flow, so nothing new is built from scratch — it's a better UX wrapper around what already works.

**Why manual import?** Not every tester will want to connect their bank via Plaid immediately. Offering manual balance entry during onboarding lowers the barrier to entry. Plaid-connected accounts always take priority, so manual entries are a fallback — not a parallel system.

### Deliverables

1. **Transactions view in App.jsx**
   - New `currentView === 'transactions'` section
   - Scrollable list grouped by date
   - Each row: date, merchant/name, amount (green for income, red for expense), account bucket tag
   - Filter bar: account type dropdown (All, Give, Save, Live, Mat, Mara, Blue, Gold, Discover)
   - "Sync Transactions" button → calls `POST /api/sync_transactions`
   - Loading and empty states

2. **Updated bottom nav** — Add 4th tab: Transactions

3. **Sync trigger** — Display last sync time, integrate with existing sync flow

4. **Onboarding flow (web)**
   - Detect first-time user (no plaid_items, no account_mappings for user)
   - Full-screen guided flow: Welcome → Connect Accounts → Map Accounts → First Sync → Done
   - Step indicator (1/4, 2/4, etc.) with back/forward navigation
   - Each step wraps existing components (PlaidLink, AccountMappingUI) in onboarding context
   - "Skip for now" option that goes to Dashboard with empty state
   - After completion, sets a flag (in `app_config` or localStorage) so onboarding doesn't show again
   - Reachable from Settings as "Re-run Setup" for future account additions

### Key files
- `src/App.jsx` — new view section, updated bottom nav, transaction state/fetching, onboarding flow, manual entry
- Potentially new Supabase table or column for manual accounts

### Done when
- Real transactions from your bank accounts appear in the Transactions view
- Filtering by account type works
- Sync button triggers a fresh pull from Plaid
- Loading, empty, and error states are handled
- First-time user sees onboarding flow, not empty Dashboard
- User can complete onboarding with Plaid, manual entry, or a mix
- Returning user goes straight to Dashboard
- Manual balances appear in Dashboard alongside Plaid balances
- "Re-run Setup" available in Settings
- `npx vite build` passes

### Claude Code prompts

**Prompt 2.1 — Transactions view**
> Add a Transactions view to App.jsx. Add state for transactions (`transactions`, `transactionsLoading`, `transactionsFilter`). Add a `fetchTransactions` function that calls `GET /api/transactions` with the current filter. Add a new `currentView === 'transactions'` section with: a filter bar (dropdown for account type), a scrollable list grouped by date, and a "Sync" button that calls `POST /api/sync_transactions` then refreshes. Each row shows date, merchant name, amount (green for negative/income, red for positive/expense per Plaid convention), and account bucket tag. Use the existing theme system. Add "Transactions" as a 4th tab in the bottom nav.

**Prompt 2.2 — Onboarding flow (web)**
> Detect first-time users (no plaid_items, no account_mappings for user). Show a full-screen guided onboarding: Welcome screen explaining the app and the Give/Save/Live system, Connect Accounts step (wraps PlaidLink + manual entry option), Map Accounts step (wraps AccountMappingUI), First Sync step (auto-syncs balances and transactions, shows progress), and Done screen with summary. Use a stepper UI with step indicators and back/forward navigation. Apply the existing theme system. Add an `onboarding_complete` flag (could be in app_config or localStorage) to prevent re-showing. Add "Re-run Setup" button to Settings. Include a "Skip for now" option that goes to Dashboard with an empty state prompt.

**Prompt 2.3 — Manual import option**
1> In the onboarding Connect Accounts step, let users choose "Connect via Plaid" or "Enter manually" per account type. Manual entry form collects: account name, current balance, and account type (give, save, live, mat, mara, or credit card type). Store manual accounts with an `is_manual` flag. Plaid-connected accounts always override manual entries for the same account type (use existing `plaidMappedTypes` pattern). Manual card balance entry is only available for non-Plaid accounts. Manual balances should appear in the Dashboard alongside Plaid balances. Add a manual balance editor to Settings.

---

## Phase 3: Extract Shared Financial Logic

**Effort: 10–15 hours | Calendar: ~2 weeks | Machine: Windows**

### What happens and why

App.jsx is ~5,800 lines. All financial logic (health score, safe-to-spend, budget health, personal splits, bill projections, payday scheduling) is defined inline. Before building the Expo app, you need this logic in a place both clients can import.

You'll create a `/shared` folder with plain ES module files. No monorepo tooling, no npm workspaces, no build step. Just `.js` files that export functions. Both Vite (web) and Metro (Expo) handle plain JS imports fine.

**Why not a monorepo?** Monorepo tooling (Turborepo, Nx, npm workspaces) adds configuration complexity not justified for a solo dev with two consumers. A `/shared` folder is the simplest thing that works. If you outgrow it later, the extraction is already done — you just move `/shared` into a package.

This is also the right time to add your first tests. Financial functions are pure logic (input in, output out) with no UI dependencies — easiest to test and most important to get right.

### Deliverables

1. **`/shared/financial.js`** — Core calculation functions:
   - `getPersonalSplits(config)` — per-paycheck splits
   - `calculateDisposableIncome(person, config, snapshot)` — returns disposableData
   - `calculateBudgetHealth(config, snapshot, today)` — EOM projection
   - `getUpcomingPaydays(config, today)` — payday schedule
   - `getUpcomingBills(config, today)` — bill schedule
   - `calculatePaymentDate(...)` — bill coverage check
   - Each function takes explicit parameters (no component state)

2. **`/shared/health.js`** — Health score engine:
   - `calculateHealth(config, snapshot, today)` → `{ score, alerts, positives, scoreBreakdown }`

3. **`/shared/formatting.js`** — Display helpers:
   - `generateBillPaymentCalculation(...)`, `generateDisposableCalculation(...)`
   - Currency/date formatting

4. **Update App.jsx** — Replace inline functions with imports from `/shared/`

5. **First tests: `/shared/__tests__/financial.test.js`**
   - Install Vitest (works with Vite, zero config)
   - Test `getPersonalSplits`, `getUpcomingPaydays`, `calculateBudgetHealth`
   - Add `"test": "vitest"` to package.json

### Key files
- `shared/financial.js` (new)
- `shared/health.js` (new)
- `shared/formatting.js` (new)
- `shared/__tests__/financial.test.js` (new)
- `src/App.jsx` — replace inline functions with imports
- `package.json` — add Vitest

### Done when
- App.jsx imports financial functions from `/shared/` instead of defining them inline
- App works identically to before (no behavior changes)
- `npm test` runs Vitest and all tests pass
- `npx vite build` passes
- `/shared` has no React imports, no DOM references — pure logic only

### Claude Code prompts

**Prompt 3.1 — Extract financial functions**
> Extract the following functions from App.jsx into `/shared/financial.js` as pure, parameterized functions (no component state, no React imports): `getPersonalSplits`, `getUpcomingPaydays`, `getUpcomingBills`, `calculatePaymentDate`. Each function takes a `config` object and optionally a `today` date as parameters. Read the current implementations in App.jsx and preserve the exact logic.

**Prompt 3.2 — Extract health score**
> Extract `calculateDisposableIncome`, `calculateBudgetHealth`, and `calculateHealth` from App.jsx into `/shared/health.js`. These import helpers from `./financial.js`. Each function takes explicit parameters (config, snapshot, today). Update App.jsx to import from `/shared/` and pass component state to the shared functions.

**Prompt 3.3 — Add Vitest tests**
> Install Vitest as a dev dependency and add a `"test": "vitest"` script to package.json. Create `/shared/__tests__/financial.test.js` with tests for: `getPersonalSplits` (verify splits match expected values), `getUpcomingPaydays` (verify dates for a known start), `getUpcomingBills` (verify dates and amounts). Use the actual default config values.

---

## Phase 4: Analytics, Give/Save/Live & Recurring Detection (Web)

**Effort: 20–25 hours | Calendar: ~4 weeks | Machine: Windows**

### What happens and why

With transactions stored and the financial logic extracted, you can build the two remaining web features: spending analytics and the Give/Save/Live breakdown. These turn raw transaction data into the insights that make Flip more than a balance checker.

Analytics answers "where did the money go?" — breaking down LIVE spending by category. The Give/Save/Live page shows how well you're following the system: are you actually giving 20%, saving 20%, and living on the rest?

**Why recurring detection now?** Plaid's `/transactions/recurring/get` endpoint identifies subscriptions and regular charges automatically. With transaction basics solid from Phases 1–2, this is the right time to layer on recurring detection. It directly feeds into analytics (showing which recurring charges hit each category) and bill tracking (comparing detected recurring charges against your configured bills). Cost: $0.15/account/month (~$1.20/month for 8 accounts).

Build on web first to validate data presentation before recreating in Expo.

### Deliverables

1. **LIVE spending breakdown**
   - Group transactions from blue_total (Blue Amex) by Plaid category
   - Compare actual vs. budgeted for each line item (rent, groceries, gas, gym, dates, power, insurance)
   - Bar chart or progress bars showing over/under per category
   - Monthly selector for past months

2. **Give/Save/Live summary**
   - Current month's 3-bucket split
   - Give: total deposited, percentage of income
   - Save: total deposited, percentage of income
   - Live: total spent vs. budget
   - Surplus/deficit and kickback estimate
   - Historical trend (last 3 months if data exists)

3. **Recurring transaction detection**
   - New endpoint: `GET /api/transactions/recurring` — calls Plaid's `/transactions/recurring/get`
   - Returns inflow streams (paychecks) and outflow streams (subscriptions, bills)
   - Display in a "Recurring" section: list of detected subscriptions with amount, frequency, next expected date
   - Compare detected recurring charges against configured bills (rent, gym, insurance, etc.)
   - Flag new/unknown recurring charges as potential budget items
   - Cost: $0.15/account/month additional (~$1.20/month for 8 accounts)

4. **Navigation update** — Either a 5th tab or sub-sections within Dashboard

### Key files
- `src/App.jsx` — new view sections, transaction aggregation
- `server/index.js` — new recurring transactions endpoint

### Done when
- Category-level LIVE spending breakdown for any month
- Give/Save/Live split shows actual vs. target percentages
- Data comes from real transactions
- Over/under budget categories are visually clear
- Recurring transactions endpoint returns real detected subscriptions
- Recurring section shows detected subscriptions with amounts and frequency
- Known bills matched against Plaid-detected recurring charges

### Claude Code prompts

**Prompt 4.1 — LIVE spending breakdown**
> Add a spending breakdown that groups transactions from blue_total by Plaid's personal_finance_category. Show actual vs. budgeted for each LIVE line item (using config monthly bill values). Display as a list with progress bars. Add a month selector.

**Prompt 4.2 — Give/Save/Live summary**
> Add a Give/Save/Live summary showing current month's actual income allocation vs. target split. Calculate actual Give/Save deposits and actual Live spending from transactions. Compare to config percentages. Show surplus/deficit and kickback estimate (LIVE surplus / 2 to Mat and Mara).

**Prompt 4.3 — Recurring transaction detection**
> Add a `GET /api/transactions/recurring` endpoint to `server/index.js` that calls Plaid's `/transactions/recurring/get` for each connected item. Return inflow streams (paychecks) and outflow streams (subscriptions, bills). Display in a "Recurring" section showing detected subscriptions with name, amount, frequency, and next expected date. Compare against configured bills in app_config and flag unrecognized recurring charges as potential budget items. Note: this adds $0.15/account/month to Plaid costs.

---

## Phase 5: UI/UX Design System & Branding (Design-First)

**Effort: 20–28 hours | Calendar: ~4 weeks | Machine: Windows**

### What happens and why

Every screen built so far uses inline styles and the Ink Wash theme tokens — functional but not polished. Before building the Expo app, you lock down the visual identity so that *every screen from here forward* is built against a finalized design system. This prevents the expensive mistake of building 20+ mobile screens and then redesigning them all.

This is a design phase, not a coding phase. The primary output is a **Figma design system** (free tier) with component library, finalized color palette, typography scale, and screen mockups for both web and mobile. The secondary output is **implementing** those design tokens and animations in the existing web app.

**Why before Expo?** Building mobile screens against a finalized design is 2-3x faster than building first and redesigning later. The Expo app (Phases 6–7) will reference the Figma file directly — no guessing at spacing, colors, or component styles.

**Why DIY?** Mat has a clear brand vision, a Figma brand guide already started, and a strong visual benchmark (Monarch). The free tools available in 2026 (Figma free tier, Google Fonts, open-source icon sets) make professional-quality design accessible without a contractor. The key is having a systematic process — which is what this phase provides.

**Design benchmark:** Monarch Money. Specifically: their chart design (clean, comparative), transaction swipe interactions, and overall premium feel. The goal is to match or exceed that level of polish with a distinct Flip identity.

### Brand Brief

- **Tagline:** "Flip the way you think about your finances."
- **Target audience:** Young married professionals who want intentional money management
- **Brand personality:** Premium, confident, modern, trustworthy, clean
- **Visual direction:** Minimal with purposeful detail. Every element earns its place. Calm and stable — no bouncy or playful motion. Charts are the hero — they should be cleaner and more readable than Monarch's.
- **Animation philosophy:** Subtle polish, not spectacle. Smooth transitions, number count-ups, skeleton loaders, progress bar fills. No parallax, no complex scroll animations, no hero motion design.

### Deliverables

1. **Finalized typography (font pairing)**
   - Pick heading + body fonts from these options (all free on Google Fonts):
     - **Option A:** Space Grotesk (headings) + Inter (body) — tech-forward, excellent number readability, the current brand guide recommendation
     - **Option B:** Plus Jakarta Sans (headings) + Inter (body) — geometric, warm, premium feel popular in 2026 fintech
     - **Option C:** General Sans (headings) + Inter (body) — clean, neutral, very Monarch-like
     - **Option D:** Outfit (headings) + Inter (body) — modern geometric with personality, great for financial data
   - Inter stays as body font (already proven, excellent for financial data at all sizes)
   - Define the full type scale: size, weight, line-height, letter-spacing for: display, h1, h2, h3, body, body-small, caption, label, mono (for numbers/currency)
   - Test each option with real Flip content: balance numbers, health score, chart labels, navigation

2. **Finalized color palette (light + dark mode)**
   - Start from the current brand guide palette as a base:
     - Primary Sage: `#5A9E5C`
     - Text Slate: `#4A5568`
     - Accent Steel: `#5B8DBE`
     - Background Ivory: `#F5F4F1`
   - Design a complete dark mode palette (not just inverted — intentional per-mode decisions)
   - Define all semantic tokens: primary, secondary, accent, success, danger, warning, info
   - Define account-specific colors: give, save, live, mat, mara (keep the current associations or refine)
   - Define surface hierarchy: background, card, card-elevated, overlay, border, border-subtle
   - Ensure WCAG 2.2 AA contrast ratios (4.5:1 minimum for text, 3:1 for large text/UI elements)
   - Export as design tokens JSON (Figma Variables → code-ready)

3. **Component library in Figma**
   - Core components with variants (size, state, theme):
     - Buttons (primary, secondary, ghost, danger — normal, hover, active, disabled)
     - Cards (standard, elevated, interactive)
     - Input fields (text, dropdown, toggle — normal, focus, error, disabled)
     - Navigation (bottom tab bar, header)
     - List items (transaction row, account row, bill row)
     - Charts (area, line, bar, donut — with axis labels, legends, tooltips)
     - Badges, tags, pills (account type indicators)
     - Alert banners (success, warning, danger, info)
     - Loading states (skeleton screens for each card/list type)
     - Empty states (no data illustrations or messaging)
   - All components use auto-layout and Figma Variables (design tokens)
   - Both light and dark mode variants

4. **Screen mockups (web + mobile)**
   - Web screens (desktop width):
     - Dashboard (health score, safe-to-spend cards, budget health, alerts)
     - Accounts (account list, chart drill-down)
     - Transactions (list with filters, grouped by date)
     - Calendar (monthly grid with markers)
     - Settings (simplified — light/dark toggle, connected accounts, no theme editor)
   - Mobile screens (iPhone 15 Pro, 393×852):
     - Same 5 screens adapted for mobile layout
     - Onboarding flow (4–5 swipeable cards)
     - Transaction swipe interaction (approve, categorize, flag)
   - Include responsive behavior notes (how cards stack, what collapses)

5. **Logo and icon suite**
   - App icon: 1024×1024 master (required for App Store), with variants for dark/light backgrounds
   - Favicon and web manifest icons (16, 32, 192, 512px)
   - In-app logo (header, login screen, splash screen)
   - Custom icon set OR selected open-source icon library (Lucide, Phosphor, or Heroicons — pick one, use consistently)
   - Account type icons (give, save, live, mat, mara)
   - Navigation tab icons (home, accounts, transactions, calendar, settings)

6. **Animation specification**
   - Document each animation with: trigger, duration, easing curve, and purpose
   - Key animations to specify:
     - **Page transitions:** slide or fade between views (200–300ms, ease-out)
     - **Card entrances:** staggered fade-up on dashboard load (50ms stagger, 300ms each)
     - **Number count-ups:** balance and health score animate from 0 to value on load (800ms, ease-out)
     - **Skeleton → content:** fade transition when data loads (200ms)
     - **Progress bars:** budget utilization fills from 0% (600ms, ease-out)
     - **Pull-to-refresh:** smooth spring animation on sync
     - **Toggle switches:** light/dark mode with smooth color crossfade (300ms)
     - **Chart drawing:** lines/areas animate in from left on first render (500ms, ease-in-out)
   - All durations in the 200–800ms range. Nothing decorative.

7. **Branding guide document**
   - Single-page reference: logo usage rules, color palette with hex/RGB, typography scale, icon style, spacing grid (4px base), border-radius scale, shadow/elevation levels, animation timing tokens
   - Do's and don'ts (e.g., "never use gradients on cards," "always use skeleton loaders, never spinners")
   - Tone of voice for UI copy: use "projection," "estimate," avoid financial advice language

### Implementation (code changes after design is finalized)

8. **Replace Ink Wash theme with finalized design tokens**
   - Update `themes.dark` and `themes.light` objects in App.jsx with new palette
   - Update `createStyles()` with new typography scale, spacing, border-radius, shadows
   - Add Google Fonts import for chosen heading font (Inter is already web-safe)
   - Remove the theme/color editor from Settings — replace with simple light/dark toggle

9. **Install and configure Motion (animation library)**
   - `npm install motion` (formerly Framer Motion) for web
   - Add `AnimatePresence` wrapper for page transitions
   - Implement: card entrance animations, number count-ups, skeleton loaders, progress bar fills
   - Keep animations behind `prefers-reduced-motion` media query for accessibility

10. **Replace loading spinners with skeleton screens**
    - Dashboard cards, transaction list, account list — all get shaped skeleton placeholders
    - Fade-to-content transition when data loads

11. **Chart visual refresh**
    - Update Recharts styling to match new design tokens (colors, fonts, grid lines, tooltips)
    - Add chart draw-in animations where Recharts supports them
    - Ensure charts look as clean as or cleaner than Monarch's

### Tools (all free)

| Tool | Purpose | Cost |
|------|---------|------|
| **Figma** (free tier) | Design system, components, screen mockups | Free (3 files) |
| **Google Fonts** | Heading + body fonts | Free |
| **Lucide / Phosphor / Heroicons** | Consistent icon set | Free (open-source) |
| **Realtime Colors** (realtimecolors.com) | Test color palettes on live UI mockups | Free |
| **Contrast Checker** (WebAIM) | Verify WCAG AA contrast ratios | Free |
| **Figma Tokens plugin** | Export design tokens as JSON for code | Free |
| **Canva** | Quick mockups, mood boards, logo exploration | Free tier |
| **Motion** (npm) | React web animation library | Free (open-source) |
| **Moti** (npm) | React Native animation library (Phase 6+) | Free (open-source) |
| **Lottie** | Shared animated assets (success states, loading) | Free (LottieFiles has free animations) |

### Key files
- Figma file (external — link in project README when created)
- `src/App.jsx` — theme objects, `createStyles()`, Settings view (remove theme editor)
- `branding/` (new folder) — exported design tokens JSON, logo assets, icon assets
- `package.json` — add `motion` dependency

### Done when
- Font pairing selected and tested with real Flip content
- Color palette finalized for both light and dark mode with AA contrast
- Figma component library covers all core UI elements
- Screen mockups exist for all 5 views (web + mobile)
- Logo and app icon created at all required sizes
- Animation spec documented with triggers, durations, and easing curves
- Ink Wash theme replaced with finalized design tokens in code
- Theme editor removed from Settings (light/dark toggle only)
- Motion library installed and key animations implemented (card entrances, number count-ups, skeletons)
- Charts restyled to match new design system
- `npx vite build` passes

### Claude Code prompts

**Prompt 5.1 — Font testing**
> I've selected [FONT NAME] for headings and Inter for body text. Add the Google Font import to `index.html` and update the font references in App.jsx theme system. Create a type scale with these sizes and weights: display (40px/700), h1 (32px/700), h2 (24px/600), h3 (20px/600), body (16px/400), body-small (14px/400), caption (12px/400), label (11px/600 uppercase), mono (16px/500 tabular-nums). Apply the type scale to `createStyles()`. Test that all views render correctly with the new fonts.

**Prompt 5.2 — Design token implementation**
> Replace the current Ink Wash theme tokens in App.jsx with the finalized design palette. Here are the new tokens: [PASTE DESIGN TOKENS JSON]. Update both `themes.dark` and `themes.light` objects. Update `createStyles()` to use the new surface hierarchy (background, card, card-elevated, overlay), new border-radius scale, new shadow/elevation levels, and new spacing based on a 4px grid. Remove the theme/color editor from the Settings view — keep only a simple light/dark mode toggle. Ensure all views still render correctly.

**Prompt 5.3 — Animation implementation**
> Install the `motion` library (`npm install motion`). Add subtle polish animations to the web app: (1) Wrap view transitions in `AnimatePresence` with fade + slide (200ms). (2) Dashboard cards: staggered fade-up entrance (50ms stagger, 300ms each). (3) Health score number: count-up from 0 on load (800ms). (4) Balance numbers: count-up animation on load. (5) Budget progress bars: fill from 0% (600ms). (6) All animations respect `prefers-reduced-motion`. Do NOT add animations to charts — those will be handled separately.

**Prompt 5.4 — Skeleton loaders**
> Replace all loading spinners and "Loading..." text in App.jsx with skeleton screen placeholders. Create skeleton variants matching the shape of: dashboard health card, safe-to-spend card, budget health card, account list row, transaction list row. Use a subtle pulse animation (opacity 0.4→0.7, 1.5s infinite). Fade-to-content transition (200ms) when data loads. Use the theme's border and card colors for skeleton shapes.

**Prompt 5.5 — Chart visual refresh**
> Update all Recharts components (BalanceChart, CreditCardChart, NetPositionChart, SafeToSpendChart, BudgetHealthChart) to use the new design tokens. Update: line/area colors to match new palette, axis label fonts to use the mono type scale, grid line colors to use border-subtle token, tooltip styling to match card-elevated surface, legend styling. Ensure charts are cleaner and more readable than before — reduce visual noise, increase whitespace, use the new color palette for data series.

---

## Phase 6: Expo App Foundation + Onboarding

**Effort: 24–30 hours | Calendar: ~5 weeks | Machine: Mac**

### What happens and why

This is the biggest phase and where you learn a new platform. Expo is a framework built on React Native. Instead of `<div>` and `<span>`, you use `<View>` and `<Text>`. Instead of CSS, you use `StyleSheet.create()`. The learning curve is real but manageable because you already know React.

The Expo project lives in `/mobile` inside the same repo. It imports shared financial logic from `/shared/`. It talks to the same Express backend and Supabase. It's a second client to the same backend, not a separate app.

**This phase focuses on scaffolding, auth, navigation, the Dashboard screen, and onboarding.** Don't try to build all screens at once.

**Why onboarding in this phase?** Mobile users downloading the app for the first time need guided setup even more than web users. There's no Settings tab to discover — the first experience must be: open app → log in → get walked through connecting accounts → see your Dashboard. The web onboarding from Phase 2 provides the design and flow; the Expo version adapts it for mobile patterns (swipeable cards, native Plaid Link SDK).

**Why native (not PWA)?** Apple actively limits PWA capabilities. A native app via Expo gives you: App Store presence, biometric auth, smooth 60fps navigation, and native libraries. For a finance app where trust matters, native feel is worth it.

### Deliverables

1. **Expo project in `/mobile`**
   - `npx create-expo-app@latest mobile` with Expo Router template
   - File-based routing with tab navigator (4–5 tabs matching web)

2. **Auth flow**
   - Login screen with email + OTP (same Supabase Auth)
   - Secure token storage via `expo-secure-store`
   - Auto-login on reopen if token is valid
   - Logout

3. **API client layer**
   - `/mobile/lib/api.js` — authenticated fetch helper
   - Points to Express backend (localhost:3001 for dev, production URL for builds)
   - Imports shared constants from `/shared/`

4. **Theme system**
   - Port Ink Wash tokens to React Native `StyleSheet.create()`
   - Dark/light mode via `useColorScheme()`

5. **Dashboard screen**
   - Health score visual (donut or large number with color)
   - Safe-to-spend for Mat and Mara
   - Budget health summary
   - Alerts and positives lists
   - Powered by shared functions from `/shared/health.js`

6. **Onboarding flow (Expo)**
   - Same flow as web: Welcome → Connect → Map → Sync → Done
   - Swipeable card-based UI (fits mobile patterns better than stepper)
   - Uses `react-native-plaid-link-sdk` for bank connection
   - Manual import option matching web implementation
   - Detects first-time user via same backend check (no plaid_items)
   - Stores onboarding completion state

### Key files
- `/mobile/` — entire Expo project
- `/mobile/app/(tabs)/_layout.jsx` — tab navigator
- `/mobile/app/(tabs)/index.jsx` — Dashboard
- `/mobile/app/login.jsx` — auth screen
- `/mobile/app/onboarding.jsx` — onboarding flow
- `/mobile/lib/api.js`, `/mobile/lib/theme.js`, `/mobile/lib/supabase.js`

### Done when
- Expo app runs on iPhone Simulator via `npx expo start`
- Login with email OTP shows a real Dashboard with your health score
- Score matches the web app
- Auth persists across app restarts
- Tab navigation works between placeholder screens
- Dark mode works
- First launch shows onboarding, not login-then-empty-dashboard
- Plaid Link works within onboarding on iPhone
- Onboarding completion persists across app restarts

### Claude Code prompts

**Prompt 6.1 — Expo project setup**
> Create a new Expo app in `/mobile` using Expo Router. Set up tab-based navigation (Home, Accounts, Transactions, Calendar), a login screen, Supabase auth with expo-secure-store for token persistence, and an API client for authenticated requests to the Express backend.

**Prompt 6.2 — Theme and design system**
> Create a theme system in `/mobile/lib/theme.js` using the finalized design tokens from Phase 5 (in `branding/tokens.json`). Port the complete color palette (both light and dark mode), typography scale, spacing grid, and elevation levels into React Native `StyleSheet.create()`. Install Moti for declarative animations matching the Motion-based web animations. Support dark/light via `useColorScheme()`.

**Prompt 6.3 — Dashboard screen**
> Build the Dashboard showing: health score visual, safe-to-spend for Mat/Mara, budget health summary, alerts, positives. Import scoring functions from `/shared/health.js`. Fetch latest snapshot via API client. Use the theme system. Adapt layout for mobile (stacked cards). Add Moti entrance animations matching the web app's Motion animations (staggered fade-up cards, number count-ups).

**Prompt 6.4 — Onboarding flow (Expo)**
> Build a mobile onboarding flow: swipeable cards for Welcome (explain the Give/Save/Live system), Connect Accounts (using `react-native-plaid-link-sdk` + manual entry option), Map Accounts, First Sync (progress indicator), and Done (summary). Detect first-time user (no plaid_items). Store completion state. Reuse the same API endpoints as web onboarding. Style with the finalized design system from Phase 5. Include "Skip for now" option.

---

## Phase 7: Remaining Expo Screens + Swipe Refinement

**Effort: 25–30 hours | Calendar: ~5 weeks | Machine: Mac**

### What happens and why

With the scaffold and Dashboard working, build the remaining screens one at a time: Accounts, Transactions, Calendar, Settings. Each consumes the same Express API endpoints as the web app.

**Why swipe-based refinement now?** The Transactions screen is being built in this phase. Swipe gestures are a mobile-native interaction pattern that makes transaction review fast and satisfying — swipe right to confirm, swipe left to re-categorize or flag. Building this alongside the transaction list is more efficient than bolting it on later, and it's one of the key differentiators between the mobile and web experience.

**Order:** Accounts and Transactions first (most useful for daily checking), then Calendar, then Settings.

### Deliverables

1. **Accounts screen** — Account list with balances, tap for history chart, credit card total vs. statement, net position summary

2. **Transactions screen** — Scrollable list, filter by account, pull-to-refresh triggers sync, tap for detail, swipe gestures for quick actions

3. **Swipe-based transaction refinement**
   - Swipe right: mark as reviewed / confirm category
   - Swipe left: reveal action menu (re-categorize, split, flag)
   - Re-categorize: pick from Plaid category list or custom labels
   - Split transaction: divide amount across multiple account types (e.g., a Costco run that's part groceries, part household)
   - Visual feedback: reviewed transactions get subtle checkmark, flagged items highlighted
   - Uses `react-native-gesture-handler` and `react-native-reanimated` for smooth 60fps swipes
   - Backend: new endpoint `PATCH /api/transactions/:id` for user overrides (category, split, flags)
   - User overrides stored alongside Plaid data (never overwrite Plaid source data)

4. **Calendar screen** — Monthly grid with bill/payday markers, tap-to-reveal

5. **Settings screen** — Connected accounts, "Connect new account" (Plaid Link via `react-native-plaid-link-sdk`), theme toggle, sign out, delete account (with OTP confirmation)

6. **Charts** — Use `victory-native` or `react-native-gifted-charts`. Port at minimum: balance history and safe-to-spend projection. Data shapes come from `/shared/`, rendering is platform-specific.

### Key files
- `/mobile/app/(tabs)/accounts.jsx`, `transactions.jsx`, `calendar.jsx`
- `/mobile/app/settings.jsx`
- `/mobile/components/` — React Native chart and list components
- `server/index.js` — new `PATCH /api/transactions/:id` endpoint

### Done when
- All 4 tabs show real data from the backend
- Transactions browsable and filterable
- Swipe left/right gestures work smoothly on transaction rows
- Re-categorization persists to backend
- Transaction splits work and reflect in spending analytics
- Settings allows sign out and account deletion
- Charts render on iPhone screen sizes
- Pull-to-refresh works on Transactions

### Claude Code prompts

**Prompt 7.1 — Accounts screen**
> Build Accounts showing connected accounts with balances, grouped by type. Tap for balance history chart. Net position summary at top.

**Prompt 7.2 — Transactions screen**
> Build Transactions with scrollable list from `GET /api/transactions`, grouped by date. Filter dropdown, pull-to-refresh calling sync, transaction detail modal on tap.

**Prompt 7.3 — Calendar and Settings**
> Build Calendar with monthly grid, bill markers, payday indicators, tap-to-reveal. Build Settings with connected accounts, theme toggle, sign out, and delete account with OTP confirmation. Use `react-native-plaid-link-sdk` for Plaid Link on mobile.

**Prompt 7.4 — Swipe transaction refinement**
> Add swipe gestures to the Transactions screen. Swipe right marks as reviewed (subtle checkmark). Swipe left reveals action menu: re-categorize (pick from category list), split (divide amount across account types), flag. Use `react-native-gesture-handler` and `react-native-reanimated` for smooth 60fps animations. Add `PATCH /api/transactions/:id` endpoint to `server/index.js` for user overrides — store category overrides, splits, and flags as separate fields alongside Plaid source data (never overwrite Plaid data). Split transactions should reflect correctly in the Phase 4 spending analytics.

---

## Phase 8: Email Notifications (Full System)

**Effort: 18–22 hours | Calendar: ~3 weeks | Machine: Windows**

### What happens and why

Until now, Flip is pull-only: users open the app to check their finances. Email notifications make it push: the app reaches out when something matters. A weekly digest keeps the budget top-of-mind. Paycheck alerts confirm deposits and show the split breakdown. Bill reminders prevent missed payments. Overspending alerts catch problems before they become crises.

This is the last major backend feature before shipping to testers, and it means TestFlight testers get a richer experience from day one — they don't have to remember to open the app to stay informed.

**Why a full system?** For a finance app, notifications aren't a nice-to-have — they're a core value prop. Friends-and-family testers who get a Monday morning digest will actually engage with the app. Without notifications, the app competes with every other thing on their phone for attention.

**Why its own phase?** A full notification system requires: an email service integration, a preferences table, 4+ email templates, and scheduled job infrastructure (cron or Supabase Edge Functions). That's easily 18–22 hours of backend work — too much to bundle with TestFlight prep.

### Deliverables

1. **Email service integration**
   - Integrate Resend (or SendGrid) for transactional email
   - New env var: `RESEND_API_KEY` (or equivalent)
   - Email sending utility in `server/email.js`
   - Unsubscribe link handling (one-click unsubscribe per CAN-SPAM)

2. **Notification preferences table**
   - New Supabase table: `notification_preferences`
   - `user_id` (UUID, references auth.users, with RLS)
   - `weekly_digest` (BOOLEAN, default true)
   - `paycheck_alerts` (BOOLEAN, default true)
   - `bill_reminders` (BOOLEAN, default true)
   - `overspending_alerts` (BOOLEAN, default true)
   - `email` (TEXT) — pre-filled from auth email
   - `created_at`, `updated_at` (TIMESTAMPTZ)
   - Default: all enabled on signup

3. **Email templates (4 types)**
   - **Weekly digest** (Monday morning): health score, total spending this week, upcoming bills, safe-to-spend amounts, Give/Save/Live percentages
   - **Paycheck alert** (after sync detects deposit matching pay amount): "Mat's paycheck landed" with split breakdown (Give $X, Save $X, Live $X, Personal $X) and updated balances
   - **Bill reminder** (3 days before due date): which bill, amount, projected balance vs. payment, whether you're covered or short
   - **Overspending alert** (triggered when budget health projects deficit): current burn rate, projected end-of-month balance, how much to cut back

4. **Scheduled jobs**
   - Weekly digest: runs every Monday morning (Supabase Edge Function with `pg_cron`, or external cron via cron-job.org calling a protected Express endpoint)
   - Paycheck alert: triggered after `POST /api/sync_transactions` detects a deposit matching configured pay amounts
   - Bill reminder: daily check for bills due in 3 days
   - Overspending alert: triggered when `calculateBudgetHealth()` shows deficit (checked during balance/transaction sync)

5. **Notification preferences UI (web)**
   - New section in Settings: toggle each notification type on/off
   - Email address confirmation (pre-filled from auth)
   - "Send test email" button for verification

6. **Notification preferences UI (Expo)**
   - Same toggles in mobile Settings screen
   - Matches web layout

7. **Migration file: `sql/create-notification-preferences.sql`**

### Key files
- `server/email.js` (new) — email sending utility
- `server/notifications.js` (new) — notification logic, templates, trigger conditions
- `sql/create-notification-preferences.sql` (new)
- `server/index.js` — new endpoints: `GET /api/notification-preferences`, `PUT /api/notification-preferences`, `POST /api/notifications/test`
- `src/App.jsx` — Settings section update (notification toggles)
- `/mobile/app/settings.jsx` — mobile Settings update

### Done when
- Weekly digest email sends with real financial data (health score, spending, upcoming bills)
- Paycheck alert fires when a deposit matching configured pay amount is detected
- Bill reminder sends 3 days before each due date with projected balance
- Overspending alert fires when burn rate projects a deficit
- Users can toggle each notification type on/off in both web and Expo Settings
- Unsubscribe link in every email works
- "Send test email" confirms delivery
- All emails use the Ink Wash visual style

### Claude Code prompts

**Prompt 8.1 — Email service and preferences**
> Set up Resend (or SendGrid) for transactional email. Create `server/email.js` with a `sendEmail(to, subject, html)` utility. Create `notification_preferences` Supabase table with per-user toggles for weekly_digest, paycheck_alerts, bill_reminders, overspending_alerts, plus email field. Add RLS. Add CRUD endpoints: `GET /api/notification-preferences`, `PUT /api/notification-preferences`. Default all toggles to true on first access. Add notification preferences UI to web Settings with toggles and a "Send test email" button. Add migration file to `sql/`.

**Prompt 8.2 — Email templates and triggers**
> Create 4 email templates in `server/notifications.js`: (1) Weekly digest — health score, spending summary, upcoming bills, safe-to-spend, GSL percentages. (2) Paycheck alert — deposit detected, split breakdown using `getPersonalSplits()`, updated balances. (3) Bill reminder — 3-day warning, projected balance vs. payment, coverage status using `calculatePaymentDate()`. (4) Overspending alert — deficit projection from `calculateBudgetHealth()`, suggested cutback amount. Import shared functions from `/shared/` for all financial calculations. Include unsubscribe links. Style emails with Ink Wash colors.

**Prompt 8.3 — Scheduled execution**
> Set up scheduled job execution for email notifications. Implement: (1) Monday morning weekly digest — via Supabase Edge Function with pg_cron, or external cron calling a protected Express endpoint. (2) Daily bill reminder check — find bills due in 3 days, send reminders. (3) Post-sync paycheck detection — after `POST /api/sync_transactions` completes, check for deposits matching configured pay amounts and trigger alert. (4) Post-sync overspending check — after balance/transaction sync, run `calculateBudgetHealth()` and trigger alert if deficit projected. Add Expo Settings screen toggles matching web.

---

## Phase 9: TestFlight & App Store Launch

**Effort: 15–20 hours | Calendar: ~3 weeks | Machine: Mac**

### What happens and why

The finish line. Most work here is configuration, assets, and compliance — not code. Apple requires: a privacy policy URL (you have one), account deletion in-app (you have it), and no financial advice language (use "projection" and "estimate").

### Deliverables

1. **App Store Connect setup** — App listing, privacy policy URL, support email, age rating, Finance category

2. **App icon and screenshots** — 1024×1024 icon, screenshots on iPhone 15 Pro and Pro Max sizes

3. **EAS Build configuration** — `eas.json` for preview (TestFlight) and production, code signing, first build

4. **Compliance review** — Account deletion works, empty states handled, no placeholder text, no financial advice language, reviewer demo account

5. **Polish pass** — Layout on different iPhone sizes, user-friendly errors, loading states, offline handling

6. **TestFlight distribution** — 5–10 testers, 1–2 weeks feedback, fix critical bugs

7. **App Store submission** — Submit with demo account and review notes

### Key files
- `/mobile/eas.json`, `/mobile/app.json`
- App Store Connect metadata (browser, not code)

### Done when
- TestFlight build installs and runs on a real iPhone
- 5+ testers used the app with no blocking issues
- App Store submission accepted
- Friends and family can download Flip

### Claude Code prompts

**Prompt 9.1 — EAS Build setup**
> Configure EAS Build for the Expo app. Create `eas.json` with development, preview, and production profiles. Update `app.json` with bundle ID, app name "Flip Budget", version 1.0.0, icon/splash paths.

**Prompt 9.2 — Compliance audit**
> Audit for App Store readiness: account deletion works, all screens handle empty/error/loading states, no placeholder text, privacy policy URL accessible, no financial advice language. List P0 vs P1 issues.

**Prompt 9.3 — Submission prep**
> Draft review notes: demo account credentials, reviewer walkthrough, explanation of Plaid (reviewer doesn't need real bank), notes about data being estimates/projections. List required screenshot dimensions.

---

## Timeline Summary

| Phase | What | Effort | Calendar | Machine |
|-------|------|--------|----------|---------|
| Prerequisites | Apple Dev account, Mac setup, Xcode | 2–3 hrs | Week 1 | Both |
| 1 ✅ | Transaction sync & storage (backend) | 15–20 hrs | Weeks 1–3 | Windows |
| 2 | Transaction display + onboarding + manual import (web) | 18–23 hrs | Weeks 4–6 | Windows |
| 3 | Extract shared financial logic + tests | 10–15 hrs | Weeks 7–8 | Windows |
| 4 | Analytics, Give/Save/Live + recurring detection (web) | 20–25 hrs | Weeks 9–12 | Windows |
| **5** | **UI/UX design system & branding** | **20–28 hrs** | **Weeks 13–16** | **Windows** |
| 6 | Expo app foundation + Dashboard + onboarding | 24–30 hrs | Weeks 17–21 | Mac |
| 7 | Remaining Expo screens + swipe refinement | 25–30 hrs | Weeks 22–26 | Mac |
| 8 | Email notifications (full system) | 18–22 hrs | Weeks 27–29 | Windows |
| 9 | TestFlight + App Store launch | 15–20 hrs | Weeks 30–32 | Mac |
| **Total** | | **~168–216 hrs** | **~32–36 weeks** | |

At 5–10 hours/week, this lands around **November 2026–January 2027**.

---

## Key Architectural Decisions

1. **No monorepo tooling.** `/shared` is a plain folder with ES module exports. Both Vite and Metro handle plain JS imports.

2. **Same backend for both clients.** The Express server serves both web and Expo. No API duplication. CORS already allows requests with no origin (covers mobile apps).

3. **Web app stays alive.** It's your debugging surface and desktop fallback. As you build Expo screens, the web app validates your APIs.

4. **Transaction sync is manual with throttle.** For 5–20 users, a sync button with 4-hour cooldown is sufficient. Automated background sync (webhooks, cron) is v2.

5. **Charts are platform-specific.** Web uses Recharts (DOM-based). Mobile uses a React Native charting library. Data transformation lives in `/shared/`, rendering is per-platform.

6. **Tests cover shared logic only.** Financial calculation functions are the highest-value test targets. UI testing is v2.

7. **Email notifications use an external email service.** Supabase doesn't provide transactional email beyond auth. Resend or SendGrid handles delivery. Scheduled triggers run via cron (Supabase Edge Functions or external service), not the Express server process (which can restart/redeploy).

8. **Design-first before mobile.** The UI/UX design system (Phase 5) is finalized before building Expo screens. Both web and mobile consume the same design tokens. Web uses Motion for animations, mobile uses Moti (same API patterns). The branding guide and Figma component library are the single source of truth — code implements what Figma specifies.

9. **No user-controlled theme customization.** Users get light mode or dark mode. Both are professionally designed with intentional color choices. No color pickers, no theme editor. This ensures visual consistency and reduces support surface.

---

## App Store Notes (Design Around These)

- If the app creates accounts, Apple requires in-app account deletion. ✅ Already implemented.
- Reviewer access must be complete and backend must be live during review.
- Avoid copy that sounds like regulated advice. Use "projection," "estimate," and "based on linked data."
- If you later add Google sign-in, plan for Apple-compliant equivalent sign-in support.
- If you later sell premium access in-app, that requires in-app purchase (why billing is deferred).
