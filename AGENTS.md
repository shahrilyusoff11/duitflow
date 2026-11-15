<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# DuitFlow repository instructions

Read `DUITFLOW_CODEX_SPEC.md`, `docs/DECISIONS.md`, and `docs/STATUS.md` first.

## Current scope and approval gates

- Phase 1 is complete: live OAuth/Neon checks and GitHub CI passed on commit
  108874011e8af3f8fe733297b650ef3ee20749ba (run 43630396318). The owner requested
  Phase 2 web finance on 15 November 2026; its implementation and local evidence
  are recorded in docs/STATUS.md. The owner requested Phase 3 Telegram on
  15 November 2026; its local implementation/evidence is in docs/STATUS.md.
  The owner requested Phase 4 free-tier AI implementation on 15 November 2026.
  Its implementation/evidence is in docs/STATUS.md. The owner requested Phase 5
  polish/demo/deployment preparation on 15 November 2026. Complete local work,
  The owner approved Vercel deployment, provider setup and publishing in chat on
  15 November 2026. Complete the approved free-only deployment without asking
  for that approval again. Gemini setup/live calls remain excluded.
  Stop before Stretch features. See docs/DEPLOYMENT.md for the release workflow.
  Gemini credential/account/dashboard setup and live calls still require explicit
  approval; see docs/AI_SETUP.md. No paid service is authorized.
  The owner approved Better Auth + GitHub-only OAuth +
  PostgreSQL database sessions in chat on 15 November 2026. Implement this scope
  without asking for the same approval again. See `docs/AUTH_PROPOSAL.md`.
- Neon setup via CLI is explicitly authorized: org-withered-mountain-16883150,
  project solitary-hill-74765097, branch production. The database is configured
  and migrated. Keep the owner's existing neon.ts and other agent configuration.
- GitHub OAuth credentials are configured locally; real sign-in, sign-out,
  protected-page redirect and re-login were verified on 15 November 2026. Never
  print credentials, impersonate another user, or bypass real sessions.
- Do not start Phase 2 until all Phase 1 acceptance checks pass, including real
  OAuth sign-in, scoped server session checks, and PostgreSQL migration checks.
- Ask before account/API-key dependencies or dashboard actions. Never provision
  resources, accept billing terms, or enable paid services without authorization.
- Keep README and the acceptance checklist honest and current.

## Commands

Use npm and Node 24 LTS (Node 26 is supported for local development).

| Task | Command |
| --- | --- |
| Install | `npm ci` |
| Develop | `npm run dev` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Unit + migration tests | `npm test` |
| Production build | `npm run build` |
| Start production | `npm start` |
| Browser tests | `npx playwright install chromium`, then `npm run test:e2e` after build |
| Generate Prisma | `npm run db:generate` |
| Validate schema | `npm run db:validate` |
| Draft migration | `npm run db:migrate -- --name descriptive_name` |
| Apply reviewed migrations | `npm run db:deploy` |
| Migration status | `npm run db:status` |
| Initialize ignored env/secret | `npm run setup:init` |
| Check env format (no values printed) | `npm run setup:check` |
| Read-only DB preflight | `npm run db:preflight` |
| Real Neon round-trip (synthetic data, always rolled back) | `npm run verify:neon` |
| Running app/browser/database check | `npm run verify:app` |

`db:migrate` creates SQL for review; it requires a disposable development DB and
may require a shadow DB. Never accept a reset against a database with real data.
Use `db:deploy` to apply reviewed SQL. Prisma 7.10 uses `prisma7.config.ts`, with
`DATABASE_URL_UNPOOLED` (preferred) or `DIRECT_URL` for CLI migrations and pooled
`DATABASE_URL` for the application. No database URL
is required for lint, tests, typecheck, generate, or build.

## Folder conventions

- `src/app/`: App Router pages, layouts and route handlers. UI defaults to ms-MY.
- `src/lib/config/`: validation that does not log values or secrets.
- `src/lib/db/`: server-only low-level connection; import only in auth or DAL.
- `src/lib/finance/`: scoped finance DAL, money/date validation and aggregates.
- `src/lib/telegram/`: private-chat validation, deterministic parser, scoped
  connection-based DAL, atomic approvals, update leases and bounded transport.
- `src/lib/ai/`: fixed Gemini adapter, strict untrusted output validation,
  minimal payload, consent DAL, query rendering and deterministic fallback.
  `AI_PROVIDER` defaults to deterministic; Gemini also requires an owner Free
  project attestation and per-user consent. Never treat local caps as provider quotas.
- `src/generated/prisma/`: generated, ignored; regenerate instead of editing.
- `prisma/migrations/`: reviewed, append-only SQL. Preserve raw CHECK constraints
  and the pending-action partial index when drafting future migrations.
- `tests/unit/`, `tests/integration/`, `tests/e2e/`: synthetic data only.
- `docs/`: decisions, approvals, evidence, and remaining work.

## Data, money and date rules

- Every user-owned data-access function requires `userId`. Every browser action,
  page, handler and DAL entry verifies the real session itself; a layout or proxy
  check alone is insufficient. Telegram webhooks verify their secret before
  parsing, derive identity from the private-chat sender, and every scoped bot DAL
  entry rechecks the live connection under a user row lock. Never fabricate a web
  session for Telegram or weaken the web finance DAL's session checks.
- Scope all reads, updates and deletes by the authenticated user's ID. Never
  trust a user ID from a browser, Telegram payload, or model output.
- The reviewed User INSERT trigger seeds defaults in the signup transaction.
  Preserve it; do not replace it with an after-commit hook.
  The DB also enforces category ownership and matching type via composite keys.
- Store positive money in DECIMAL(12,2). Parse strings, use decimal arithmetic on
  the server, serialize as strings. Never use float arithmetic or parseFloat.
- `occurredOn` is a Malaysian local calendar DATE, not an instant. Resolve
  relative dates on the server in Asia/Kuala_Lumpur. Query month ranges as
  [first day, first day of next month). Audit timestamps use UTC TIMESTAMPTZ.
- Telegram proposals require atomic, explicit approval. AI is untrusted input;
  it never authorizes writes or supplies user IDs, SQL, or financial totals.
- Retry the same Telegram message with its stable pending-action UUID. Retain
  action tombstones for the update dedupe window. DONE replays return 200; active
  leases return retryable 503 so a killed invocation cannot lose its retry.

## Do not

- No paid plans, payment methods, purchases, real transfers, or banking credentials.
- No Redis, separate backend service, message broker, or required Docker runtime.
- No password login, auth bypass, demo write access, or fake successful handlers.
- No secrets or raw financial messages in logs, fixtures, commits, or screenshots.
- Browser fixtures explicitly override DATABASE_URL_UNPOOLED as well as
  DATABASE_URL and DIRECT_URL. Never let automated fixture migrations use .env's
  production credentials. Run live Neon checks only when explicitly authorized.
- No runtime SQL from AI/parser output, live AI calls in CI, or AI without user opt-in.
- Keep Gemini to the reviewed free-eligible model; no paid fallback/automatic
  model change. Five-second AI deadline; Postgres caps reserve before dispatch.
- No Stretch features or empty placeholder navigation before Core passes.
- The public /demo is an immutable synthetic snapshot, separate from user data.
  Never turn it into a session bypass, add write controls, or enable Telegram/AI.
- No cross-user caching of authenticated results. Shared finance caches are off.

Run lint, typecheck, unit/integration tests and build at each phase boundary;
report actual results. Run meaningful browser tests for the implemented flows.
