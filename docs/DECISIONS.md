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

At this checkpoint no remote existed; the owner subsequently selected and
pushed the repository as recorded below.

## 2026-11-15 — Phase 1 complete

The owner pushed main to https://github.com/shahrilyusoff11/duitflow, commit
108874011e8af3f8fe733297b650ef3ee20749ba. GitHub Actions run 43630396318 completed
with success. Its foundation job passed npm ci, schema validation, PostgreSQL
migrations, lint, typecheck, unit/integration tests, build and browser tests.
The result was read from the GitHub connector, including per-step conclusions.
Together with the already verified real GitHub OAuth and Neon flows, this closes
Phase 1. Phase 2 remains unstarted.

## 2026-11-15 — Phase 2 authorized web finance scope

The owner requested Phase 2 only. Implement category/transaction CRUD, monthly
server-side dashboard totals and expense-category budgets. Do not implement
Telegram, AI, deployment, demo accounts or Stretch. Retain Better Auth, existing
Neon configuration, all three migrations and the atomic signup trigger.
No dependency, schema migration, provider action or paid service was needed.

Every exported finance DAL entry independently verifies the real database
session against its required userId. Server actions independently verify the
session too and derive userId from it. All object reads, edits and deletes are
owner-scoped; category checks reject both foreign owners and mismatched types.
The existing composite foreign keys retain protection during concurrent changes.
In-use category deletion/type changes are restricted, never cascaded. Mutations
reject demo users. Action errors disclose no record contents or database details.
Next.js supplies same-origin Server Action protection and its default 1 MB body
limit; Zod further bounds every persisted field and pagination input.

Prisma's existing Decimal runtime parses complete money strings, performs all
arithmetic and serializes fixed two-decimal strings. No extra decimal dependency
is needed. MYR formatting groups string digits without converting money to a
JavaScript number. The only numeric conversion is a clamped 0–100 progress bar.
Calendar inputs support 2000–2100. Store local dates as UTC-midnight carriers for
PostgreSQL DATE, never convert an entered local day through the host timezone.
Resolve the current day/relative dates in Asia/Kuala_Lumpur. Date filters include
both entered days; monthly queries use [first day, next month's first day).

Dashboard and budget reads use repeatable-read snapshots. Prisma groupBy/SUM
computes monthly totals and category breakdown in PostgreSQL. A bounded six-month
daily aggregate supplies a zero-filled server-rendered trend chart; no complete
transaction history is transferred for aggregation. Recent records are capped
at five, paginated transaction lists at 50 per request (20 in the UI). Finance
results remain uncached. Accessible HTML/CSS charts avoid a new chart dependency.

Budget warning thresholds are configurable from 1–99%, default 80%, with a fixed
100% limit warning. Exact Decimal comparisons determine warnings before display
rounding. Overspending preserves negative remaining amounts. One budget per
expense category/month is enforced by the existing unique index. Planned entries
are absent and never count as spending.

Tests extend the existing real signed-session/PGlite pattern. Browser finance
identities are isolated from sign-out tests. All three database URL variables
remain explicitly overridden in the browser launcher. No live Neon checks or
real financial writes were performed for Phase 2; live auth/Neon evidence remains
the Phase 1 record. Phase 3 remains unstarted.
