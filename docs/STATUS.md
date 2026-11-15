# Implementation status — 15 November 2026

**Phases 1 and 2 are complete. Phases 3–5 are implemented and verified locally.**
Phase 5's deployment/live acceptance is still open. The owner authorized local
polish/demo/deployment preparation on 15 November 2026 and requires approval
before provider/dashboard setup or publishing. That deployment/setup approval
was received on 15 November 2026; the approved Vercel Hobby release is now live.
Production OAuth and bot acceptance still need owner action. Gemini
credentials and live calls remain unapproved. Stop before Stretch. No paid
service, new dependency, schema migration or live Neon write was performed in
Phase 5. The public demo and hosted browser-to-Neon readiness are verified;
no real production OAuth login or live bot result is claimed yet.

## Phase 5 polish and deployment — live web release, final flows pending

- [x] Public `/demo` is a read-only, clearly labeled synthetic November 2026
  snapshot with exact Decimal totals, sample transactions, category breakdown,
  budgets, warnings and six-month trend. No user, session, DB access, mutation,
  Telegram connection or AI call is created. Real protected routes stay gated.
- [x] Landing/sign-in demo links, active accessible navigation, loading skeleton,
  contextual empty states, Malay 404 recovery, installed Next.js `retry()` error
  recovery, accessible busy/error/success feedback, larger targets, mobile money
  keyboard and long-text/narrow-screen wrapping.
- [x] Response headers deny framing, suppress referrers, prevent MIME sniffing
  and disable unused camera/microphone/location permissions. Account/sign-in/API
  paths request no indexing; robots rules are crawl guidance, never access control.
  Session checks, DAL scoping and webhook authentication are preserved.
- [x] Portfolio README with architecture, local setup, privacy/rotation/limits,
  screenshots and [exact deployment/approval runbook](DEPLOYMENT.md).
- [x] Synthetic desktop/mobile demo and finance screenshots visually inspected.
  Saved screenshot artifacts show only the public invented demo data.
- [x] Auth, Neon configuration, finance, Telegram and optional AI regression
  suites pass. All three reviewed migrations and signup trigger are unchanged.
- [x] Owner approves provider/dashboard setup and publishing for Vercel Hobby,
  production OAuth and Telegram. The Hobby project `duitflow` in
  `SY` / `sy-74fc` is deployed to [the canonical origin](https://duitflow-lyart.vercel.app).
- [x] Public HTTPS landing/demo, anonymous access denial and hosted headless
  browser → health → Prisma → existing Neon readiness verified.
- [ ] Real production GitHub sign-in/out and synthetic web transaction verified.
- [ ] Bot credentials, secret-protected production webhook and actual link →
  confirmed Telegram expense verified. No working live bot is claimed.

Executed on Windows / Node 26.11.1, npm 11.20.0:

| Phase 5 check | Actual result |
| --- | --- |
| npm run db:validate | Passed |
| npm run setup:check | Passed; format only, no values/connectivity claim |
| npm run lint | Passed, no warnings |
| npm run typecheck | Passed |
| npm test | **316 passed** across 15 files after the CI fixture repair, including **45/45 mocked AI golden cases** |
| npm run build | Passed; `/demo` and robots static, account/API routes dynamic |
| npx playwright install chromium | Passed |
| npm run test:e2e | **28 passed**, desktop/mobile Chromium, 6 workers |
| Final demo CSS/screenshot refinement | Rebuild and scoped ESLint passed; **2/2 demo browser checks** passed again |
| npm audit --omit=dev | **0 vulnerabilities** |
| npm run db:status (existing Neon, read-only) | Passed, exit 0; **3 migrations found**, database schema up to date; no migration applied or data written |
| Targeted secret scan | No matches in current non-ignored source or 162 local Git-history blobs; `.env`/generated client ignored |
| git diff --check | Passed |

### Phase 5 release CI and fixture repair

The initial release commit `b1df6a3125788a40caa2f99c06a0934a05a109fd` was pushed
to `main`. [CI run 43700269014](https://github.com/shahrilyusoff11/duitflow/actions/runs/43700269014)
completed with **failure**: install, schema validation, disposable PostgreSQL
migrations, lint and typecheck passed; `npm test` reported **314 passed, 1 failed**
across 15 files. Production build and browser checks were skipped. The failed
finance budget test received `Failed to get session`, caused by `Connection
terminated unexpectedly`, rather than an incorrect financial assertion.

The disposable integration socket allowed only one TCP connection. `pg` retires
a pooled connection after expected SQL constraint errors, and a replacement can
arrive before the old socket's deferred close cleanup finishes. The fixture now
allows two socket slots for that overlap while the Prisma pool remains limited
to **one** connection, preserving serialized PGlite work. Production code,
authorization, connection configuration and browser DB URL overrides are
unchanged. No assertion or authorization test was removed.

A new regression performs twenty expected duplicate-budget failures, each
followed by a real owner-session read and cross-user denial, then verifies that
session revocation still denies access. The timing-dependent CI failure was not
reproduced deterministically on Windows. After the repair, targeted auth/finance
tests passed **22/22**; lint, typecheck, the full **316-test** suite, production
build and all **28** desktop/mobile browser tests passed locally.

The repair was committed as `ade424e3575464738a3e926a748ef5be81a74981`.
[CI run 43701079034](https://github.com/shahrilyusoff11/duitflow/actions/runs/43701079034)
completed with **success** on 15 November 2026 at 09:51:30 UTC. The foundation
job passed install, schema validation, disposable PostgreSQL migrations, lint,
typecheck, **316/316 tests across 15 files**, production build, Chromium install
and **28/28 browser tests** (two CI workers). Cleanup passed and the
failure-artifact upload was skipped as intended.

The separately authorized, read-only `npm run db:status` against the existing
Neon configuration exited 0 and reported three migrations with the schema up to
date. No reset, new migration, schema change or synthetic data write was run by
that check.

### Actual Vercel release and hosted verification

| Release detail | Observed value |
| --- | --- |
| Plan / scope | **Hobby**, `SY` / `sy-74fc`; no paid service enabled |
| Project | `duitflow` / `prj_3N2G8nhG2CQIMOaMGFSPxwLhStRQ` |
| Deployed source | `ade424e3575464738a3e926a748ef5be81a74981` |
| Deployment | `dpl_r7u4LcdzNNBGdrcrjbbPHQCxggEA`, **READY** |
| Build | Basic, 2 vCPU / 8 GB; **1m 53s** |
| Runtime / function region | **Node 26.x**, `cle1` |
| Canonical origin | [duitflow-lyart.vercel.app](https://duitflow-lyart.vercel.app) |
| Public synthetic demo | [Read-only demo](https://duitflow-lyart.vercel.app/demo) |
| Generated deployment URL | `https://duitflow-5v7l9rcfp-sy-74fc.vercel.app`; deployment protection remains enabled |
| Release method | Reviewed manual CLI staging and promotion; **no Git auto-deploy integration configured** |

Authenticated CLI checks against the protected staged URL passed: `/`, `/demo`
and `/sign-in` returned 200, `/api/profile` returned 401, `/dashboard` returned
307 and `/api/health` returned 200. The deployment was then promoted. Raw
unauthenticated checks against the canonical public origin returned the same
expected statuses, including health 200, `Cache-Control: no-store` and the
configured security headers. CLI access used platform protection authorization;
application session checks were not bypassed. The CLI automatically created a
deployment-protection bypass secret; its value was never printed or committed.
Retain deployment protection on generated/preview URLs.

`npm run verify:app`, with `APP_VERIFY_URL` set to the canonical origin, passed
using a real headless browser: landing rendered, health → Prisma → Neon returned
200, anonymous dashboard redirected to sign-in, profile returned 401 and there
were **zero client runtime errors**. This establishes hosted web/database
readiness and anonymous denial, not real OAuth consent or bot delivery.

A five-minute runtime-log review observed one `pg` warning about future SSL-mode
semantics on a healthy `/api/health` request, with no observed request failures.
No zero-log or production-load/latency claim is made. The release introduced no
schema change, paid service or live Gemini configuration.

### Remaining owner actions

Production GitHub credentials are scoped to Production. The owner was asked to
add `https://duitflow-lyart.vercel.app/api/auth/callback/github` to the existing
OAuth app while retaining its localhost callback, then complete a real
production sign-in. The owner confirmed the additional callback is saved; real
production login remains pending. Computer-use
safety stopped Windows browser URL verification; the agent could not operate
the owner's UI. No fake session or impersonation was used to fill this gap.

The owner saved Telegram credentials in ignored `.env` (never in chat).
An official `getMe` request validated `duitflow00bot`. A random webhook secret
was generated locally, and all three bot variables are scoped to Vercel
Production. Telegram-enabled deployment, webhook registration and live expense
confirmation are in progress; no successful delivery is claimed yet.
Gemini credential setup and live calls remain
unapproved and disabled. See [the Vercel setup record](VERCEL_SETUP.md).

The production browser suite now verifies precise public demo values, no forms
or mutation requests, keyboard navigation, no horizontal overflow, same-browser
anonymous profile denial and protected redirects. It also verifies response
headers, Malay 404 recovery and active finance navigation, alongside all previous
OAuth/session, finance CRUD, budget, Telegram Settings and consent flows.
Browser migrations use disposable PostgreSQL-compatible storage with every DB
URL alias and AI credential/provider explicitly overridden. Integration tests
cover real Prisma/session boundaries with mocked provider transport.

Automated and hosted readiness checks do not establish cold-start latency,
real OAuth/bot delivery or Gemini language accuracy. The public web release is
verified; the remaining owner-dependent core flows above keep Phase 5 open.
Stretch is unstarted.

## Phase 4 free-tier AI — implemented and verified locally

- [x] Verified current public Gemini eligibility/terms from official sources on
  15 November 2026; selected gemini-3.5-flash-lite standard text with structured
  output. Malaysia is supported. Exact project quotas require approved AI Studio
  inspection; no universal allowance or owner account eligibility is claimed.
- [x] AI_PROVIDER abstraction defaults to deterministic. Direct bounded fetch
  adapter uses a fixed endpoint/model and key header; no SDK, gateway account,
  tools, caching, paid fallback or automatic upgrade. Missing key/Free-project
  attestation/config, quota/permission failure or invalid output falls back.
- [x] Protected per-user consent, default off; actions and DAL independently
  check real database sessions and derive user identity. Demo users cannot opt
  in. Malay notice describes minimal payload, human review/product improvement,
  sensitive-data prohibition, adult Malaysia use and withdrawal limits.
- [x] Strict bounded Zod schemas validate intent, transactions, confirmation,
  uncertainty and query parameters, rejecting extra fields and fabricated money.
  Money stays strings/Decimal. Dates resolve locally; amount/category/date
  clarification and multiple transactions retain explicit atomic approval.
- [x] Five fixed owner-scoped query operations render exact stored DB values.
  The model never supplies SQL, identities, totals, financial answers or writes.
  Category matching is bounded; unclear query categories ask for a new request.
- [x] Atomic Postgres per-user and shared project rate limits with no Redis.
  Defaults: 2/minute and 30/rolling 24 hours/user; 4/minute and 30/24 hours/project.
  Attempts count before dispatch, including failures. These are application
  safety caps, not a statement of Google quota. Five-second network/read/parse
  deadline and bounded HTTP/model/input sizes fail to deterministic intake.
- [x] Revisited Telegram timing: immediate feedback, bounded AI before HTTP
  success, unchanged 30-second route and retryable leases; after() cleanup only.
  Existing stable pending-action UUIDs, atomic approvals, tombstones, live
  connection checks and cross-user denials remain active. No raw inbox added.
- [x] Minimal provider payload: original message, server's Malaysian today and
  category names only. No profile identity, tokens, IDs, history or query results.
- [x] [45/45 mocked golden cases (100%)](AI_GOLDEN_REPORT.md). CI makes no live AI
  requests. This is application safety/extraction-contract evidence, not live
  model accuracy. Provider and integration mocks use only synthetic values.
- [x] Existing auth, finance, Neon configuration, three migrations, ownership
  constraints, signup trigger, Telegram linking/commands and CI remain intact.
- [x] README, AGENTS, decisions, acceptance checklist, optional env validation,
  [setup/approval proposal](AI_SETUP.md) and Telegram timing docs updated.

Executed on Windows / Node 26.11.1, npm 11.20.0:

| Phase 4 check | Actual result |
| --- | --- |
| npm run db:validate | Passed |
| npm run setup:check | Passed; format only, no values/connectivity claim |
| npm run lint | Passed, no warnings |
| npm run typecheck | Passed |
| npm test | **315 passed** across 15 files (88 new Phase 4 tests) |
| npm run build | Passed; settings/webhook remain dynamic |
| npm run test:e2e | **20 passed**, desktop/mobile Chromium, 6 workers |
| Visual review | Synthetic consent Settings desktop/mobile screenshots inspected; no overflow |
| git diff --check | Passed |

The integration suite exercises real browser consent/session authorization and
webhook -> mocked provider -> parser -> scoped DAL -> Prisma/pg/PostgreSQL,
including no-key/off fallback, failed/malicious output, shared minute/day windows,
query totals, Malaysian periods, private-chat restrictions, unlink during parse,
multi-row approval, casual-yes denial, duplicate callback and intake replay.
All browser DB URL aliases and AI provider credentials are explicitly overridden.

Initial verification caught test-only missing database environment setup and
type mismatches; corrected fixtures and matchers now pass. No app auth checks
were weakened. Final review also added money-token completeness regressions
(including sen/ringgit units and separated signs) and exact custom-category
precedence over aliases. Consent checkbox layout was reviewed at desktop/mobile widths.

No live Gemini request/model-quality benchmark, Gemini key setup, AI Studio
dashboard action, production consent change, real Telegram delivery, new live
Neon/OAuth check or new remote CI run is claimed. An unbilled Free project and
actual quotas must be verified after approval before credentials are configured.
Free-tier terms prohibit sensitive/personal input: use synthetic portfolio
examples only. Phase 5 and Stretch were unstarted at that checkpoint; see the
Phase 5 local-work/deployment gate above.

## Phase 3 Telegram — implemented and verified locally

- [x] Protected Settings with ephemeral ten-minute URL-safe link payloads;
  only SHA-256 hashes persist. Tokens are single-use and replaced atomically.
  Telegram identity/account conflicts preserve the existing connection.
- [x] Unlink removes the connection and consumes all outstanding actions/tokens.
  User row locks serialize unlink, link redemption, scoped bot reads and approval.
  Browser actions/DAL retain independent real session checks. Bot DAL operations
  require userId and recheck the live private-sender connection themselves.
- [x] Webhook authenticates its secret with constant-time digest comparison
  before streamed body-size/JSON/Zod validation. Private sender/chat IDs must
  match. Authentic malformed/unsupported/non-private updates return 200 without
  financial processing; missing/wrong secrets return 401.
- [x] PostgreSQL update leases handle RECEIVED/PROCESSING/DONE/FAILED, attempts,
  stale locks and fenced completion. DONE replays return 200. Active leases and
  transient failures return 503 so a killed invocation cannot lose its retry.
- [x] Phase 3 uses the spec's immediate processing-message alternative: bounded
  deterministic work runs before HTTP success, with four-second Telegram fetch
  deadlines and a 30-second route duration. Next.js after() handles cleanup only.
  No update payload inbox, slow AI work or paid service is introduced.
- [x] Commands /start, /help, /link, /balance, /budget, /report, /cancel.
  Financial commands are fixed scoped queries over stored records and accept an
  optional YYYY-MM. Recorded net is clearly labeled income minus expenses.
- [x] Deterministic single/multiple explicit purchases, exact money parsing,
  Malaysian dates and amount/category clarification. Unknown language receives
  guidance; no inferred write or casual-yes approval exists.
- [x] Inline Sahkan/Batal callbacks contain only an action code and UUID; all
  callback paths attempt answerCallbackQuery. Approval validates owner/sender,
  kind, expiry and categories, consumes once and writes all transactions in one
  transaction; success replies use actual committed DB values.
- [x] Stable action UUIDs per sender/update reuse the persisted proposal on
  message retry, including after approval committed. Cancelled/expired actions
  cannot become new approvable proposals. No duplicate financial writes.
- [x] Bounded lazy cleanup retains DONE update IDs and action tombstones for
  seven days (actions: seven days after expiry), and expired link tokens for one
  day. At most 100 rows per table per successful update; no cron dependency.
- [x] Auth, Neon configuration, finance behavior, three migrations, composite
  constraints, partial index and atomic signup trigger preserved. No new package.
- [x] README, AGENTS, decisions, specification checklist, optional env validation
  and [Telegram setup/rotation/live-check guide](TELEGRAM_SETUP.md) updated.

Executed on Windows / Node 26.11.1, npm 11.20.0:

| Phase 3 check | Actual result |
| --- | --- |
| npm run db:validate | Passed |
| npm run setup:check | Passed; no values printed; no connectivity claim |
| npm run lint | Passed, no warnings |
| npm run typecheck | Passed |
| npm test | **227 passed** across 12 files (126 new Phase 3 tests) |
| npm run build | Passed; settings and webhook dynamic |
| npm run test:e2e | **18 passed**, desktop/mobile Chromium, 6 workers |
| Visual review | Synthetic Settings desktop/mobile screenshots inspected; overflow assertions passed |
| git diff --check | Passed |
| Secret/config preservation | .env/generated artifacts ignored; no auth/finance/schema/Neon/package changes |

The disposable-database integration suite executes webhook -> real processor ->
scoped DAL -> Prisma/pg/PostgreSQL with mocked Telegram transport. It verifies
single-use/expired/replaced/conflicting links, real web session and action
authorization, unlink invalidation, private/unlinked denial, clarification and
commands, failed/stale/busy leases, callback expiry/cross-account checks, atomic
multi-row rollback, double taps, and a simulated completion failure followed by
approval and message retry. The last case preserves one action and one financial
write. Unit tests exercise streamed size limits, secret ordering, schemas,
bounded/redacted transport, parser cases and callback-error preservation.

Browser checks exercise actual Settings server actions, deep-link format and
replacement, explicit unlink confirmation, reload token removal and anonymous
redirects, alongside all existing auth/finance flows. All three DB URL aliases
are explicitly overridden to disposable test storage; synthetic Telegram config
also overrides the host environment. No live credentials are used in fixtures.

Initial integration checks exposed Prisma's void advisory-lock return type;
using executeRaw fixed it. Review additionally found and fixed active-lease retry
loss, callback acknowledgment error masking and proposal replacement on message
retry. These are covered by regression tests.
Final input review also added regressions for negative/signed or word-embedded
money suffixes and an uppercase cancel code that must never trigger approval.

No Phase 3 remote CI run, real bot delivery, public HTTPS registration, hosting
duration measurement, new live OAuth or live Neon check is claimed. Outbound
messages can be repeated/uncertain after network timeouts, while financial writes
stay atomic and idempotent. Provider setup and a live synthetic Telegram smoke
check remain necessary before public use. Phase 4 and Stretch were unstarted at
that checkpoint; see Phase 4 evidence above.

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
and Stretch were not implemented at that checkpoint; see Phase 3 above.

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

At that checkpoint Phases 2–5 and Stretch were unstarted. Phases 2 and 3 have
since been implemented and verified locally as recorded above. Phase 4 is now
implemented with mocked golden-set evidence. Phase 5 local polish/demo work is
now implemented; hosted/live deployment acceptance, live Gemini setup and Stretch
remain outstanding as recorded above.
