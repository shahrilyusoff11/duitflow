# Authentication approach — approved

Checked 15 November 2026. The owner approved this proposal in chat ("yes
proceed"). Better Auth + GitHub-only OAuth + database sessions is authorized.
The owner has configured the provider credentials locally. Real GitHub login,
logout, protected-page redirect and re-login were verified on 15 November 2026.

## Approved approach

Use **Better Auth 1.7.24**, **GitHub OAuth only**, **PostgreSQL database sessions**,
and the official Prisma adapter with stable Prisma 7.10.1. This is the approved
change to the brief's Auth.js choice following its current-status review.

The Auth.js maintainers now recommend Better Auth for new projects and continue
Auth.js maintenance for security/urgent issues. The Auth.js Next.js installation
guide still uses `next-auth@beta`; npm currently reports 5.0.0-beta.32 for that tag.
Better Auth is a stable release and runs in this Next.js app using the same
PostgreSQL database. No hosted authentication subscription, email provider,
password storage, or password reset service is needed.

If the owner prefers the original library, the alternative is Auth.js v5 beta,
GitHub-only OAuth, Prisma adapter and database sessions. Do not silently choose
the beta or change libraries without approval.

## Approved implementation scope

1. Install the approved auth library and its official Prisma adapter. Generate
   only the required auth schema and review the migration. Do not add unused
   verification/password tables for unsupported authentication methods.
2. Add server-only config and the documented route handler. Require real secrets
   at runtime, with clear missing-configuration errors and no fallback session.
3. Disable password/email login and automatic provider account linking. Limit
   identity/profile storage and never log OAuth tokens or session values.
4. Add GitHub sign-in/out and a protected dashboard shell. Verify the database
   session in each server page, action, handler and scoped DAL entry. Proxy
   redirects are optional usability checks, never authorization.
5. Seed per-user default categories atomically on signup. Store AI consent off.
6. Add authorization tests and verify real OAuth sign-in/out with the owner's
   OAuth app and development database. Confirm sign-out invalidates the session.

## Owner setup after approval

- GitHub: Settings → Developer settings → OAuth Apps → New OAuth App. For local
  development use homepage `http://localhost:3000` and callback
  `http://localhost:3000/api/auth/callback/github`. Request identity/email access
  only; never repo access. Put values in ignored `.env`, never chat or Git.
- Use an existing PostgreSQL database or create a Neon **Free** project. Copy the
  pooled URL to `DATABASE_URL` and direct URL to `DIRECT_URL`. Do not add billing
  or a card. If the dashboard requires payment, stop.
- Generate the approved library's secret locally and add it to ignored `.env`.
- Review migrations, apply to the development database, then verify OAuth.
- Deployment and production OAuth app configuration remain later manual steps.

## Sources

- [Auth.js maintainer announcement](https://github.com/nextauthjs/next-auth/discussions/13252)
- [Auth.js installation](https://authjs.dev/getting-started/installation)
- [Better Auth Prisma compatibility](https://better-auth.com/docs/adapters/prisma)
- [Better Auth GitHub provider](https://better-auth.com/docs/authentication/github)

Approval has been received and the implementation is present. See STATUS.md for
actual checks and SETUP.md for the remaining owner-operated provider steps.
