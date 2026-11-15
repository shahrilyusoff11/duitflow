# Implementation status — 15 November 2026

**Phases 1 and 2 are complete. Phase 3 has not started.** Phase 2 was explicitly
requested by the owner and verified locally; no new provider/service setup,
schema migration or live Neon write was performed.

## Phase 2 finance MVP — implemented and verified locally

- [x] Protected category create/list/edit/delete, including seeded personal
  categories. PostgreSQL blocks deleting/changing the type of in-use categories.
- [x] Income/expense transaction create/list/detail/edit/delete. Filters support
  inclusive date range, category, type and description search, with stable
  pagination (20 records in UI, maximum 50 through the DAL).
- [x] Exact money-string parsing and Decimal arithmetic; all money serializes
  as fixed two-decimal strings. MYR formatting never converts money to a float.
- [x] Malaysian local calendar DATE handling, server-resolved current day and
  relative dates, and exclusive next-month boundaries.
- [x] Server-side monthly income/expenses/recorded net, category breakdown,
  recent five records and a six-month trend chart, with zero-filled empty months.
- [x] Monthly expense-category budget create/read/edit/delete, spent/limit/
  remaining/progress, configurable warning threshold (default 80%) and fixed
  100% warning. Overspending retains a negative remaining amount.
- [x] Every finance DAL entry independently verifies a real database session
  and required userId. Actions derive identity from the session. Owner-scoped
  queries, category owner/type checks, demo write denial and revoked sessions
  are tested. No cross-user finance cache exists.
- [x] Malay UI, functional navigation, labeled forms, pending/success/error
  feedback, deletion confirmation and loading/empty states.
- [x] Existing auth, Neon config, migrations and signup trigger preserved.
- [x] README, decisions, AGENTS.md and specification acceptance checklist updated.

Executed on Windows / Node 26.11.1, npm 11.20.0:

| Phase 2 check | Actual result |
| --- | --- |
| npm run lint | Passed, no warnings |
| npm run typecheck | Passed |
| npm test | **101 passed** across 6 files (58 new Phase 2 tests) |
| npm run build | Passed; finance routes are dynamic |
| npm run test:e2e | **12 passed**, desktop/mobile Chromium, 6 workers |
| git diff --check | Passed |
| Visual review | Synthetic desktop/mobile finance dashboard screenshots inspected; mobile overflow assertion passed |

Integration tests execute the actual DAL/actions, real Prisma/pg and persisted
signed sessions against disposable PGlite. They cover CRUD, owner denial on all
finance entry points, foreign object IDs, missing userId, category/type mismatch,
revocation, demo write rejection, input limits, filtering/pagination, budget
uniqueness and thresholds, exact totals, October/November, December/January and
leap-day boundaries. Existing SQL-migration/auth tests continue to pass.

The production browser suite exercises real category rename/deletion, transaction
create/detail/edit/deletion, date/type/search filters, budget creation/edit/deletion,
80%/100% warnings, dashboard updates, in-use category rejection, and anonymous
access denial on all finance pages. Finance fixtures have separate users/sessions
from sign-out fixtures. All database URL aliases are explicitly test-only.
An initial test navigated too quickly and edited the preceding page's form;
the final tests wait for the transaction detail heading before entering edits.

No Phase 2 remote CI run or live Neon finance CRUD verification is claimed.
Phase 1 real OAuth/Neon evidence below remains valid; no credentials, provider
settings or production financial records were changed. Telegram, AI, deployment
and Stretch are not implemented. Stop before Phase 3.

## Phase 1 completion record

Real OAuth, Neon, local checks and
[GitHub CI](https://github.com/shahrilyusoff11/duitflow/actions/runs/43630396318)
passed at the Phase 1 checkpoint.

See [the full Neon setup/change record](NEON_SETUP.md).

The owner approved Better Auth + GitHub-only OAuth + database sessions in chat.
No repeat approval of that approach is needed. The owner also authorized Neon
CLI setup; the existing Free production branch is connected and migrated.
GitHub OAuth credentials are configured in ignored .env. The owner pushed the
repository to GitHub and remote CI passed. Vercel, Telegram and Gemini remain unset.

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
- [x] Repository pushed to github.com/shahrilyusoff11/duitflow on main.
- [x] CI defined for Node 24, disposable PostgreSQL migration, checks and browsers.

## Phase 1 actual local results (historical)

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
- [x] GitHub Actions run 43630396318 completed successfully on the pushed commit.

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

## Remote CI evidence and Phase 1 completion

Repository: https://github.com/shahrilyusoff11/duitflow

Commit: 108874011e8af3f8fe733297b650ef3ee20749ba

Run: https://github.com/shahrilyusoff11/duitflow/actions/runs/43630396318

Conclusion: **success**.

The foundation job passed installation, schema validation, PostgreSQL migrations,
lint, typecheck, unit/integration tests, production build and browser tests.
The GitHub connector confirmed the completed run and every required step.

All Phase 1 acceptance checks now pass. Completion/status documents were updated
locally after this verified run; no application or workflow code changed.

At that checkpoint Phases 2–5 and Stretch were unstarted. Phase 2 has since been
implemented and verified as recorded above. Phases 3–5, golden-set fixtures,
demo/deployment acceptance and Stretch remain unstarted.
