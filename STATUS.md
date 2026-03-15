# Flip Development Status

**Last Updated:** March 13, 2026

---

## Current State

All core web features implemented. Plaid production access is LIVE. Email signup and verification working. Now executing the MVP v2 roadmap (see PLAN.md) — building toward an iPhone app via Expo/React Native for friends-and-family launch.

## Current Roadmap Phase

**Phase 1: Transaction Sync & Storage (Backend)** — ✅ COMPLETE

See PLAN.md for the full 9-phase roadmap.

## Plaid Status

- **Production access:** LIVE ✅
- **Email signup/verification:** Working ✅
- **Security attestations:** 6/7 complete
- **Remaining:** MFA upgrade (email OTP → TOTP or biometric) — deadline August 22, 2026

## Recently Completed

- **Flexible account system (Sub-Phases A-D):** Restructured from hardcoded 5 checking + 3 credit cards to a flexible system supporting 0-N accounts. New `credit_cards` table, JSONB `buckets`/`cards` columns on `balance_snapshots`, new mapping modes (direct/primary/credit_card), dynamic credit card loop in all financial functions. AccountMappingUI redesigned for flexible mapping. All functions (calculateHealth, calculateDisposableIncome, calculateBudgetHealth, chart data, calendar, card projections) now iterate dynamically. Dual-write for backward compat. Migration SQL: `sql/flexible-accounts-migration.sql`. New endpoints: `GET/POST /api/credit-cards`.
- **Test mode system:** `?testmode=true` on localhost activates sandbox Plaid (free), skips OTP, adds data reset button. Server uses dual Plaid clients (`req.plaidClient` pattern). New endpoint: `POST /api/test-reset`.
- **Onboarding flow (Phase A):** 10-step first-time user wizard (Onboarding.jsx) — welcome slides, privacy, name collection, Plaid connect, account mapping, sync, done
- **Name parameterization:** All hardcoded "Mat"/"Mara" strings replaced with configurable `person_1_name`/`person_2_name` from app_config (~25 locations in App.jsx + chart components)
- **RLS security fix:** Fixed balance_snapshots table leaking data across users (removed wide-open `USING (true)` policies)
- **DB schema:** Added `onboarding_complete`, `person_1_name`, `person_2_name`, `is_joint_budget` columns to app_config
- Security hardening: helmet headers, CORS restriction, rate limiting
- Public privacy policy route at /privacy
- Vercel SPA routing (vercel.json)
- Security policy docs (EOL, vulnerability scanning, access review, de-provisioning, zero trust)
- User auth system (signup, login, email OTP verification)
- Consent system (privacy policy + Plaid data access consent gates)
- Account deletion with Plaid token revocation
- Math audit corrections
- Chart components (Balance, CreditCard, NetPosition, SafeToSpend, BudgetHealth)
- npm vulnerability patches (axios, qs)
- MVP roadmap v2 finalized (PLAN.md rewritten)
- Transaction schema created (Prompt 1.1): `transactions` + `sync_cursors` tables
- Codebase cleanup: SQL files moved to `/sql/`, deleted `nul` artifact, updated all references
- Transaction sync endpoint (Prompt 1.2): `POST /api/sync_transactions` with cursor-based Plaid sync
- Plaid UX fixes (post-1.2): removed OTP gate, auto-sync after mapping, "Bank"→"Account" rename, relative sync timestamps, Plaid-managed cards disable manual entry, removed manual sync button, security docs updated
- Transaction read endpoint (Prompt 1.3): `GET /api/transactions` with account_type/date/pagination filters

## Next Up (Phase 2: Transaction Display + Onboarding + Manual Import)

### Phase 1 Completed ✅
1. ~~Create `transactions` and `sync_cursors` Supabase tables~~ ✅ (Prompt 1.1)
2. ~~Add `POST /api/sync_transactions` endpoint~~ ✅ (Prompt 1.2 — cursor-based sync, 4-hour throttle, upsert)
3. ~~Fix Plaid connection/mapping/sync UX~~ ✅ (auto-sync, OTP removal, terminology, card balance handling)
4. ~~Add `GET /api/transactions` endpoint~~ ✅ (Prompt 1.3 — paginated, filterable, 330 transactions verified)

### Phase 2 Deliverables
- Transaction list view in the frontend (filterable, paginated)
- First-time user onboarding flow (Welcome → Connect → Map → Sync → Done)
- Manual account entry option (Plaid or manual per account type)
- See PLAN.md for Phase 2 prompts (2.1, 2.2, 2.3)

## Prerequisites (In Parallel)

- [ ] Enroll in Apple Developer Program ($99/year)
- [ ] Set up Mac development environment (clone repo, install Xcode, Expo CLI)
- [ ] Create Expo account at expo.dev

---

## Notes

- Production URL: https://family-finance-rouge.vercel.app
- Privacy policy: https://family-finance-rouge.vercel.app/privacy
- Security docs in /security/ directory
- Full roadmap in PLAN.md (9 phases, ~168-216 hrs)
- Phase 5 (UI/UX Design System & Branding) added March 11, 2026 — design-first before Expo build
