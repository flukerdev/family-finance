# Flip — Access De-Provisioning Policy

**Effective Date:** February 21, 2026
**Owner:** Mat Fluker
**Review Frequency:** Annually

---

## 1. Purpose

This policy defines the procedures for revoking or modifying access when users leave the platform or when team members are removed from the project. Timely de-provisioning prevents unauthorized access to consumer financial data.

## 2. Scope

This policy covers two categories of access de-provisioning:

1. **Consumer accounts** — End users of the Flip application
2. **Administrative accounts** — Developers or team members with access to infrastructure (GitHub, Supabase, Vercel, Plaid)

## 3. Consumer Account De-Provisioning

### 3.1 User-Initiated Account Deletion

Users can delete their account at any time through the application (Settings > Danger Zone > Delete My Account). The deletion process is automated and executes the following steps immediately:

| Step | Action | System |
|------|--------|--------|
| 1 | Verify user identity via OTP | Supabase Auth |
| 2 | Revoke all Plaid access tokens | Plaid API (`itemRemove`) |
| 3 | Delete all records from `plaid_items` | Supabase |
| 4 | Delete all records from `account_mappings` | Supabase |
| 5 | Delete all records from `balance_snapshots` | Supabase |
| 6 | Delete all records from `app_config` | Supabase |
| 7 | Delete all records from `user_consents` | Supabase |
| 8 | Delete the authentication account | Supabase Auth (admin API) |

This process is implemented in the Express server endpoint `DELETE /api/account` and cascades through all user data.

### 3.2 Institution Disconnection

Users can disconnect individual bank connections at any time (Settings > Connected Banks > Disconnect). This immediately:

1. Revokes the Plaid access token via the Plaid API
2. Deletes the token from the `plaid_items` table
3. Ceases all future data retrieval from that institution

### 3.3 Database Enforcement

All database tables enforce Row Level Security (RLS) with policies scoped to `user_id = auth.uid()`. When the authentication account is deleted, the user cannot authenticate, and therefore cannot access any data — even if deletion of individual records were delayed.

## 4. Administrative Access De-Provisioning

### 4.1 When a Team Member Leaves

If a developer or team member is removed from the project, the following access must be revoked within 24 hours:

| System | De-Provisioning Action |
|--------|----------------------|
| GitHub | Remove as collaborator from the repository |
| Supabase | Remove from the project team |
| Vercel | Remove from the project team |
| Plaid | Remove from the developer dashboard (or rotate API keys) |
| .env secrets | Rotate any shared secrets (Plaid API keys, Supabase service role key) |

### 4.2 Checklist for Administrative De-Provisioning

- [ ] Remove from GitHub repository
- [ ] Remove from Supabase project
- [ ] Remove from Vercel project
- [ ] Rotate Plaid API secret
- [ ] Rotate Supabase service role key
- [ ] Update .env on all deployed environments
- [ ] Restart all servers to pick up new credentials
- [ ] Document the de-provisioning in the access review log

### 4.3 Role Changes

If a team member changes roles (e.g., from developer to read-only reviewer), their permissions should be adjusted within 48 hours to reflect the minimum access required for their new role.

## 5. Verification

De-provisioning actions are verified during the quarterly access review (see Access Review Policy). The review confirms that no former users or team members retain active access.

## 6. Policy Review

This policy is reviewed annually, or sooner if team structure changes.

---

**Contact:** matfluker34@gmail.com
