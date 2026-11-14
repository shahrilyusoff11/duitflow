# Implementation status — 15 November 2026

**Neon and real GitHub OAuth verification pass. The first remote GitHub Actions
run remains pending; no Git remote is configured. Phase 2 has not started.**

See [the full Neon setup/change record](NEON_SETUP.md).

The owner approved Better Auth + GitHub-only OAuth + database sessions in chat.
No repeat approval of that approach is needed. The owner also authorized Neon
CLI setup; the existing Free production branch is connected and migrated.
GitHub OAuth credentials are now configured in ignored .env. GitHub remote,
Vercel, Telegram and Gemini remain unset.

## Implemented

- [x] Strict TypeScript, Next.js 16.4.6 App Router, React, Tailwind, npm lockfile.
- [x] Responsive Malay landing/sign-in/account pages, accessible keyboard links,
  loading/error feedback and protected layout.
- [x] Better Auth 1.7.24 + official Prisma adapter, GitHub only, database sessions.
- [x] Real signed-cookie/session checks in each protected page/API/DAL entry.
  The DAL requires userId and independently rejects cross-user profile access.
- [x] Sign-out deletes persisted sessions. Expired/deleted tokens cannot be reused.
- [x] OAuth state/PKCE storage, fixed callbacks, same-origin POST checks, bounded
  Zod-validated sign-in input, blocked password/account-linking endpoints.
- [x] Provider tokens encrypted; cookie cache, raw IP tracking, auth telemetry
  and sensitive auth logging disabled.
- [x] Prisma 7.10.1 + pg adapter, pooled runtime/direct migration URLs, lazy
  server-only client, one connection per instance for the small personal MVP.
- [x] Three reviewed migrations: domain, constraints, auth/atomic category seed.
- [x] Ten per-user defaults seeded by a PostgreSQL trigger inside signup's
  transaction. Rollback tests verify no partial user/category writes remain.
- [x] Positive DECIMAL money, local DATE, UTC audit timestamps, category owner/type
  composite foreign keys, budget checks, pending-action partial unique index.
- [x] Shared Postgres OAuth rate limits with HMAC keys and advisory transaction
  locks, bounded lazy cleanup, no Redis or process-local fallback.
- [x] Configuration validation, safe error messages, .env.example, setup scripts,
  AGENTS.md, practical README, technical decisions and exact provider setup guide.
- [x] Ignored .env created with a generated auth secret, never printed. Neon variables
  were pulled into that existing file; GitHub credentials are now configured locally and verified.
- [x] Local Git repository on main; no commits or remote created.
- [x] CI defined for Node 24, disposable PostgreSQL migration, checks and browsers.

## Actual local results

Executed on Windows using Node 26.11.1 and npm 11.20.0.

| Check | Result |
| --- | --- |
| npm ci | Passed after restoring a fresh dependency directory |
| npm run db:validate | Passed |
| prisma generate | Passed |
| npm run lint | Passed, no warnings |
| npm run typecheck | Passed |
| npm test | **43 passed** across 4 files |
| npm run build | Passed; / static; sign-in, dashboard and API routes dynamic |
| npm run test:e2e | **8 passed**, desktop/mobile Chromium, 6 workers |
| Prisma migrate deploy | Passed on temporary Neon validation branch and production, plus the disposable test socket |
| Visual review | Sign-in and dashboard screenshots inspected at desktop/mobile widths |
| npm run setup:check | Passed: required configuration is present and valid; no secret values printed |
| npm audit --omit=dev | **0 vulnerabilities** |
| Full dependency audit | 7 existing moderate development-only findings in typescript-eslint/minimatch |
| Secret ignore checks | .env ignored; .env.example visible; real Neon credentials remain ignored |

Tests exercise real Prisma/pg operations and SQL in test-only PGlite, session
signature rejection, expiry, revocation, cross-user denial, concurrent session
isolation, atomic signup/rollback, OAuth initiation/callback/state replay with
mocked GitHub HTTP responses, encrypted token storage, origin/input limits,
Postgres rate caps, and existing domain constraints.

Browser tests use signed cookies for real persisted test sessions, with no
application bypass or deployed test endpoint. They verify protected access,
owner-only profile results, actual sign-out, rejection of old-cookie replay,
OAuth-button navigation with the external GitHub screen intercepted, keyboard
navigation, and mobile overflow.

The embedded database has one underlying PostgreSQL connection. Parallel browser
verification initially exposed its multi-connection multiplexing limitation.
With the application's bounded one-connection pool, all eight concurrent browser
tests pass, along with a 20-lookup concurrent identity-isolation integration
test. Separate live Neon migration, rollback/round-trip and browser-to-database
checks now pass; see NEON_SETUP.md.

A separate npm ci interrupted node_modules during this session. The partial
directory was retained as ignored .node_modules-interrupted-20261115, and a fresh
npm ci completed successfully. No user source files or credentials were removed.

## Phase 1 acceptance gate

- [x] Owner approves authentication approach.
- [x] Approved auth/session implementation and reviewed schema.
- [x] Protected access and cross-user denial covered by automated tests.
- [x] Default categories seed atomically and AI consent defaults off.
- [x] Lint, typecheck, tests and production build pass.
- [x] Migrations execute through Prisma on the local compatible test server.
- [x] Existing Neon Free database configured via authorized CLI setup.
- [x] Real GitHub OAuth App credentials configured locally.
- [x] Reviewed migrations applied to real Neon production; schema up to date.
- [x] Browser -> app -> Prisma -> live Neon readiness check returns HTTP 200.
- [x] Real browser GitHub sign-in, own-data display, sign-out, protected redirect and re-login verified.
- [ ] GitHub Actions run on a configured remote (workflow is prepared only).

Live Neon checks now verify connectivity/TLS, pooled Prisma round-trips and
migrations. Autosuspend behavior was not load-tested. Automated GitHub fixtures remain separate from the now-successful real OAuth
browser verification.

## Real OAuth verification evidence

After setup:check passed, the user's existing Chrome tab showed the real account
dashboard with ten categories and AI off. Clicking Log keluar returned to
/sign-in. Direct navigation to /dashboard while signed out also returned to
/sign-in. Clicking Teruskan dengan GitHub completed the real OAuth callback and
restored the same account/categories. The browser was left signed in.

No credentials, cookies, tokens, names or email addresses are included in this
record. No application change or new test account was needed for these checks.

## Remaining Phase 1 item

The CI workflow exists and local checks pass, but no Git remote, initial commit,
push or GitHub Actions run exists. A repository destination/visibility has not
been chosen. Do not claim remote CI passed.

Phases 2–5 and Stretch remain unstarted. Transaction CRUD, financial aggregates,
monthly budgets, Telegram, AI, golden-set fixtures and demo/deployment acceptance
criteria are not claimed complete.
