# Flip — Zero Trust Architecture

**Effective Date:** February 21, 2026
**Owner:** Mat Fluker
**Review Frequency:** Annually

---

## 1. Purpose

This document describes Flip's implementation of zero trust security principles. Zero trust operates on the principle that no entity — user, device, or service — is trusted by default. Every request must be authenticated and authorized before access is granted.

## 2. Core Principles

| Principle | Implementation |
|-----------|---------------|
| **Never trust, always verify** | Every API request requires a valid JWT — no implicit trust based on network location |
| **Least privilege access** | Row Level Security ensures users can only access their own data |
| **Assume breach** | Server-side secrets never reach the client; tokens are scoped and short-lived |
| **Verify explicitly** | Destructive actions (account deletion) require re-verification via OTP; financial connections require explicit data access consent |

## 3. Authentication Layer

### 3.1 User Authentication

- All users authenticate via Supabase Auth (email + password)
- Successful login produces a **short-lived JWT** (JSON Web Token) with an expiration
- The JWT is not stored in localStorage — it is managed by the Supabase client session
- Expired tokens cannot be used — users must re-authenticate

### 3.2 API Authentication

- Every request to the Express API must include a valid JWT in the `Authorization: Bearer` header
- The `requireAuth` middleware on every `/api` route:
  1. Extracts the JWT from the request header
  2. Verifies the token with Supabase Auth
  3. Extracts the authenticated user ID
  4. Rejects the request with HTTP 401 if the token is missing, expired, or invalid
- **No API endpoint is accessible without authentication** — there are zero unauthenticated routes that access data

### 3.3 Step-Up Authentication

Sensitive operations require additional verification beyond the active session:

| Action | Additional Verification |
|--------|------------------------|
| Connecting a financial account (Plaid Link) | Data access consent required |
| Deleting user account | OTP re-verification required |
| Initial account creation | Email OTP verification required |

This ensures that destructive actions require access to the user's email, while financial connections are gated behind explicit consent. Users already verify their identity via OTP at signup.

## 4. Authorization Layer

### 4.1 Database Row Level Security (RLS)

Every table containing user data enforces RLS policies:

| Table | Policy |
|-------|--------|
| `plaid_items` | `user_id = auth.uid()` |
| `account_mappings` | Scoped via `plaid_items` ownership |
| `balance_snapshots` | `user_id = auth.uid()` |
| `app_config` | `user_id = auth.uid()` |
| `user_consents` | `user_id = auth.uid()` |

Even if an attacker obtained a valid JWT for User A, they could not query or modify User B's data. The database itself enforces isolation — the application code does not need to filter by user, because the database rejects unauthorized rows automatically.

### 4.2 Server-Side Secret Isolation

| Secret | Location | Client Exposure |
|--------|----------|----------------|
| Plaid access tokens | Server-side only (`plaid_items` table) | Never sent to frontend |
| Plaid API keys | Server-side only (`.env`) | Never sent to frontend |
| Supabase service role key | Server-side only (`.env`) | Never sent to frontend |
| Supabase anon key | Frontend (via `VITE_` env var) | Intentionally public — RLS restricts what it can access |

The frontend only receives the Supabase anon key, which is designed to be public. All sensitive operations route through the Express backend, which holds the privileged keys.

## 5. Network Controls

### 5.1 CORS Restriction

The Express API restricts Cross-Origin Resource Sharing (CORS) to:

- The production Vercel domain (`https://family-finance-rouge.vercel.app`)
- Localhost (for development only)

Requests from unauthorized origins are rejected.

### 5.2 Rate Limiting

| Scope | Limit | Purpose |
|-------|-------|---------|
| General API routes | 100 requests / 15 minutes per IP | Prevents API abuse |
| Sensitive endpoints (token exchange, link creation, account deletion) | 10 requests / 15 minutes per IP | Prevents brute force attacks |

### 5.3 Security Headers

The Express server uses `helmet` middleware to set protective HTTP headers:

- `Strict-Transport-Security` — Forces HTTPS connections
- `X-Content-Type-Options` — Prevents MIME-type sniffing
- `X-Frame-Options` — Prevents clickjacking via iframe embedding
- `Content-Security-Policy` — Restricts resource loading origins
- Additional headers for XSS protection, referrer policy, and DNS prefetch control

### 5.4 TLS Encryption

All data in transit is encrypted via TLS 1.2+:

- Frontend to API: HTTPS (enforced by Vercel and helmet HSTS)
- API to Supabase: HTTPS (enforced by Supabase client)
- API to Plaid: HTTPS (enforced by Plaid SDK)

## 6. Data Minimization

In alignment with zero trust principles, Flip minimizes the data it stores:

- **No banking credentials** — Plaid handles direct bank authentication; we only store opaque access tokens
- **No sensitive data in browser storage** — Only theme preferences are stored in localStorage
- **No financial data in logs** — Server logs do not contain account balances, transaction details, or tokens
- **Minimal Plaid data** — We request only account balances, not full transaction history

## 7. Continuous Improvement

The zero trust implementation is reviewed and strengthened over time:

- Quarterly access reviews verify that permissions remain minimal (see Access Review Policy)
- Dependency vulnerability scanning identifies and patches security weaknesses (see Vulnerability Scanning Policy)
- EOL software monitoring ensures all components receive security updates (see EOL Monitoring Policy)

## 8. Policy Review

This document is reviewed annually, or sooner if the application architecture changes significantly.

---

**Contact:** matfluker34@gmail.com
