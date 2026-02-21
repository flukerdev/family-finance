# Flip — Periodic Access Review Policy

**Effective Date:** February 21, 2026
**Owner:** Mat Fluker
**Review Frequency:** Quarterly

---

## 1. Purpose

This policy establishes a process for conducting periodic reviews of all access rights across systems that store or process consumer financial data. Regular access reviews ensure that permissions remain appropriate and that no unauthorized, excessive, or orphaned access exists.

## 2. Scope

This policy covers access to:

- **Supabase** — Database, authentication, and project dashboard
- **GitHub** — Source code repository
- **Vercel** — Hosting and deployment platform
- **Plaid** — Financial data API (developer dashboard)
- **Application database** — Plaid access tokens, user data, and financial records

## 3. Review Schedule

Access reviews are conducted **quarterly** (January, April, July, October) and documented.

## 4. Review Checklist

### 4.1 Supabase Access

- [ ] Review all users with access to the Supabase project dashboard
- [ ] Confirm MFA is enabled on all admin accounts
- [ ] Review Row Level Security (RLS) policies on all tables — confirm per-user isolation is enforced
- [ ] Check for any disabled RLS policies
- [ ] Review API keys — confirm anon key has appropriate restrictions, service role key is not exposed

### 4.2 GitHub Access

- [ ] Review all collaborators on the repository
- [ ] Remove any collaborators who no longer need access
- [ ] Confirm 2FA is enabled on all accounts with access
- [ ] Review Dependabot alerts — ensure none are stale or ignored
- [ ] Review branch protection rules on main branch

### 4.3 Vercel Access

- [ ] Review all team members with access to the Vercel project
- [ ] Remove any members who no longer need access
- [ ] Confirm MFA is enabled on all accounts
- [ ] Review environment variables — confirm no unnecessary secrets are stored

### 4.4 Plaid Access

- [ ] Review Plaid developer dashboard access
- [ ] Confirm MFA is enabled on the Plaid account
- [ ] Review active Plaid Items — confirm all connected institutions belong to active users
- [ ] Check for orphaned access tokens (tokens belonging to deleted users)

### 4.5 Application Database

- [ ] Query `plaid_items` table — confirm all tokens belong to active users
- [ ] Query `user_consents` table — confirm consent records are current
- [ ] Check for any user accounts without corresponding consent records
- [ ] Verify no Plaid access tokens are stored outside the `plaid_items` table

## 5. Remediation

When the review identifies issues:

| Finding | Action | Timeline |
|---------|--------|----------|
| Unauthorized access (unknown user/collaborator) | Revoke immediately | Same day |
| Excessive permissions | Reduce to minimum required | 7 days |
| Missing MFA on admin account | Enable MFA | 7 days |
| Orphaned Plaid tokens | Revoke via Plaid API and delete | 7 days |
| Stale Dependabot alerts | Review and resolve | 14 days |

## 6. Documentation

Each quarterly review produces a brief record containing:

- Date of review
- Systems reviewed
- Findings (if any)
- Remediation actions taken
- Reviewer name

Records are retained for 1 year.

## 7. Policy Review

This policy is reviewed annually, or sooner if the team structure, technology stack, or compliance requirements change.

---

**Contact:** matfluker34@gmail.com
