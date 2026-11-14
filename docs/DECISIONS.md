# Decisions

## 2026-11-15 — Phase 1 scope

The original repository contained only DUITFLOW_CODEX_SPEC.md. Work begins with
the foundation. Phase 2 and all Stretch work remain gated. A public, clearly
marked coming-soon landing page can render without credentials. Finance and auth
routes are absent until a real approved authentication implementation exists.

## Versions and runtime

Bootstrapped with create-next-app 16.4.6 (the current stable npm release), strict
TypeScript, React 19.3.0, App Router, ESLint and Tailwind 4.3.3. Use accessible
custom components as permitted by the spec. System fonts avoid build-time Google
font downloads and third-party font requests. No external assets or analytics.
Node 24 LTS is the CI/deployment target; local Node 26.11.1 is compatible.

Prisma is pinned to stable 7.10.1. The latest tag currently resolves to an 8.x
release candidate and Better Auth's adapter does not support Prisma 8 yet.
Prisma's current config filename is prisma7.config.ts. The CLI uses DIRECT_URL;
the standard PostgreSQL pg driver adapter uses pooled DATABASE_URL at runtime.
This retains provider portability and requires no Neon-specific SDK or account
to install or run offline checks. Provider provisioning remains owner-approved;
the brief's explicit approval gates take precedence over generic auto-provision
instructions in Vercel skills. No marketplace resource is created in this step.

Cache Components are explicitly not enabled. No finance data is cached or served.
Next.js 16 uses proxy.ts if optional redirects are later added. Post-response
after() work is supported by the installed docs, but Phase 3 must verify live
hosting duration limits and retry semantics before using it for Telegram.

## Initial domain identity (superseded by approved auth below)

The first migration contained only an application ID, timestamps, demo marker
and AI consent (default false). It was deliberately authored before the auth
decision. The approved third migration now adds the required auth schema.

## Categories and database integrity

Seed defaults per user at approved signup; no nullable global owners. Composite
foreign keys bind a transaction to its owner's category and matching type.
Budgets are expense-only and similarly owner-scoped. Raw reviewed SQL adds money
ranges, budget period/threshold checks and one unconsumed Telegram action per
user. Consume expired/superseded actions transactionally before creating another.
These constraints supplement required session and DAL ownership checks.

Local migration tests execute the real SQL in ephemeral PGlite (PostgreSQL WASM).
It is a test-only dependency, never the app backend or a Neon fallback. CI also
applies the migrations to a disposable PostgreSQL 17 service using Prisma Migrate.
Neither local PGlite success nor a CI definition is proof of a Neon migration or
an executed GitHub Actions run. Provider verification must be reported separately.

## Authentication

**Approved and implemented**: the owner confirmed Better Auth + GitHub-only OAuth
+ PostgreSQL database sessions on 15 November 2026. Better Auth and its Prisma
adapter are version 1.7.24. Live OAuth credentials and Neon setup remain owner
actions; see SETUP.md. Do not request this same approval again.

The initially minimal User model now has required identity fields. Session and
Account persist login/identity; Verification stores single-use OAuth state/PKCE,
not email login. No password field exists. Provider tokens are encrypted. Cookie
cache and raw IP tracking are disabled. All protected pages/API/DAL entries check
database sessions. Default categories are seeded by a User INSERT trigger in the
signup transaction, rather than an after-commit hook. Adapter transactions are on.

The auth HTTP route allows only GitHub start/callback, session lookup, sign-out
and health/error responses. It validates bounded JSON, origin and fixed callback
destinations. Profile data is always scoped to the verified user; the DAL also
rejects cross-user IDs. OAuth start/callback limits use Postgres advisory locks
and HMAC identity keys, with bounded lazy event cleanup. Vercel's platform header
is trusted only on Vercel; other hosts share a conservative bucket. No Redis.

Tests use PGlite 0.5.16 and matching socket adapter 0.2.19 through real Prisma/pg.
The browser launcher applies migrations with Prisma Migrate and starts the real
production Next.js server. Session fixtures are signed cookies for persisted
test sessions. No test route or app bypass is deployed. GitHub network responses
are mocked in automation; live provider verification remains separate.

## 2026-11-15 — Authorized Neon CLI setup

The owner explicitly authorized Neon CLI installation, linking the existing
organization org-withered-mountain-16883150 / project solitary-hill-74765097 /
production branch, deployment, service wiring and live verification. This
supersedes the earlier manual-only Neon setup note; no repeat approval is needed.
The organization is Free. neon deploy reported no infrastructure changes and
pulled managed variables into the existing ignored .env.

Keep Prisma with pg on the existing Node runtime, as recommended by the installed
Neon Postgres skill. Migrations use DATABASE_URL_UNPOOLED before DIRECT_URL;
application queries stay pooled through DATABASE_URL. Preserve the legacy alias
and existing Better Auth setup; do not migrate to Neon Managed Auth or add other
services. The generated neon.ts was retained after init.

Validate migrations on a temporary child first, then apply the reviewed SQL to
production. This completed successfully; the temporary branch/env were removed.
Live Prisma round-trips use synthetic data in an always-rolled-back transaction.
The uncached /api/health route provides a real read-only database readiness probe
without exposing identities or credentials. A real headless browser verified the
running production Next.js app against Neon. Details: NEON_SETUP.md.

The exact requested overview skill was fetched and matched the installed skill.
The enabled global Codex Neon plugin supplies all seven skills and its URL-only
MCP server to this project; no duplicate project config was installed. No unrelated
agent configuration was manually rewritten. All CLI-reported global changes are
recorded in NEON_SETUP.md.

## 2026-11-15 — Real OAuth verification complete

After the owner saved GitHub credentials locally, setup:check passed without
printing values. The existing Chrome tab showed the real signed-in dashboard.
Verified logout -> /sign-in, direct navigation to /dashboard -> /sign-in while
signed out, and the GitHub button -> real OAuth callback -> dashboard again.
The same ten personal categories remained, and AI was off. No new authorization
prompt needed automation; the user's existing GitHub consent was reused.
The browser was left signed in. No name, email, secret or token is recorded here.

No Git remote exists and all source files remain uncommitted. The first remote
GitHub Actions execution is the remaining Phase 1 release check. Do not claim
it has run or publish to an invented repository/visibility choice.
