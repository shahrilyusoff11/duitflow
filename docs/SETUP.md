# Local GitHub OAuth and Neon setup

The owner approved Better Auth + GitHub-only OAuth + database sessions on
15 November 2026. The application code is implemented. **Neon setup and all three
production migrations are complete and live verification passed.** See
[NEON_SETUP.md](NEON_SETUP.md) for the exact change record and proof.
The owner has since configured GitHub OAuth, and real sign-in, sign-out,
protected-page redirect and re-login have also passed. The instructions below
are retained for a new checkout/environment. Remote CI still needs a GitHub repo.
Never paste provider secrets into chat or a tracked file.

## 1. Prepare the local environment

Use Node 24 LTS and npm. From the repository root:

```sh
npm ci
npm run setup:init
```

setup:init creates ignored `.env` and generates a cryptographically random auth
secret without printing it. It never overwrites an existing file. If `.env`
already exists, add the keys from `.env.example` manually and retain/rotate the
secret deliberately. Do not copy real values back into `.env.example`.

Keep `BETTER_AUTH_URL="http://localhost:3000"` without a trailing slash. This
explicit origin determines trusted requests, OAuth callback and cookie security.
Deployed origins must use HTTPS. Do not use wildcard trusted origins.

## 2. Create a GitHub OAuth App

Open [GitHub OAuth application settings](https://github.com/settings/developers)
→ **OAuth Apps** → **New OAuth App**.

| Field | Local value |
| --- | --- |
| Application name | DuitFlow Local |
| Homepage URL | `http://localhost:3000` |
| Authorization callback URL | `http://localhost:3000/api/auth/callback/github` |

Register the application, generate its client secret, and put the Client ID and
Client Secret into `.env` as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
Use an OAuth App, not a GitHub App requiring repository permissions. The code
requests only `read:user` and `user:email`; it never requests repo scope. The
GitHub application used to connect Codex is separate from this OAuth App.

The app allows only GitHub login. Password, email-link, linking/unlinking social
providers, user-deletion and arbitrary auth modification endpoints are blocked.
No email provider, password table/field or paid authentication subscription is
required. Verification rows are needed for single-use OAuth state/PKCE.

## 3. Configure a Neon Free development database

Open [Neon](https://console.neon.tech/) and create a **Free** project or use an
existing empty development database. Choose a nearby available region. Do not
add a payment method, enable billing, or accept an upgrade. If the UI requires
payment, stop and use an existing/local PostgreSQL database instead.

From the project's **Connect** dialog, choose the database and role and copy:

- The **pooled** connection string to `DATABASE_URL` (the Neon hostname contains
  `-pooler`). This is the application connection.
- The **direct/unpooled** connection string to `DATABASE_URL_UNPOOLED`, which
  `neon deploy` pulls automatically. This is the Prisma migration connection.
  `DIRECT_URL` is a fallback alias. Preserve TLS parameters.

The app is also compatible with conventional local PostgreSQL. Docker is not
required. Use synthetic records for initial setup and verification.

```sh
npm run setup:check
npm run db:validate
npm run db:deploy
npm run db:status
```

setup:check prints key names only, not values, and validates configuration format.
It does not verify GitHub credentials or DB connectivity. db:deploy applies the
three reviewed migrations; db:status must report that the schema is up to date.
Never run a migration reset against a database with important records.

The auth migration adds required name/email fields with no fabricated defaults.
It is intended for the empty foundation database. If the pre-auth User table
already contains records, map those identities explicitly before applying it;
do not discard existing data or invent email addresses. The signup trigger
creates ten categories atomically inside each new user's transaction.

## 4. Verify real sign-in and sign-out

```sh
npm run dev
```

1. Open [local sign-in](http://localhost:3000/sign-in), select **Teruskan dengan
   GitHub**, and complete GitHub's real consent/sign-in screen.
2. Confirm `/dashboard` shows your own name/email and ten categories. AI must
   show **Tidak aktif** by default. No financial totals are fabricated.
3. Open `/api/profile` in the same browser; verify it returns only your own
   profile/categories and no session tokens. A `userId` query parameter cannot
   select a different account.
4. Select **Log keluar**. Revisit `/dashboard`; it must redirect to `/sign-in`.
   An unauthenticated `/api/profile` request must return 401.
5. In another browser profile/private window, repeat with a different GitHub
   identity if available. Data must remain separate.

Report whether sign-in, migration status and sign-out passed. Do not send secrets
or raw financial records. Phase 2 stays gated until this live verification passes.

## Operational behavior

- Sessions persist in PostgreSQL for seven days and refresh after one day.
  Cookie cache is disabled; server guards check the signed cookie and database
  session on every access. Session cookies are HttpOnly, SameSite=Lax, and Secure
  on HTTPS. Deleted/expired DB sessions stop authorizing requests immediately.
- OAuth tokens in the account table are encrypted by Better Auth. Session IP
  tracking and auth telemetry/logging are disabled. Do not log callbacks or codes.
- Login starts are limited to ten per minute; callbacks to thirty per minute.
  Counts persist as hashed-key RateLimitEvent rows in PostgreSQL, serialized with
  an advisory transaction lock. Storage errors fail closed. No Redis is used.
- Vercel uses its platform-set `x-vercel-forwarded-for`. Outside Vercel, requests
  share a conservative bucket instead of trusting client-supplied IP headers.
  Local testers may need to wait a minute after repeated attempts. For another
  hosting platform, implement and review its trusted proxy handling first.
- Rate events older than one day are deleted opportunistically, at most 100 per
  accepted attempt. This requires no cron. Better Auth consumes OAuth state;
  comprehensive expired auth/bot record cleanup can be added when those later
  phases need it, without claiming it exists already.
- A missing configuration disables sign-in; DB/provider failures show generic
  Malay errors or a 503 response. No fallback account or fake successful login.
- Neon can autosuspend. A first request after inactivity may be slower. Its free
  quotas, recovery/history limits and current terms must be checked in the console.

## Later deployment

Deployment is not part of this local setup. Use Vercel Hobby within its personal,
non-commercial terms, HTTPS `*.vercel.app`, no paid domain. Create a separate
production OAuth App with the exact production homepage/callback origin. Set
server secrets and DB URLs in the hosting environment, apply reviewed migrations,
and repeat the live sign-in/out checks. Never infer auth origin from arbitrary
request headers or grant trust to every `*.vercel.app` site.

## References

- [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next)
- [Better Auth GitHub provider](https://better-auth.com/docs/authentication/github)
- [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma)
- [Neon connection guide](https://neon.com/docs/connect/connect-from-any-app)
- [Vercel request headers](https://vercel.com/docs/headers/request-headers)
