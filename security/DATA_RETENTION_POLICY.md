# Flip — Data Retention and Disposal Policy

| Field | Value |
|---|---|
| **Document Owner** | Mat — Founder & Developer |
| **Version** | 1.1 |
| **Effective Date** | February 17, 2025 |
| **Next Review Date** | February 17, 2026 |
| **Classification** | Internal / Confidential |

---

## 1. Purpose

This Data Retention and Disposal Policy defines how Flip manages the lifecycle of consumer data, from collection through secure disposal. The policy ensures compliance with applicable data privacy laws and the requirements of third-party data providers, including Plaid. It establishes clear retention periods, disposal methods, and review procedures to minimize data exposure and protect consumer privacy.

## 2. Scope

This policy applies to all consumer personal and financial data collected, processed, or stored by the Flip application, including:

- Data received through the Plaid API
- User account information (including phone numbers used for verification)
- Authentication records
- Application logs

It covers data stored in all systems including the Supabase database, the application hosting platforms (frontend and backend), and any local development or backup systems.

## 3. Data Retention Schedule

| Data Category | Retention Period | Storage Location | Disposal Method |
|---|---|---|---|
| User account data (name, email, phone number) | Duration of account + 30 days | Supabase | Hard delete from database |
| Authentication credentials | Duration of account | Supabase Auth | Purged on account deletion |
| Plaid access tokens | Until institution disconnected or account deleted | Supabase (encrypted) | Token revoked via Plaid API, then deleted from database |
| Financial account data (balances, account info) | Duration of account + 30 days | Supabase | Hard delete from database |
| Transaction history | Duration of account + 30 days | Supabase | Hard delete from database |
| Budget/category configurations | Duration of account + 30 days | Supabase | Hard delete from database |
| Consent records | Duration of account + 30 days | Supabase | Hard delete from database |
| Application logs | 90 days maximum | Hosting platform | Auto-purged by platform or manual deletion |
| Error/debug logs | 30 days maximum | Hosting platform | Auto-purged by platform or manual deletion |

**The 30-day grace period** after account deletion allows for account recovery requests and ensures all asynchronous processes have completed before permanent deletion.

## 4. Data Disposal Procedures

### 4.1 Account Deletion

When a user requests account deletion or when the retention period expires, the following disposal procedure is executed:

1. **Revoke Plaid tokens:** Revoke all Plaid access tokens associated with the account via the Plaid API (`plaidClient.itemRemove()`) to stop any further data retrieval.
2. **Delete financial data:** Delete all financial data (transactions, account balances, institution connections) from the Supabase database using hard delete operations.
3. **Delete profile data:** Delete user profile data, budget configurations, consent records, and all application preferences.
4. **Remove auth record:** Remove the user authentication record from Supabase Auth, including phone number and any other verification data.
5. **Verify deletion:** Query the database to confirm no records remain for the deleted user ID.

### 4.2 Institution Disconnection

When a user disconnects a financial institution:

- The Plaid access token for that institution is immediately revoked through the Plaid API (`plaidClient.itemRemove()`).
- No new data is fetched from that institution.
- Existing transaction and account data from that institution is retained per the schedule above (deleted upon account deletion or user request).

### 4.3 Secure Disposal Standards

- Database records are permanently deleted (hard delete, not soft delete) to ensure data cannot be recovered through normal database operations.
- Plaid tokens are revoked at the source to ensure the token cannot be reused.
- No consumer financial data is retained in backups beyond the retention period.
- Logs containing potentially identifiable information are purged according to the schedule above, either automatically by the hosting platform or through manual deletion procedures.

## 5. Backups

Supabase provides automated daily database backups as part of its managed service. These backups are encrypted at rest and follow the same retention policies as live data. Backup data older than the retention period defined in this policy is not restored during recovery operations. If a database recovery is necessary, any data belonging to deleted accounts that appears in restored backups will be re-deleted as part of the recovery procedure.

## 6. Mobile Application Data

When a mobile application is available, the following additional retention rules apply:

- No consumer financial data is stored persistently on the user's device. The mobile app retrieves data from the API server on demand.
- Authentication tokens stored in device secure storage (e.g., iOS Keychain) are cleared upon user logout or account deletion.
- Any locally cached data is cleared when the user logs out, disconnects an institution, or deletes their account.

## 7. Legal Holds and Exceptions

In the event of a legal hold, litigation, regulatory investigation, or applicable legal requirement, data that would otherwise be subject to disposal may be preserved beyond the standard retention period. Any such preservation will be documented, limited in scope to the specific data required, and the data will be disposed of promptly once the legal hold is lifted.

## 8. Regulatory Compliance

This policy is designed to comply with applicable data privacy laws and regulations, including but not limited to:

- California Consumer Privacy Act (CCPA)
- State-level data breach notification laws
- Plaid's data security and retention requirements
- Other applicable federal and state privacy regulations

Data retention periods defined in this policy meet or exceed the minimum requirements of these regulations.

## 9. Policy Review

This policy is reviewed at least annually or whenever significant changes occur to the application architecture, data processing activities, regulatory requirements, or third-party partner agreements. This includes review upon changes to the hosting platform or expansion to new application platforms.

## 10. Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | February 17, 2025 | Mat | Initial policy creation |
| 1.1 | February 18, 2025 | Mat | Added phone number to retention schedule, added consent records |
