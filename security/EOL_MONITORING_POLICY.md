# Flip — End-of-Life (EOL) Software Monitoring Policy

**Effective Date:** February 21, 2026
**Owner:** Mat Fluker
**Review Frequency:** Quarterly

---

## 1. Purpose

This policy establishes procedures for monitoring, identifying, and remediating end-of-life (EOL) software used in the Flip application and its supporting infrastructure. EOL software no longer receives security patches or updates, creating potential vulnerabilities.

## 2. Scope

This policy applies to all software components used in the development, deployment, and operation of Flip, including:

- Runtime environments (Node.js)
- Application frameworks and libraries (React, Express, Vite)
- npm dependencies (direct and transitive)
- Database platform (Supabase / PostgreSQL)
- Hosting platform (Vercel)
- Development tools and operating systems

## 3. Monitoring Procedures

### 3.1 Automated Monitoring

| Tool | What It Monitors | Frequency |
|------|-----------------|-----------|
| GitHub Dependabot | npm dependency vulnerabilities and deprecations | Weekly (automated) |
| npm audit | Known vulnerabilities in installed packages | Before every release |
| npm outdated | Packages behind latest versions | Quarterly review |

### 3.2 Quarterly Manual Review

The following checks are performed every quarter (January, April, July, October):

- [ ] **Node.js** — Verify current version against [nodejs.org/en/about/releases](https://nodejs.org/en/about/releases). Ensure we are on an Active LTS or Current release, not an EOL version.
- [ ] **React** — Check for major version deprecations at [react.dev](https://react.dev).
- [ ] **Express** — Check for maintenance status at [expressjs.com](https://expressjs.com).
- [ ] **Vite** — Check for major version support at [vitejs.dev](https://vitejs.dev).
- [ ] **Supabase** — Review platform changelog and deprecation notices at [supabase.com/changelog](https://supabase.com/changelog).
- [ ] **Vercel** — Review platform updates and Node.js runtime support.
- [ ] **Operating System** — Verify Windows version receives active security updates.
- [ ] **npm dependencies** — Run `npm outdated` and review any packages that are multiple major versions behind or marked as deprecated.

### 3.3 Deprecation Alerts

When Dependabot or npm audit flags a package as deprecated:

1. Identify if a maintained replacement or fork exists
2. Evaluate migration effort
3. Schedule replacement within 30 days for critical dependencies, 90 days for non-critical

## 4. Remediation

When EOL software is identified:

| Severity | Timeline | Action |
|----------|----------|--------|
| Critical (runtime, framework with known CVEs) | 7 days | Upgrade immediately or apply workaround |
| High (direct dependency, deprecated) | 30 days | Migrate to supported alternative |
| Medium (transitive dependency, deprecated) | 90 days | Upgrade parent dependency or replace |
| Low (dev-only tooling, no security impact) | Next quarterly review | Plan upgrade |

## 5. Record Keeping

Each quarterly review is documented with:

- Date of review
- Software versions checked
- Any EOL or deprecated items found
- Remediation actions taken or planned

Records are retained for 1 year.

## 6. Policy Review

This policy is reviewed and updated annually, or sooner if significant changes occur in the technology stack.

---

**Contact:** matfluker34@gmail.com
