# Flip — Information Security Policy

| Field | Value |
|---|---|
| **Document Owner** | Mat — Founder & Developer |
| **Version** | 1.1 |
| **Effective Date** | February 17, 2025 |
| **Next Review Date** | February 17, 2026 |
| **Classification** | Internal / Confidential |

---

## 1. Purpose

This Information Security Policy establishes the framework for protecting consumer financial data and ensuring the confidentiality, integrity, and availability of information assets within the Flip application. This policy applies to all systems, infrastructure, and processes involved in the collection, storage, processing, and transmission of consumer financial data, including data obtained through third-party integrations such as the Plaid API.

## 2. Scope

This policy covers all production infrastructure, development environments, third-party services, and data stores used by Flip. As a single-developer operation, the information security responsibilities described herein are managed directly by the application owner.

The scope includes:

- The Flip web application (React frontend) and any associated mobile applications
- The Flip API server (Express backend)
- The hosting platforms used to serve the frontend and backend
- The database layer (Supabase / PostgreSQL)
- Authentication systems (Supabase Auth)
- API integrations (Plaid)
- Developer workstations
- All source code repositories (GitHub)

## 3. Security Contact Information

All information security matters should be directed to:

- **Name:** Mat Fluker
- **Title:** Founder & Lead Developer
- **Email:** matfluker34@gmail.com

> ⚠️ **TODO:** Replace bracketed fields with actual contact information before submitting to Plaid.

## 4. Access Control

### 4.1 Administrative Authentication

All critical systems require multi-factor authentication (MFA). This includes:

- The hosting platforms used for frontend and backend deployment
- Supabase dashboard (project and account level)
- GitHub repositories
- Any other services with access to production data or infrastructure

Phishing-resistant MFA methods (such as authenticator apps generating time-based one-time passwords) are used for all administrative access. SMS-based authentication is not considered sufficient for administrative/developer accounts.

### 4.2 Consumer Authentication

End users of the Flip application authenticate using Supabase Auth with the following multi-factor verification:

- **At account creation:** Users verify their phone number via SMS one-time password (OTP). Email-based OTP is available as a fallback. This establishes the user's verified identity.
- **Before account deletion:** SMS or email OTP verification is required again before deleting a user account. This protects the most destructive action in the application.
- **Before connecting financial accounts:** Users must grant explicit data access consent before connecting via Plaid Link. The Plaid Link flow itself provides additional institution-level authentication (login + MFA at the bank).
- **On new device or session expiry:** If a user's session expires or they sign in from a new device, OTP verification is required again.

This approach balances security with usability, protecting sensitive financial operations while minimizing friction for day-to-day app usage.

### 4.3 Principle of Least Privilege

- Access to production systems and consumer data is restricted to the application owner only.
- Database access is enforced through Supabase Row Level Security (RLS) policies, ensuring that authenticated users can only access their own data.
- No shared credentials or service accounts with broad access are used.
- API keys and secrets are stored in environment variables managed through the hosting platforms, never committed to source code.
- The Express API server authenticates every request by verifying the user's Supabase JWT token before processing. Unauthenticated requests are rejected.

## 5. Data Protection

### 5.1 Encryption in Transit

All data transmitted between clients and servers is encrypted using TLS 1.2 or higher. The Flip frontend is served exclusively over HTTPS. The Express API server is accessible only over HTTPS in production. The hosting platforms enforce HTTPS with valid SSL/TLS certificates, and HTTP requests redirect to HTTPS. All API communications with Plaid and Supabase occur over encrypted channels.

### 5.2 Encryption at Rest

All consumer data, including financial data retrieved from the Plaid API, is encrypted at rest. The Supabase database utilizes AES-256 encryption for data at rest, provided by the underlying AWS infrastructure. No consumer financial data is stored in unencrypted local files, developer machines, or logs.

### 5.3 Sensitive Data Handling

- Plaid access tokens and other sensitive credentials are stored securely in the database with appropriate access controls.
- Consumer financial data retrieved from Plaid is stored only as necessary for application functionality and is subject to the data retention policy.
- Sensitive data is never logged, exposed in error messages, or transmitted through insecure channels.
- All Plaid API interactions (token exchange, data retrieval, token revocation) occur exclusively on the Express backend server. The React frontend never communicates directly with Plaid.

## 6. Infrastructure Security

Flip operates on a managed infrastructure stack that provides built-in security controls:

- **Frontend Hosting:** The React application is deployed as a static site on a platform that provides automatic HTTPS, CDN distribution, and DDoS protection.
- **Backend Hosting:** The Express API server is deployed on a managed platform that provides HTTPS, environment variable management, and isolated runtime environments.
- **Supabase:** Provides the database and authentication layer with built-in encryption, Row Level Security, and managed infrastructure security.
- **GitHub:** Stores source code in private repositories with branch protection rules and two-factor authentication required for all contributors.

### 6.1 Hosting Requirements

Any hosting platform used for Flip must meet the following minimum requirements:

- Automatic or configurable TLS 1.2+ with valid certificates
- HTTPS enforcement (HTTP-to-HTTPS redirect)
- Environment variable management for secrets (no secrets in code or config files)
- Network-level protections (DDoS mitigation, firewall capabilities)
- Access logging and monitoring capabilities
- Data center encryption at rest for any server-side storage

These requirements apply to both frontend and backend hosting, as well as any future mobile application backend infrastructure.

### 6.2 API Security

The Express API server implements the following security controls:

- JWT token verification on every authenticated endpoint
- CORS configuration restricting requests to authorized frontend domains only
- Rate limiting to prevent API abuse
- Input validation on all endpoints to prevent injection attacks
- No sensitive data in API error responses

## 7. Vulnerability Management

The following practices are in place to identify, assess, and remediate security vulnerabilities:

- **GitHub Dependabot:** Automated dependency scanning is enabled on all repositories to detect known vulnerabilities in third-party packages. Security alerts trigger immediate review and patching.
- **npm audit:** Regular dependency audits are performed as part of the development workflow to identify and resolve security issues in the Node.js dependency tree.
- **Developer Workstation:** The development machine runs with full-disk encryption enabled, firewall active, and automatic operating system updates. Antivirus/endpoint protection software is installed and maintained.
- **Production Monitoring:** Hosting platform and Supabase dashboards are monitored for anomalous activity. Automated alerts are configured for failed authentication attempts and unusual API usage patterns.

## 8. Incident Response

In the event of a suspected or confirmed security incident involving consumer financial data, the following steps will be taken:

1. The incident is immediately assessed to determine scope and impact.
2. Affected systems are isolated to prevent further exposure.
3. Plaid and any other affected third-party partners are notified within 72 hours.
4. Affected consumers are notified as required by applicable data privacy laws.
5. Root cause analysis is performed and documented.
6. Remediation measures are implemented to prevent recurrence.

## 9. Mobile Application Security

When a mobile application (iOS or other platforms) is released, the following additional security measures will apply:

- The mobile application will communicate with the Express API backend exclusively over HTTPS/TLS 1.2+.
- No consumer financial data will be stored on the device in unencrypted form.
- Authentication tokens will be stored using platform-provided secure storage (e.g., iOS Keychain).
- SMS OTP auto-fill will be supported via platform-native capabilities (e.g., iOS `textContentType="oneTimeCode"`) for seamless verification.
- The mobile application will undergo security review before release, including checks for hardcoded secrets, insecure data storage, and insecure network communication.
- App store distribution provides code signing and integrity verification.
- CORS and API authentication will be extended to authorize requests from the mobile application.

## 10. Policy Review

This policy is reviewed and updated at least annually, or more frequently as needed in response to significant changes in the application, infrastructure, regulatory requirements, or threat landscape. All updates are documented with version history and effective dates. This includes review upon selection of new hosting platforms or expansion to new application platforms (e.g., mobile).
