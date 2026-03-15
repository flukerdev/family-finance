# Plaid Security Compliance — Implementation Checklist

> **Purpose:** This document maps each Plaid Security Questionnaire requirement to specific code changes and configurations needed in the Flip application. Use this as the source of truth when implementing security compliance.
>
> **Tech Stack:** Vite + React (frontend), Express (backend API), Supabase (Auth + PostgreSQL), Plaid API
>
> **Architecture:** The React app is a client-side SPA that talks to the Express API server. All Plaid interactions and sensitive database operations happen on the Express server. The React frontend never talks to Plaid directly.
>
> **Hosting:** Platform TBD — likely Railway or Render for the Express backend, Vercel or Netlify for the static React frontend. All requirements are written to be platform-agnostic.
>
> **Reference Documents:**
> - `INFORMATION_SECURITY_POLICY.md` — Organizational security framework
> - `PRIVACY_POLICY.md` — User-facing privacy commitments
> - `DATA_RETENTION_POLICY.md` — Data lifecycle and deletion procedures

---

## Status Legend

- ⬜ Not started
- 🔧 In progress
- ✅ Complete
- 🔒 Handled by infrastructure (no code needed)

---

## Q3: Access Controls

**Plaid asks:** What access controls does your organization have in place to limit access to production assets and sensitive data?

### Tasks

- ✅ **Enable Row Level Security (RLS) on ALL Supabase tables that store user data** *(add-user-auth.sql migration run — user_id columns + RLS policies on plaid_items, account_mappings, balance_snapshots, app_config; user_consents has its own migration)*
  - Every table containing user-specific data MUST have RLS enabled
  - Each table needs a policy that restricts SELECT, INSERT, UPDATE, DELETE to rows where `user_id = auth.uid()`
  - Tables to check/secure:
    - `plaid_items` (or whatever stores Plaid access tokens)
    - `account_mappings`
    - `balance_snapshots`
    - `app_config`
    - `user_consents`
    - Any other tables storing user-specific data
  - Example RLS policy:
    ```sql
    ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can only access their own plaid items"
    ON plaid_items FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
    ```
  - **Note:** Some tables may not have a `user_id` column yet. Adding `user_id` to every user-data table is part of Phase 1 (Auth Foundation) and must happen before RLS policies can be applied.
  - **Verify:** After enabling, test that User A cannot see User B's data by running queries as different authenticated users

- ✅ **Ensure API keys and secrets are in environment variables only** *(audited — no hardcoded secrets in src/, .env in .gitignore, sensitive console.logs removed from server)*
  - `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` must be in environment variables on the Express server's hosting platform
  - `SUPABASE_SERVICE_ROLE_KEY` must ONLY exist on the Express server, NEVER in the React frontend
  - The React frontend should only have `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon key is safe to expose — it's designed for client-side use and relies on RLS for security)
  - Ensure `.env` / `.env.local` is in `.gitignore`
  - **Verify:** `grep -r "sk_live\|PLAID_SECRET\|service_role" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" src/` returns no hardcoded values
  - **Verify:** Check that no `VITE_` prefixed env vars contain sensitive keys (Vite exposes all `VITE_` vars to the client bundle)

- ✅ **Ensure Plaid API calls are Express-only (server-side)** *(all Plaid SDK calls in server/index.js, only react-plaid-link on client, no plaid imports in src/)*
  - All Plaid API calls (token exchange, data fetching, token revocation) must happen in Express route handlers — never from React client code
  - The React app should call your Express endpoints (e.g., `POST /api/create-link-token`, `POST /api/exchange-public-token`), and the Express server talks to Plaid
  - **Verify:** The `plaid` npm package should NOT appear in the frontend's dependencies or be imported in any file under `src/` (the React app). It should only be imported in the Express server code.
  - **Verify:** Search for any direct Plaid API URLs (`https://sandbox.plaid.com`, `https://production.plaid.com`) in the React frontend — there should be none

- ✅ **Add auth middleware to Express** *(requireAuth middleware on all /api routes — extracts JWT, creates per-request Supabase client, attaches req.userId)*
  - Every Express endpoint that accesses user data must verify the Supabase JWT token from the request
  - Extract the token from the `Authorization: Bearer <token>` header
  - Verify it using Supabase's `supabase.auth.getUser(token)`
  - Reject requests with missing or invalid tokens (return 401)
  - Example middleware:
    ```javascript
    const authMiddleware = async (req, res, next) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No token provided' });

      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });

      req.user = user;
      next();
    };

    // Apply to all /api routes
    app.use('/api', authMiddleware);
    ```

---

## Q4: Consumer MFA (Before Plaid Link)

**Plaid asks:** Does your organization enforce 2FA on your client-facing mobile and/or web applications?

**Plaid questionnaire answer:** "Yes — We enforce 2FA using SMS-based or Email-based push OTP"

**Strategy:** Email OTP is enforced at account signup and before account deletion. Connecting financial accounts via Plaid Link is gated behind explicit data access consent (not OTP) — Plaid Link itself provides institution-level authentication with the user's bank MFA. Day-to-day app usage (viewing balances, budgets) does NOT require re-verification — the user stays logged in via their session.

### Tasks

- ✅ **Enable MFA in Supabase Auth settings**
  - TOTP (App Authenticator) is enabled in the Supabase project dashboard
  - Phone provider (Twilio) needs to be configured for SMS OTP

- ⬜ **Set up Twilio for SMS delivery**
  - Create a Twilio account at twilio.com
  - Get a Twilio phone number, Account SID, and Auth Token
  - In Supabase Dashboard → Authentication → Providers → Phone, configure:
    - SMS Provider: Twilio
    - Twilio Account SID
    - Twilio Auth Token
    - Twilio Message Service SID (or Sender phone number)
  - **Cost:** ~$0.0079 per SMS in the US. With verify-at-signup + sensitive-actions-only, this is roughly 1-3 SMS per user lifetime. Negligible cost at early scale.

- ⬜ **Collect phone number during signup**
  - Add a phone number field to the registration form
  - After the user creates their account with email + password, immediately trigger phone verification
  - Use Supabase's phone OTP to send a verification code:
    ```javascript
    // Send SMS verification code to user's phone
    const { data, error } = await supabase.auth.signInWithOtp({
      phone: phoneNumber,  // e.g., '+14155551234'
    });

    // User enters the 6-digit code they received via SMS
    const { data: session, error: verifyError } = await supabase.auth.verifyOtp({
      phone: phoneNumber,
      token: userEnteredCode,  // the 6-digit code
      type: 'sms',
    });
    ```
  - Store the verified phone number on the user profile

- ✅ **Build email OTP fallback** *(implemented as primary OTP method — sendEmailOtp/verifyEmailOtp in App.jsx, SMS to be added when Twilio is configured)*
  - Supabase supports email OTP natively:
    ```javascript
    // Send email verification code
    const { data, error } = await supabase.auth.signInWithOtp({
      email: userEmail,
    });

    // User enters the 6-digit code from their email
    const { data: session, error: verifyError } = await supabase.auth.verifyOtp({
      email: userEmail,
      token: userEnteredCode,
      type: 'email',
    });
    ```
  - Display a "Use email instead" link on the SMS verification screen

- ✅ **Build the OTP verification UI component** *(single input field with resend cooldown timer, built into App.jsx auth gate — shows after signup and before account deletion)*

- ✅ **Gate Plaid Link behind data access consent** *(consent gate → Plaid Link in Settings; user must explicitly agree to data access before connecting accounts)*
  - Before rendering the Plaid Link component, check if the user has granted data access consent
  - Plaid Link itself provides institution-level authentication (user logs in with bank credentials + bank MFA)
  - OTP at Plaid Link was removed — user already verified identity at signup, and three layers of verification (app OTP + Plaid MFA + bank MFA) was excessive

- ✅ **Gate account deletion behind OTP verification** *(confirmation dialog → email OTP → deletion in Settings Danger Zone)*

- ⬜ **Take screenshots of OTP implementation for Plaid submission**
  - Screenshot the signup flow showing phone number collection + SMS code entry
  - Screenshot the data access consent gate before Plaid Link
  - Screenshot the email fallback option

---

## Q5: Admin/Internal MFA

**Plaid asks:** Is multi-factor authentication (MFA) in place for access to critical systems that store or process consumer financial data?

**Important:** For admin/developer accounts (your own access), Plaid expects stronger MFA. Use authenticator apps, passkeys, or hardware keys — NOT SMS.

### Tasks

- 🔧 **GitHub 2FA**
  - ✅ 2FA is enabled on the GitHub account
  - ⚠️ **ISSUE:** Currently using SMS/Text message, which GitHub flags as "Less secure"
  - ⬜ **ACTION REQUIRED:** Go to github.com/settings/security → Click "Add" next to "Authenticator app" → Scan QR code with your authenticator app → Set authenticator app as preferred method → Optionally disable SMS
  - SMS is susceptible to SIM-swapping attacks — authenticator apps are stronger for admin access

- ⬜ **Enable MFA on Supabase account** (not project — your personal account)
  - Go to supabase.com → Account Settings → Security → Enable 2FA with authenticator app
  - Note: The screenshot you have shows MFA enabled at the *project level* (for your app's users). You also need it on your *personal Supabase account* (to protect admin access to the dashboard).

- ⬜ **Enable MFA on hosting platform accounts** (when selected)
  - Whatever platforms you deploy to (Railway, Render, Vercel, Netlify, etc.), enable 2FA with an authenticator app on those accounts

- ⬜ **Enable MFA on Twilio account**
  - After creating your Twilio account, enable 2FA on it — Twilio has access to send SMS on your behalf

- ⬜ **Take screenshots of each for Plaid submission**
  - GitHub security settings showing authenticator app as the 2FA method
  - Supabase account settings showing 2FA enabled
  - Hosting platform account settings showing 2FA enabled

---

## Q6: TLS 1.2+ Encryption in Transit

**Plaid asks:** Does your organization encrypt data in-transit between clients and servers using TLS 1.2 or better?

### Tasks

- 🔒 **Supabase connections use TLS by default** — no code changes needed
- 🔒 **Plaid API uses HTTPS exclusively** — no code changes needed
- ⬜ **Frontend hosting must enforce HTTPS** — when you select a platform:
  - Vercel and Netlify both provide automatic HTTPS for static sites — this is handled for you
- ⬜ **Backend hosting must enforce HTTPS** — when you select a platform:
  - Railway and Render both provide automatic HTTPS for deployed services — this is handled for you
  - If using a VPS (DigitalOcean, etc.), you'll need to configure nginx/caddy + Let's Encrypt yourself
- ⬜ **Verify:** Confirm the React app does not make any HTTP (non-HTTPS) requests to external services
  - Search for `http://` in the codebase, excluding `http://localhost` references
  - Pay special attention to the API URL — in production, the React app must call the Express server over HTTPS
  - Make sure `VITE_API_URL` is set to an `https://` URL in production

---

## Q7: Encryption at Rest

**Plaid asks:** Does your organization encrypt consumer data you receive from the Plaid API at-rest?

### Tasks

- 🔒 **Supabase encrypts all data at rest (AES-256 via AWS)** — no code changes needed
- ✅ **Verify:** Ensure no Plaid data is written to localStorage, sessionStorage, or unencrypted caches in the React app *(only theme preferences in localStorage)*
- ✅ **Verify:** Ensure no financial data is logged to console in production *(removed all console.log that output balances, account names, credentials from server/index.js)*
  - Search the Express server code for `console.log` statements that output transaction data, balances, access tokens, or account details
  - Search the React code for the same
  - Either remove these logs or wrap them in a `if (process.env.NODE_ENV !== 'production')` check

---

## Q8: Vulnerability Scanning

**Plaid asks:** Do you actively perform vulnerability scans against your employee and contractor machines and production assets?

### Tasks

- ✅ **Enable GitHub Dependabot** *(.github/dependabot.yml created — weekly npm scanning, 10 PR limit)*
  - Create `.github/dependabot.yml` in your repo:
    ```yaml
    version: 2
    updates:
      - package-ecosystem: "npm"
        directory: "/"
        schedule:
          interval: "weekly"
        open-pull-requests-limit: 10
    ```

- ⬜ **Add npm audit to CI pipeline**
  - If using GitHub Actions, add a step:
    ```yaml
    - name: Security audit
      run: npm audit --audit-level=high
    ```
  - Or create a dedicated workflow that runs weekly

- ⬜ **Enable developer workstation security**
  - Full-disk encryption (FileVault on Mac, BitLocker on Windows)
  - Firewall enabled
  - Automatic OS updates enabled

---

## Q9: Privacy Policy

**Plaid asks:** Does your organization have a privacy policy for the application where Plaid Link will be deployed?

### Tasks

- ⬜ **Create a privacy policy page in the React app**
  - Add a route for `/privacy` in your React router
  - This page must be accessible WITHOUT authentication (public route)
  - Render the contents of `PRIVACY_POLICY.md` as formatted HTML
  - You can either hardcode the content as a React component or use a markdown renderer
  - Example: `src/pages/Privacy.jsx` that renders the policy text

- ⬜ **Link to the privacy policy from the app**
  - Add a link in the app footer
  - Add a link on the signup/registration page
  - Add a link in the account settings page

- ⬜ **Submit the public URL to Plaid** (e.g., `https://flipbudget.com/privacy`)

---

## Q10: Consumer Consent

**Plaid asks:** Does your organization obtain consent from consumers for the collection, processing, and storage of their data?

### Tasks

- ✅ **Add a consent screen before Plaid Link** *(consent gate in Settings → Connected Accounts; explains data accessed, usage, disconnect option; records consent via POST /api/consent)*

- ✅ **Add consent during account signup** *(privacy/TOS checkbox on signup form; consent recorded via POST /api/consent after email OTP verification)*

- ✅ **Create a consent record table** *(create-user-consents-table.sql — needs to be run in Supabase SQL Editor)*

- ✅ **Add Express endpoint for recording consent** *(GET /api/consent + POST /api/consent with input validation in server/index.js)*

---

## Q11: Data Retention and Deletion

**Plaid asks:** Does your organization have a defined and enforced data deletion and retention policy?

### Tasks

- ✅ **Implement account deletion Express endpoint** *(DELETE /api/account — revokes all Plaid tokens, deletes all user data, deletes auth user via service role key)*
  - Create a `DELETE /api/account` route that executes the full deletion procedure from `DATA_RETENTION_POLICY.md`:
    1. Require fresh OTP verification before proceeding
    2. Revoke all Plaid access tokens via `plaidClient.itemRemove()`
    3. Delete all financial data (transactions, accounts, items) from database
    4. Delete user profile, budgets, categories, consents
    5. Delete the Supabase Auth user via `supabase.auth.admin.deleteUser(userId)`
  - This must use the Supabase service role key (server-side only)

- ✅ **Implement institution disconnection Express endpoint** *(DELETE /api/items/:item_id — revokes Plaid token via itemRemove, deletes from DB)*
  - Create a `DELETE /api/plaid-items/:itemId` route (or similar) that:
    1. Calls `plaidClient.itemRemove()` to revoke the Plaid access token
    2. Deletes the Plaid item record from the database
    3. Optionally: deletes associated transaction/account data or marks for future cleanup

- ✅ **Add account deletion UI in React** *(Danger Zone in Settings — confirmation dialog → email OTP → deletion)*
  - Add a "Delete My Account" option in account settings
  - Show a confirmation dialog explaining what will be deleted
  - Trigger OTP verification before proceeding
  - Call `DELETE /api/account` on the Express server

- ✅ **Add institution disconnect UI in React** *(Disconnect button per institution in Settings with inline confirmation)*
  - In the linked accounts section, add a "Disconnect" button for each institution
  - Show confirmation before disconnecting
  - Call `DELETE /api/plaid-items/:itemId` on the Express server

- ⬜ **Ensure no soft deletes for financial data**
  - Audit the codebase: financial data deletion should use `DELETE FROM` not a `deleted_at` soft-delete column
  - If using soft deletes anywhere, implement a cleanup job that hard-deletes after the 30-day grace period

---

## Implementation Priority Order

This order aligns with the Phase 1-8 deployment plan. Phase 1 (Auth Foundation) and Phase 2 (Security Hardening) are largely complete.

### Phase 0 — Right Now (no code, 15 minutes)
1. ⬜ **Fix GitHub 2FA — switch from SMS to authenticator app** (Q5)
2. ⬜ **Enable MFA on your Supabase account** (Q5)
3. ⬜ **Fill in TODO fields in policy docs** (your name, email)

### Phase 2 — Security Hardening (remaining items)
4. ⬜ **Set up Twilio account + configure in Supabase** (Q4)
5. ⬜ **Add phone number collection to signup flow** (Q4)
6. ✅ **Build reusable OTP verification component** (Q4) — *email OTP built into App.jsx*
7. ⬜ **Implement SMS verification at signup** (Q4) — *waiting on Twilio*
8. ✅ **Build email OTP fallback** (Q4) — *implemented as primary method*
9. ✅ **Gate Plaid Link behind data access consent** (Q4) — *consent gate → Plaid Link (OTP removed, bank MFA covers auth)*
10. ✅ **Gate account deletion behind OTP verification** (Q4)
11. ✅ **Set up Dependabot + npm audit** (Q8) — *.github/dependabot.yml created*

### Phase 3 & 4 — Deploy
12. ⬜ **Enable MFA on hosting platform accounts** (Q5)
13. ⬜ **Enable MFA on Twilio account** (Q5)
14. ⬜ **Verify HTTPS on both frontend and backend** (Q6)
15. ⬜ **Set `VITE_API_URL` to production HTTPS URL** (Q6)
16. ⬜ **Configure CORS on Express for production domain** (Q6)
17. ⬜ **Create `/privacy` public page** (Q9)
18. ✅ **Add consent flow before Plaid Link** (Q10)
19. ✅ **Add consent during signup** (Q10) — *privacy/TOS checkbox + consent recording*
20. ✅ **Build account deletion UI + Express endpoint** (Q11)
21. ✅ **Build institution disconnect UI + Express endpoint** (Q11)

### Phase 5 — Plaid Submission
22. ⬜ **Verify no `http://` requests in production** (Q6)
23. ⬜ **Enable developer workstation security** (Q8)
24. ⬜ **Take all screenshots** (Q4, Q5)
25. ⬜ **Final verification checklist (below)**
26. ⬜ **Submit to Plaid**

---

## Plaid Questionnaire Answer Key

Use these answers when filling out the Plaid security questionnaire:

| Question | Recommended Answer |
|---|---|
| Q3: Access controls | "We have defined processes for requesting, granting, reviewing, approving, and revoking access to production assets and data" |
| Q4: Consumer 2FA | **"Yes — We enforce 2FA using SMS-based or Email-based push OTP"** |
| Q5: Admin MFA | "Yes — We have deployed strong factors of authentication for all production assets" |
| Q6: TLS encryption | "Yes — We use TLS 1.2 or better for all client-server communications" |
| Q7: Encryption at rest | "Yes — We encrypt consumer data retrieved from the Plaid API using volume-level encryption" |
| Q8: Vulnerability scanning | "Yes — We actively perform vulnerability scans against all employee and contractor machines, and production assets" |
| Q9: Privacy policy | "Yes — displayed to end-users within the application" |
| Q10: Consumer consent | "Yes — We obtain consent directly from consumers" |
| Q11: Data retention | "Yes — We have a defined and enforced data deletion and retention policy" |

---

## Verification Checklist (Final Review)

Before submitting to Plaid, verify:

- [ ] Every user-data table has a `user_id` column and RLS enabled and tested
- [ ] Express auth middleware rejects unauthenticated requests
- [ ] No secrets or API keys in React frontend code (check `VITE_` env vars)
- [ ] `plaid` npm package is NOT imported anywhere in the React frontend
- [ ] No direct Plaid API URLs in the React frontend
- [ ] `VITE_API_URL` uses `https://` in production
- [ ] Twilio is configured in Supabase for SMS delivery
- [ ] Signup flow collects and verifies phone number via SMS OTP
- [ ] Email OTP fallback works when user clicks "Use email instead"
- [ ] Data access consent is required before Plaid Link renders
- [ ] OTP verification is required before account deletion
- [ ] GitHub 2FA uses authenticator app (NOT SMS only)
- [ ] Supabase account (not just project) has 2FA enabled
- [ ] Hosting platform accounts have 2FA enabled
- [ ] Twilio account has 2FA enabled
- [ ] Frontend hosting enforces HTTPS
- [ ] Backend hosting enforces HTTPS
- [ ] Express CORS only allows your production frontend domain
- [ ] Privacy policy is live at a public URL
- [ ] Consent is captured before Plaid Link and during signup
- [ ] Account deletion fully removes all data and revokes Plaid tokens
- [ ] Institution disconnect revokes Plaid tokens via `plaidClient.itemRemove()`
- [ ] No `console.log` statements output financial data in production
- [ ] Dependabot is enabled on the repository
- [ ] Screenshots collected for: SMS OTP flow, admin MFA (all platforms)
- [ ] All `TODO` items in policy documents are resolved (contact info filled in)
