# Decisions

## 2026-11-19 — Telegram financial discussion

The owner requested conversational analysis and spending guidance. Use
recorded income and expenses, category totals, configured budget thresholds
and prospective budget calculations. For the current month, compare spending
through today with the same calendar days of the previous month. Historical
months use their complete ranges. Purchase checks use the selected month's
recorded category spending and budget.

Keep the latest successful natural-language monthly query's topic on the linked Telegram
connection for ten minutes. Store validated query parameters so replies can
reuse the period or category. Omit the prospective amount, message text,
ledger results and reply text. Expiry, unlink and cancellation prevent
continued use. These queries run within DuitFlow with the same scoped reads
as the bot's other financial answers.

## 2026-11-19 — Telegram conversation and recurring bills

Casual Malay and English intake, monthly reports and totals, and bill requests
use local interpretation. DeepSeek can still suggest
categories from the existing allowlisted projection for cases the local parser
cannot categorize. The Settings consent and provider payload policy apply.

Bill creation and payment reuse the existing pending-action store, callback
protocol and schedule rules. Bill creation collects the amount, due date,
monthly or yearly cadence, and expense category. Payment proposals bind to an
active owned bill and its current version and next due date. Approval advances
the schedule atomically with the expense. A newer pending action or an expired
clarification cannot be overwritten by a delayed clarification reply.
An unnamed payment keeps its date and amount in a short-lived clarification.
The user names the active bill before the bot prepares an approval.

## 2026-11-18 — Recurring bills

Add monthly and yearly expense schedules in `/bills`. The dashboard uses the
Malaysian calendar date and shows all active occurrences in the 30-day window
starting today. Overdue schedules remain in the management list, so an old due
date can still be recorded when paid. Monthly and annual schedules preserve the
chosen day when a shorter month temporarily shifts it to the last day.

Only confirming the prefilled payment form saves a transaction. A version check
claims the outstanding occurrence and advances the schedule in the same database
transaction that records the expense. Changes to the schedule, including deletion,
leave saved transactions in the ledger. To reopen a due date after correcting a
payment in the ledger, adjust the schedule from `/bills`.

## 2026-11-18 — Frontend redesign

The landing page, public demo and signed-in dashboard share a server-rendered
monthly summary. Public pages use the fixed demo snapshot. A grouped bar chart
shows six months of income and expenses with a keyboard-accessible table of
exact amounts. Category editors use native disclosure controls to shorten the
page on mobile. The Kuala Lumpur illustration is served locally as WebP.

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

## 2026-11-15 — Phase 3 Telegram scope and identity boundary

The owner requested Phase 3 only. Retain Better Auth, Neon, finance and the three
reviewed migrations. Existing Telegram models support this phase without schema
changes or new npm packages. No AI/provider client, account creation, dashboard
operation, hosting deployment or paid service was introduced. Phase 4 stays gated.

Browser Settings and its actions independently verify real database sessions;
the Settings DAL also verifies its required userId. A bot request has a different
identity boundary: a constant-time verified webhook secret, bounded Zod update,
non-bot sender and private chat whose ID matches that sender. The bot resolves
userId from the persisted unique connection, and every bot DAL entry rechecks
that connection inside its own transaction. It never creates a browser session
or calls the web finance DAL with an auth bypass. Browser-supplied Telegram IDs
and user IDs do not authorize anything.

Generate 32 random bytes as a 43-character base64url link token. Store SHA-256,
expire after ten minutes and consume atomically. New tokens invalidate older
tokens. Redemption also takes a Telegram-identity advisory lock and user row
lock; unique constraints preserve one identity per account with no silent relink.
The shared user row lock serializes unlink, approval and scoped reads/mutations.
Unlink deletes the connection and consumes outstanding links and pending actions.
Demo users cannot link or operate the bot.

## Telegram timing, retry and idempotency choices

Read the installed Next.js route-handler, Server Action and after() guides before
coding. Next.js after() extends an invocation only within its configured platform
duration; it is not a durable queue. Telegram retries unsuccessful webhook HTTP
responses. Returning 200 before an in-memory worker completes would lose work if
the invocation dies, because the existing state table has no durable raw inbox.

Use §4.7's immediate “Sedang memproses…” alternative in Phase 3: execute only
bounded deterministic work before returning HTTP success. Fetch calls time out
after four seconds; the route declares maxDuration=30. after() runs housekeeping
only. This preserves genuine 503/Telegram retry semantics without storing raw
updates, adding a broker or provisioning a service. No hosted timing benchmark
is claimed. Phase 4 must revisit slow parsing/post-response durability before
adding any AI work; this phase adds no AI infrastructure in anticipation.

Official sources checked on 15 November 2026:
[Telegram setWebhook](https://core.telegram.org/bots/api#setwebhook),
[deep links](https://core.telegram.org/bots/features#deep-linking),
[callback data](https://core.telegram.org/bots/api#inlinekeyboardbutton), and
[Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration).
The current Vercel Fluid Compute Hobby maximum is 300 seconds; our 30-second
setting is conservative and does not activate a plan, deployment or billing.

Update claims use PostgreSQL advisory locks and incrementing attempt leases.
Failed/stale/received updates resume; DONE replays are ignored with 200. Recent
PROCESSING duplicates do no extra work but return retryable 503 rather than 200:
this deliberately tightens the brief's “ignore recent processing” response to
avoid acknowledging the retry of a worker killed before its 60-second lease
expires. Completion checks the attempt and lock timestamp; a stale worker cannot
complete a newer lease. Permanent Telegram request/chat rejections (400/403)
stop retrying; transient/uncertain upstream, configuration and DB failures do not.

Each intake update uses a stable UUID derived from its sender/update ID as the
pending action key, with ownership checked separately. A retry reuses the
persisted proposal/clarification and exact original buttons. An already consumed
or expired receipt cannot create another proposal, including when approval
committed before the original intake's completion failed. Callback approval
atomically consumes the unexpired owner/sender-scoped PROPOSAL and inserts all
rows. Category owner/type checks and composite foreign keys remain active. Reply
with saved DB values only after commit. A callback-acknowledgment failure cannot
mask an earlier retryable processing failure. Replies can repeat or be uncertain
after network timeouts; finance writes remain idempotent.

Normal successful webhook requests opportunistically delete at most 100 DONE
updates older than seven days, 100 pending actions expired more than seven days
ago and 100 link tokens expired more than one day ago. Action tombstones cover
the update replay window; failed/processing updates remain retryable. No cron,
shared finance cache or raw-message logs. Deployment/live Telegram verification
is explicitly separate from disposable PostgreSQL and mocked-transport evidence.

The deterministic grammar supports explicit money suffixes, a conservative
category keyword map, server-resolved Malaysian dates and explicit purchase
separators. Unknown categories ask for an exact personal category name; ambiguous
or missing money asks for an amount. Unsupported language gets guidance. There
is no AI, casual-yes approval, proposal editing or arbitrary financial query
language. Commands select only fixed scoped database reads. AI Q&A, provider
consent, rate caps and the mocked AI golden set remain Phase 4.

## 2026-11-15 — Phase 4 free-only AI implementation

The owner requested Phase 4 only and required current Gemini free-tier
verification plus approval before credential setup. Implementation is authorized;
account/project/key/dashboard steps, live requests and Phase 5 are not.
No paid service, schema change or dependency was added. Existing Neon config,
Better Auth/session checks, finance DAL and Telegram identity boundary remain.

Google's public pricing lists gemini-3.5-flash-lite standard text input/output
as free, supports structured output and includes Malaysia. Current rate-limit
docs refer to project-specific AI Studio quotas, so we do not invent universal
RPM/TPM/RPD. Free data-use terms allow improvement/human review and prohibit
sensitive/personal input. See the dated sources and approval proposal in
AI_SETUP.md. This experiment is for synthetic, non-sensitive adult Malaysia
portfolio examples; per-user consent does not override provider terms.

Use native fetch behind an AiProvider interface and AI_PROVIDER configuration.
A small direct parser needs no tool loop, SDK or gateway account. The model and
endpoint are fixed; owner Free-project attestation, a server key and current
per-user consent are all required before dispatch. Attestation cannot inspect
billing; an unbilled Free project is the owner's necessary setup condition.
No implicit paid-model failover or automatic alias change is allowed.

Prompt input contains only message, Malaysian today and category names; no
identity/history/DB output. System instructions treat both strings and category
names as data. Strict local Zod schemas validate bounded JSON, including nested
extra-field rejection, required confirmation semantics, null/missing values and
enumerated query parameters. Monetary strings must be original complete source
substrings, then parse with existing Decimal rules. Relative dates resolve on
the server; missing/ambiguous dates extend existing clarification state. Only
the existing explicit callback approval can consume a proposal and write rows.

Fixed scoped ORM query dispatch implements all five specified operations. Each
requires userId and rechecks the sender connection under a user row lock, using
a consistent database snapshot. Exact/alias or unique one-character category
matches are local. Ambiguous/unknown query categories ask for an exact resend.
Responses are templates over actual database results, never model prose.

Consent actions and the consent DAL independently verify real sessions, enforce
owner identity and deny demos. A user row lock serializes consent updates with
bot dispatch permission. Withdrawal blocks subsequent permission checks; a
request already sent cannot be recalled. No consent toggle implicitly approves
provider account setup. Store consent even when AI is unavailable, while clearly
displaying that local rules are being used.

A project advisory transaction lock protects both per-user and project rate
windows, then the live connection/consent is rechecked under the user row lock.
Reserve events before network dispatch; failed/invalid calls consume quota.
User caps default 2/minute, 30/rolling 24 hours, configurable downward; project
caps 4/minute, 30/24 hours. These local caps supplement unknown provider quotas.
An unavailable DB permission/quota check fails closed to local parsing; any
later persistence still independently checks its own identity boundary.

Keep the spec's immediate-processing-message alternative: a five-second AI
deadline covers fetch, bounded streaming read and interpretation; synchronous
work finishes before webhook success within the existing 30-second setting.
after() remains cleanup only, preserving real HTTP retry behavior on killed
invocations without a raw inbox or extra service. A persisted proposal bypasses
AI on retry and retains its stable UUID. Queries may be reparsed/replied after
delivery failure within caps; they have no financial write effects. No hosted
latency guarantee is claimed. Limit violations, missing configuration, model
errors and timeout fall back to the existing deterministic grammar.

The 45-case mocked golden set passes 100%; it measures the application contract
and fail-safe behavior, not real Gemini language accuracy. Provider HTTP is
mocked, database integration uses disposable PostgreSQL-compatible storage and
real sessions, browsers run production Next.js with all DB/AI env overridden.
No live key, provider call, production write, hosting or new remote CI run.

## 2026-11-15 — Phase 5 local polish and gated deployment

The owner requested Phase 5 only, preserving auth, Neon, finance, Telegram and
AI, with explicit approval before provider/dashboard setup or publishing. Local
implementation and documentation are authorized. Gemini setup/live calls remain
unapproved, no paid service is allowed, and Stretch remains outside scope.

Use an immutable public `/demo` snapshot with invented records, exact Decimal
aggregates and visibly labeled sample periods. This gives visitors a read-only
portfolio without a shared account, credentials, fake session or real user data.
It imports no database/session/provider modules and exposes no mutation, linking
or consent controls. Existing demo-user mutation restrictions remain. No live DB
seed or schema change is needed. Only this public synthetic page may be static;
authenticated finance results remain uncached and independently session-scoped.

Polish includes keyboard/active navigation, labeled feedback, touch targets,
wrapping, loading/empty/error/404 states and the installed Next.js recovery API.
The current error-boundary guide documents `retry()` for refetching failed
segments. Next's installed deployment, headers, robots and accessibility guides
were also consulted. Conservative response headers add framing/referrer/MIME and
unused-permission protection. Crawl/noindex controls do not authorize access.

Keep deployment separate from the application build: `npm run build` does not
migrate or seed a database. The runbook orders owner approval, stable free HTTPS
origin, production-scoped configuration/OAuth, migration status, deployment and live
synthetic verification. Existing Neon config and local OAuth credentials are
preserved. Reusing the auth database requires preserving its encryption secret;
do not silently rotate it and strand encrypted provider tokens. Start hosted AI
in deterministic mode with no Gemini key/attestation;
consent cannot approve provider setup. Previews must not inherit production
database or bot credentials. No hosting/project/webhook/publish action was taken.

Record passing local regressions and synthetic screenshots in STATUS.md and
README. The overall Phase 5 done condition still requires an approved public
deployment, secure live webhook and real sign-in/web/Telegram confirmation flow.
No public URL, real bot result, new live Neon/OAuth result or remote CI run is
claimed from local checks. See DEPLOYMENT.md for exact gated owner steps.

## 2026-11-15 — Deployment approval received

The owner explicitly approved completing Vercel deployment/setup and publication
in chat. This authorizes the previously proposed free-only hosting, production
OAuth/Telegram setup and synthetic live verification with the existing Neon
database. Gemini setup/live calls and paid services remain excluded. Connector
access/login actions may still require the owner's own authentication; do not
confuse that technical requirement with a new request for deployment approval.

Add explicit `.vercelignore` exclusions for all environment files, local Neon
configuration, interrupted dependencies, generated clients, build output and
test/browser artifacts before any CLI source upload. Git ignore rules alone do
not define CLI upload contents. No production DB migration or demo seed is added.

## 2026-11-15 — Vercel release and agent setup

Followed the owner's explicitly requested official get-started guide: installed
global Vercel CLI 65.16.0, confirmed the existing globally enabled Vercel plugin,
and added/authenticated the shared user-wide https://mcp.vercel.com server with
Codex's additive configuration command. Other server entries remain. The new
server requires a fresh desktop tool catalogue for its authenticated list_teams
check; do not claim that current-session check passed. The pre-existing desktop
connector has a different account scope, so release operations use the owner's
explicitly authenticated CLI account and verified Hobby workspace `sy-74fc`.

Created and linked `duitflow`, configured Next.js, basic Hobby builds and cle1
functions near the existing Ohio Neon database. Production env uses the same auth
encryption secret and existing pooled DB, with no secret values in arguments or
output. Direct migration credentials and production secrets stay out of previews.
Validated CLI upload inputs and secret exclusions. Git publishing remains manual.

The initial Linux CI run exposed a test-only socket reconnect race after expected
SQL errors. Add two draining TCP slots while keeping the actual Prisma pool at
one connection and retain all identity checks; a repeated-error/session regression
passes. The repaired commit passed all GitHub CI steps (316 tests/28 browsers).
Staged production checks then passed and the public canonical deployment was
promoted. Unauthenticated public HTTP and browser/Neon readiness checks passed.
Record exact IDs and later bot enablement in STATUS.md; no live Gemini calls.

Owner browser actions remain distinct from automation evidence. The owner reports
the extra GitHub callback is added and saved bot credentials locally. Computer
use stopped on unverifiable Windows browser URL, so do not automate around that
safeguard or fabricate a session. Validate/register Telegram through its official
API with bounded, secret-redacted requests and verify real owner flows separately.

## 2026-11-15 — Phase 5 complete

The final Telegram-enabled production deployment is READY and promoted:
`dpl_F4skacS8mqYwV3KKr8WdsXChoCsL`, source
`9bd3995bc28f21530a440ea7f59d34048343598a`. Its source CI run 43702137694
passed every step, including 316 unit/integration tests and 28 browser tests.
Public readiness and anonymous authorization checks passed again after release;
fourteen deployed public HTML/JS resources contain none of the configured app
credentials checked. This is bounded verification, not a security certification.

Telegram's official API validated the owner's bot credentials and registered
the canonical HTTPS webhook with a generated secret, message/callback filters
and one connection. Public missing-secret/valid-secret unsupported-body probes
returned 401/200. After the owner's live smoke, getWebhookInfo still reported
zero pending updates and no delivery error; the recent five-minute request scan
contained no 5xx records. Credentials stayed in ignored local/server secret
storage and never appeared in command arguments, output or screenshots.

The owner explicitly confirmed their real production dashboard opened, then
reported all requested live checks passed: web create/edit/delete, Telegram
link/Start, one synthetic confirmed expense, re-tap without duplicates, and
sign-out/re-login. These are owner-confirmed UI results, separate from the
agent's automated HTTP/browser/provider-status checks. Real auth and authorized
synthetic finance writes naturally occurred during those flows; no production
fixture migration, auth bypass or account impersonation was used. Live unlink
was not repeated; its authorization/invalidation regressions remain automated.

Phase 5 closes with the free deterministic parser. Gemini credentials, dashboard
setup and live calls remain unapproved; free-tier provider terms and project
quotas must be rechecked if a later request authorizes them. No Stretch feature,
paid service, automatic Git publishing or extra backend was introduced.

## 2026-11-15 — Shared MCP verification complete

On the subsequent chat turn the new shared Vercel tools loaded and confirmed
the same `shahrilyusoff11` account and Hobby workspace used by the CLI. A team
grant was still required independently of account login. The owner completed
the SY grant; an immediate read remained forbidden, and a bounded later retry
on that same connection succeeded. The brief 403's cause was not established.
Documentation search, authenticated `list_teams` returning SY and explicit
known-team `get_project` for DuitFlow now pass. The earlier tool-catalogue/access
limitation is closed without reconnecting, removing other servers, exposing
tokens or weakening mutation confirmations. Vercel agent setup is complete.

## 2026-11-18 — DeepSeek Flash replaces the planned Gemini provider

Use `deepseek-flash` on DeepSeek's direct Chat Completions API. It supports
JSON mode and disabling thinking. The model receives the existing minimal
payload and a schema in the system prompt. Local Zod validation, the five-second
deadline, PostgreSQL quotas and explicit Telegram approval still apply.
[Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/)

DeepSeek bills by token and deducts granted credits first. Keep the local parser
as the default. The owner subsequently approved metered usage on the existing
DeepSeek balance. The app requires a key and user opt-in, and keeps its existing
PostgreSQL call caps. [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/)

Consent names the data recipient, so DeepSeek uses a new flag that defaults off
for every account. Retain the legacy column for compatibility with the previous
release. Deploy the additive migration before the updated app. Settings consent
and the Telegram dispatch check both use the new flag.

## 2026-11-18 — Telegram privacy hardening

The backend handles money, dates, descriptions and supported financial
questions locally. DeepSeek can suggest generic categories using numbered
clauses containing app-owned vocabulary. The adapter validates that projection
before network I/O. The bot requires web confirmation for new links, locks the
connection during scoped reads and checks its identity before sensitive replies.
Postgres throttles new messages, link attempts and callbacks independently.
Terminal action rows retain their replay identity while dropping their payload.
