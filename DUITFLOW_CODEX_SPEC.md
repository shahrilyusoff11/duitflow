# DuitFlow — Codex Build Specification (v2)

> **Purpose:** Primary implementation brief for an AI coding agent (Codex). Build a working, testable, documented MVP, not a UI mockup.
>
> **Language:** English for code, database names, commit messages and technical docs. User-facing UI and Telegram messages default to Bahasa Melayu (Malaysia), MYR currency, `Asia/Kuala_Lumpur` timezone.
>
> **Budget constraint:** Target **RM0/month** for a small, personal, non-commercial portfolio MVP on free tiers. Free tiers have quotas and terms that change. **Never enable paid billing, add a payment method, or accept a paid upgrade without explicit human approval.** If a provider requires billing for a feature, stop and propose a free alternative. No paid AI API by default.

## 0. Changes from v1 (for the human reader)

- Added scope tiers: **Core** (Phases 1–4) vs **Stretch**. Do not start Stretch until Core is done and passing.
- Added conversational **clarification state** and a **webhook processing state machine** (no lost messages on retry).
- Changed transaction dates to a local **`occurredOn` DATE** so Kuala Lumpur month boundaries are correct.
- Fixed category uniqueness with nullable `userId`; renamed finance accounts to `FinancialAccount` (Stretch).
- Added Auth.js caveats, Telegram specifics, atomic approval pattern, enumerated query operations, Postgres-based rate limiting, money-parsing rules, per-user AI opt-in, golden-set tests, demo-mode rules, lazy cleanup, `AGENTS.md`, and "stop and ask" points.

## 1. Product summary

**DuitFlow** is a responsive personal finance web app with a Telegram bot and an AI-assisted natural-language transaction parser. Users manage income, expenses and budgets through a web dashboard, and can send natural Bahasa Melayu/English messages to a Telegram bot, review proposed transactions, and confirm saving them.

**Core promise:** "Catat belanja melalui chat, pantau bajet melalui dashboard."

**Non-goals for MVP:** bank integrations, real transfers, payments, investments, financial advice, receipt OCR, voice notes, native mobile app, team accounts, multi-currency conversion.

## 2. Scope tiers

**Core (must ship):** auth, categories, transactions CRUD, dashboard aggregates, monthly budgets, Telegram linking, Telegram commands, confirmed natural-language intake, deterministic fallback parser, Gemini parser, core tests, deployment, README.

**Stretch (only after Core passes all acceptance criteria):** Recurring Commitments, `FinancialAccount` (multiple wallets/accounts), CSV export, expanded Playwright coverage, Telegram proposal editing.

If a Stretch feature is skipped, remove it from the UI and navigation. Do not leave placeholder pages.

## 3. Mandatory technology stack

- **Application:** Next.js App Router, TypeScript (strict), React. Bootstrap with `create-next-app@latest` and use current stable versions. Do not rely on memorized APIs; check current docs for routing, middleware/proxy naming, `after()`/`waitUntil`, and caching behavior.
- **Styling:** Tailwind CSS and shadcn/ui (or accessible custom components).
- **Database:** Neon PostgreSQL (free tier) via a conventional connection string so the provider is replaceable.
- **ORM/migrations:** Prisma with a reviewed migration workflow (`prisma migrate`). Use the **pooled** URL for the app (`DATABASE_URL`) and the **direct** URL for migrations (`DIRECT_URL`). Document Neon autosuspend cold starts.
- **Authentication:** Auth.js, subject to the checks in §3.1.
- **Validation:** Zod for all untrusted input, including AI output and Telegram payloads.
- **AI:** Google Gemini API with a model **currently eligible for a free API tier**, behind an `AI_PROVIDER` abstraction. Verify current quotas/terms before choosing a model. A **zero-cost deterministic parser fallback** is mandatory.
- **Telegram:** Bot API with HTTPS webhook via a Next.js Route Handler.
- **Charts:** Recharts or equivalent lightweight open-source library.
- **Testing:** Vitest (unit/integration), Playwright (critical browser flows only in Core).
- **Hosting:** Vercel Hobby (non-commercial portfolio use, within provider terms); GitHub for version control.
- **Package manager:** npm unless the repo already uses another.

Do not add a separate backend service, Redis, message broker, paid infrastructure, or a Docker deployment requirement. Docker is optional for local testing only.

### 3.1 Auth decision (STOP AND ASK before implementing)

Before writing auth code, check the current status and recommended usage of Auth.js and report the chosen approach to the human. Considerations:

- **Prefer OAuth-only (GitHub and/or Google).** It avoids password hashing and reset flows on serverless and needs no email provider.
- Credentials (email/password) login in Auth.js forces JWT sessions, so a database `Session` model would be unused. If credentials are used, hash with a modern, maintained algorithm (argon2id or bcrypt with a sensible cost), rate-limit attempts, and document the trade-offs.
- Magic-link/email login needs an email provider, which is another free-tier dependency. Avoid unless the human approves.
- Do not create unused Auth.js tables. Only add models required by the chosen adapter/session strategy.
- Middleware is not sufficient. **Every server action, route handler and data-access function must verify the session itself.**

## 4. Product requirements

### 4.1 Accounts and identity

- Users register/sign in, sign out, and access only their own data.
- Every query/update/delete of user-owned data is scoped by the authenticated `userId` (use a data-access layer that requires `userId` as a parameter).
- Users link/unlink Telegram from a protected Settings page.
- Linking uses a **short-lived, single-use, server-generated token** tied to the signed-in user. Constraints:
  - Telegram `/start <payload>` payloads are limited to **64 characters of `A-Za-z0-9_-`**. Generate the token accordingly (e.g. base64url of 24–32 random bytes, within the limit).
  - Store only a hash of the token. Expire in ~10 minutes. Mark `consumedAt` atomically on redemption.
- Never trust a `telegram_user_id` submitted from the browser.
- One Telegram identity cannot connect to multiple accounts. Handle conflicts safely with a clear message; do not silently re-link.
- **On unlink:** delete the `TelegramConnection` and invalidate (consume or delete) all that user's pending Telegram actions.

### 4.2 Financial dashboard

- For the selected month: total income, total expenses, net (`income − expense`), budget progress, expense breakdown by category, recent transactions, monthly trend chart.
- MYR formatting is consistent; empty/loading/error states are sensible.
- Label "net" accurately as **recorded net income minus recorded expenses for the period**, not an account balance.
- All aggregates are computed on the server from DB data.

### 4.3 Dates and time (important)

- Store the transaction's **local Malaysian calendar date** as `occurredOn` (`DATE`, no time-of-day). Use it for all monthly grouping, filtering, budgets and reports. This avoids UTC boundary errors (e.g. 1 Nov 00:30 MYT would be 31 Oct in UTC).
- Store `createdAt`/`updatedAt` as UTC timestamps.
- "Today", "semalam", "kelmarin", "minggu lepas" etc. are resolved **on the server** using `Asia/Kuala_Lumpur`. The AI may propose a relative expression or a candidate date, but the server validates and computes the final date.
- Month ranges are computed as `[firstDay, firstDayOfNextMonth)` on `DATE` values.
- Add unit tests around month boundaries (31 Oct → 1 Nov, 31 Dec → 1 Jan, leap day).

### 4.4 Money handling

- Persist as `DECIMAL(12,2)` (or integer sen). **No floating-point math on persisted values.**
- Use a decimal library (e.g. `decimal.js` or Prisma `Decimal`) for server arithmetic.
- **Serialize Decimals as strings** to the client. Never `parseFloat` money.
- Amounts must be positive; the sign is carried by `type` (`INCOME`/`EXPENSE`).
- Parse user-entered and chat amounts from **strings via regex into Decimal**. Supported forms (with tests):
  - `RM12`, `RM 12`, `rm12.50`, `RM1,200`, `RM1,200.50`
  - `12 ringgit`, `12 ringgit 50 sen`
  - `1.2k`, `2k` (thousands shorthand), `50 sen`
  - Reject: more than 2 decimal places (after normalization), negatives, zero, amounts above a sane maximum (e.g. 10,000,000), and ambiguous formats such as `1.200` (ask for clarification).

### 4.5 Transactions

- Add, list, view, edit, delete income/expense transactions on the web.
- Fields: `amount`, `type`, `categoryId`, `description`, `occurredOn`, `source` (`WEB`/`TELEGRAM`), `createdAt`, `updatedAt`. (`financialAccountId` only if the Stretch feature is built.)
- Filter by date range, category, type; optional description search; **cursor or offset pagination** with a max page size.
- Categories are either per-user or read-only seeded defaults. Reject any cross-user category reference and any category whose `transactionType` does not match the transaction type.
- **Category uniqueness:** with nullable `userId`, a plain `UNIQUE(userId, name, type)` does not prevent duplicate global defaults in PostgreSQL. Either (a) seed defaults **per user** at signup (simplest, recommended), or (b) use two partial unique indexes via raw SQL migration (`WHERE userId IS NULL` and `WHERE userId IS NOT NULL`). Document the choice.

### 4.6 Budgets (Core) and recurring commitments (Stretch)

- Monthly budget per expense category. Show spent vs. limit and remaining; warn at configurable thresholds (defaults 80% and 100%).
- **Recurring commitments (Stretch):** planning records only (name, amount, category, cadence, next due date, active flag). Do **not** auto-create transactions. Do not include planned commitments in "spent" totals, to avoid double counting. If a posting workflow is ever added, it must be explicit, opt-in and idempotent.

### 4.7 Telegram bot

- Webhook endpoint: `POST /api/telegram/webhook`.
- **Security checks, in order:**
  1. Verify the `X-Telegram-Bot-Api-Secret-Token` header using a **constant-time comparison** against `TELEGRAM_WEBHOOK_SECRET`. Wrong or missing secret → `401`.
  2. Enforce a max request body size; parse JSON; validate the update with Zod.
  3. Process only `message` and `callback_query` updates (set `allowed_updates` accordingly in `setWebhook`).
  4. **Reject non-private chats** (groups/channels): reply briefly or ignore; never expose financial data outside a private chat.
- **Return `200` for everything that is authentic**, including unsupported, ignored or malformed-but-authentic updates, so Telegram does not retry endlessly. Reserve `401` for bad secrets and `5xx` only for genuinely retryable internal failures.
- **Update deduplication as a state machine**, not a bare unique insert:
  - `TelegramUpdate(telegramUpdateId unique, status RECEIVED | PROCESSING | DONE | FAILED, attempts, lockedAt, updatedAt)`.
  - On a new update: insert as `PROCESSING`. On a duplicate: if `DONE`, ignore; if `PROCESSING` and recently locked, ignore; if `FAILED` or a stale lock, resume/retry.
  - This prevents a timeout during a slow AI call from causing Telegram's retry to be dropped and the user's message to vanish.
- **Serverless timing:** do not hold the webhook open for slow work. Acknowledge quickly and run AI parsing and replies after responding using the framework-supported post-response mechanism (e.g. Next.js `after()` / Vercel `waitUntil`; verify current availability and limits for Vercel Hobby). Alternatively send an immediate "Sedang memproses…" message, then follow up. Always set a timeout on AI calls and fall back to the deterministic parser on timeout.
- **Commands:** `/start`, `/help`, `/link`, `/balance`, `/budget`, `/report`, `/cancel`.
- Only expose financial data after the Telegram identity is linked. Unlinked users get helpful instructions.
- **Natural-language intake examples:**
  - `Makan nasi ayam RM12`
  - `Tadi beli kopi RM8 lepas tu isi minyak RM40`
  - `Gaji masuk RM2500`
  - `Berapa aku belanja makan bulan ni?`
  - `Baki bulan ni berapa?`
- **Confirmation:** proposed transactions are **never saved without explicit confirmation** via inline buttons (Sahkan / Batal). Do not interpret a casual "ya" as approval unless it is tied to a specific pending proposal.
  - `callback_data` is limited to **64 bytes**. Put only the **pending action UUID** (and a short action code) in it, never the payload.
  - Always call `answerCallbackQuery` so the button spinner stops.
  - Verify on callback: the pending action belongs to the linked user whose `telegramUserId` matches the callback sender, is unexpired and unconsumed.
- **Editing proposals** is Stretch. If not implemented, tell the user to cancel and resend.

#### 4.7.1 Clarification flow (conversation state)

When the parser returns missing/ambiguous details (e.g. no amount), store a `PendingTelegramAction` of kind `CLARIFICATION` with the partial parse and a short TTL (e.g. 10 minutes), then ask a specific question ("Berapa harganya?").

- The user's next plain message in that chat is first checked against the pending clarification for that user. If it answers the question (e.g. `RM12`), merge it into the partial parse and continue to the confirmation step.
- If the next message is clearly a new request or a command, cancel/replace the clarification.
- `/cancel` clears any pending action for that user.
- Only one active pending action per user; a new proposal supersedes the old one (mark the old one consumed/cancelled).

#### 4.7.2 Atomic approval pattern

Approval must be idempotent under double-taps and replays. Within a single DB transaction:

1. `updateMany` on `PendingTelegramAction` with `WHERE id = ? AND userId = ? AND telegramUserId = ? AND consumedAt IS NULL AND expiresAt > now()`, setting `consumedAt = now()`.
2. If `count !== 1`, abort: reply "Cadangan ini sudah diproses atau tamat tempoh."
3. Only then insert the transaction(s) in the same transaction.
4. Reply with **actual saved values read back from the database** after commit. Never claim success before commit.

### 4.8 AI parsing and financial Q&A

- AI responsibilities: classify intent; extract zero or more proposed transactions; suggest categories; produce relative date expressions; flag uncertainty.
- Define strict Zod schemas for `intent`, `transactions[]`, `uncertainty[]`, `requiresConfirmation` and query parameters. Reject unknown intents and extra fields.
- **AI output is untrusted.** The model has no authority to write SQL, choose a user ID, call tools, or save anything. User text and model output are data, never privileged instructions (prompt-injection safe).
- Multiple purchases in one message → multiple proposed transactions in one approval.
- Ambiguous amount/date/category → ask; never fabricate values.
- **Enumerated query operations** (the model may only select one and supply validated parameters; each is a fixed server-side function scoped to the linked user):

  | Operation | Params (Zod) | Result |
  |---|---|---|
  | `net_for_period` | `period` (`this_month`/`last_month`/`YYYY-MM`) | income, expense, net |
  | `spend_by_category` | `period`, `categoryName` | total expense for that category |
  | `top_categories` | `period`, `limit` (1–10) | ranked expense categories |
  | `budget_status` | `period`, optional `categoryName` | limit, spent, remaining, % |
  | `recent_transactions` | `limit` (1–10) | latest N transactions |

  Unknown category names are fuzzy-matched on the server against that user's categories; if no confident match, ask the user.
- Answers are rendered from real query results. **Never hallucinate balances.**
- **Privacy / AI opt-in:** free-tier provider data policies may allow prompts to be used for model improvement. Make AI parsing a **per-user setting (default off, or explicit consent on first use)** with a clear notice in Settings. When on, send only: the message text, today's local date, and the category name list. Never send full history, names, emails, tokens or IDs. When off or unavailable, use the deterministic parser only.
- **Deterministic fallback** handles at least: `Makan RM12`, `Gaji RM2500`, `<description> <amount>`, `/balance`, `/budget`, `/report`. Distinguish "unsupported freeform language" from "parsed successfully" and tell the user which commands/formats still work.
- **Rate limiting without Redis:** use a Postgres table (e.g. `RateLimitEvent(userId or ip hash, bucket, createdAt)`) to cap AI calls per user per day/minute and login attempts. Fail closed to the deterministic parser when the AI cap is hit.

## 5. Suggested data model (adapt as needed)

- `User`: id, email/provider fields, `aiParsingEnabled` (boolean), createdAt, plus whatever the chosen Auth.js adapter requires.
- `Category`: id, `userId` (nullable only if global defaults are used), name, `transactionType`, createdAt; uniqueness per §4.5.
- `Transaction`: id, userId, categoryId, type (`INCOME`/`EXPENSE`), amount `Decimal(12,2)`, description, **`occurredOn` Date**, source (`WEB`/`TELEGRAM`), createdAt, updatedAt. Indexes: `(userId, occurredOn)`, `(userId, categoryId, occurredOn)`.
- `Budget`: id, userId, categoryId, year, month, `limitAmount Decimal(12,2)`; unique `(userId, categoryId, year, month)`.
- `TelegramConnection`: id, `userId` unique, `telegramUserId` unique (string or BigInt), linkedAt.
- `TelegramLinkToken`: id, userId, `hashedToken` (unique), expiresAt, consumedAt nullable.
- `TelegramUpdate`: `telegramUpdateId` unique, status (`RECEIVED`/`PROCESSING`/`DONE`/`FAILED`), attempts, lockedAt, updatedAt.
- `PendingTelegramAction`: id (UUID), userId, telegramUserId, kind (`PROPOSAL`/`CLARIFICATION`), validated JSON payload (or normalized child rows), expiresAt, consumedAt, createdAt.
- `RateLimitEvent`: key, bucket, createdAt (indexed for window queries).
- **Stretch:** `FinancialAccount` (id, userId, name, type, createdAt), optional `financialAccountId` on `Transaction`; `RecurringCommitment` (id, userId, categoryId, name, `amount Decimal(12,2)`, cadence, nextDueOn Date, isActive, createdAt, updatedAt). Name finance accounts `FinancialAccount` to avoid collision with Auth.js `Account`.

Cascade deletes only where appropriate (e.g. deleting a user removes their data; deleting a category in use must be blocked or reassign).

## 6. System architecture and flows

```text
Browser (Next.js React UI)        Telegram User
            |                           |
            |                    Telegram Bot API
            |                           |
            v                           v
    Server actions            /api/telegram/webhook
            |                           |
            +--- Auth / validation / business logic ---+
                              |
               Optional Gemini parser (free tier, opt-in)
                              |
                      Zod validation
                              |
               Pending action (confirm / clarify)
                              |
                        Prisma ORM
                              |
                      Neon PostgreSQL
```

**Create-transaction flow:** verify secret → size/schema check → private-chat check → dedupe state machine → resolve linked user → (after ack) parse (AI if opted in and under rate limit, else deterministic) → Zod-validate → server resolves dates/categories → store pending proposal or clarification → reply with inline buttons → on callback, verify ownership → atomic approval (§4.7.2) → reply with saved totals read from DB.

**Query flow:** linked user → map intent to an enumerated operation → validated params → server queries own records → format MYR from Decimal strings → reply.

## 7. Security and reliability

- Secrets are server-side env vars only; never `NEXT_PUBLIC_`. `.env.example` has placeholders only; `.env*` with secrets is git-ignored.
- Validation, authentication and object-level authorization on **every** read and mutation.
- Do not log raw financial messages, tokens or secrets. Log update IDs, statuses and error codes.
- Prevent replay/duplicates via the update state machine, single-use pending actions and DB transactions.
- Pagination, request-size limits and defensive error handling throughout.
- No external analytics/tracking of finance data.
- Do not claim success until the DB commit.
- **Lazy cleanup:** Vercel Hobby cron is very limited, so do not depend on it. Delete expired pending actions and old `TelegramUpdate` rows (e.g. >7 days) opportunistically during normal requests (bounded batch size) and document this. If cron is available within free limits, it may be used as a bonus, not a requirement.
- Document backup/export limitations of Neon free tier. CSV export is Stretch.
- No real banking credentials or bank-connection features.
- Add a short privacy note in the README. If anyone other than the owner will use the app, mention Malaysia's PDPA (Personal Data Protection Act 2010) obligations and that the app is not reviewed for real-world financial data without a proper security and privacy review.

## 8. UX requirements

- Clean, modern, responsive (desktop and mobile).
- Pages (Core): Landing (optional), Sign in, Dashboard, Transactions, Budgets, Settings / Telegram connection. Recurring Commitments only if built (Stretch).
- Loading skeletons, error feedback, success toasts, accessible labels, keyboard navigation.
- Default Bahasa Melayu labels, MYR, Malaysian date formatting (`ms-MY`).
- **Demo mode (strongly preferred):** a seeded demo account with fake data only.
  - Make it **read-only** or auto-reset on a schedule/lazily (e.g. reset on login if stale).
  - **Block Telegram linking and AI parsing** for the demo user.
  - Never allow demo credentials to access real data paths.

## 9. Deployment

- Vercel Hobby with a public HTTPS `*.vercel.app` URL; no paid custom domain.
- Neon connection (pooled for app, direct for migrations), env vars set in provider dashboards.
- Configure the Telegram webhook with `setWebhook`, a secret token, `allowed_updates: ["message","callback_query"]`.
- Webhook mode needs no persistent bot server.
- README must include instructions to **rotate** the Telegram bot token (BotFather `/revoke`), the webhook secret and the Gemini key if leaked, and to re-run `setWebhook` afterwards.
- Document free-tier quotas, database autosuspend/cold starts, privacy terms and provider term limits without implying they are unlimited.
- Do not call the app production-ready for real financial data without a security and privacy review.

## 10. Repository structure (illustrative)

```text
AGENTS.md
src/
  app/
    (auth)/
    (dashboard)/
      dashboard/ transactions/ budgets/ settings/
      commitments/        # Stretch
    api/telegram/webhook/route.ts
  components/{finance,ui}/
  lib/
    auth/ db/ finance/ ai/ telegram/ validation/ ratelimit/
  types/
prisma/{schema.prisma,migrations/}
tests/{unit,integration,e2e,fixtures}/
.env.example
README.md
```

Guide only; prefer a coherent, maintainable structure.

## 11. Build phases

At the end of each phase run lint, typecheck, tests and build, and report **actual** results. Do not start the next phase until the current one passes.

### Phase 1 — Foundation
1. Bootstrap with `create-next-app@latest` (TypeScript strict, ESLint, Tailwind, App Router).
2. Add shadcn/ui, Prisma, Neon-compatible config (`DATABASE_URL` + `DIRECT_URL`).
3. **Stop and ask** the human to confirm the auth approach (§3.1), then implement auth and a protected layout with per-function session checks.
4. Schema + migrations. Seed default categories (per-user at signup or via partial indexes).
5. `.env.example`, README setup, `AGENTS.md`, basic CI (lint, typecheck, test, build).

**Done when:** sign-in works, protected pages are gated, schema migrates, tests/lint/typecheck/build pass.

### Phase 2 — Finance MVP (Core)
1. Category and transaction CRUD with `occurredOn` DATE semantics.
2. Dashboard aggregates computed server-side from Decimal values.
3. Monthly budgets with progress and thresholds.
4. Unit/integration tests: money math, money-string parsing, KL month boundaries, cross-user access denial, category/type mismatch rejection.

**Done when:** a user can track income/expenses on the web with correct MYR totals and month boundaries.

### Phase 3 — Telegram integration
1. Webhook with constant-time secret check, size limit, Zod validation, private-chat check, `200` semantics.
2. Update state machine (`RECEIVED/PROCESSING/DONE/FAILED`) and fast-ack / post-response processing.
3. Link-token flow (hashed, single-use, expiring, ≤64-char payload); unlink invalidates pending actions.
4. Commands `/start /help /balance /budget /report /cancel`.
5. Pending actions with confirm/cancel/expiry, `answerCallbackQuery`, atomic approval (§4.7.2), clarification state (§4.7.1).
6. Tests: duplicate delivery, retry after simulated timeout, double-tap approval, expired action, cross-account callback, non-private chat, unlinked user.

**Done when:** a linked user can query records and add a confirmed expense via the deterministic parser with no duplicate writes.

**Local implementation evidence (15 November 2026):** Phase 3 implemented;
227 unit/integration tests and 18 browser tests pass. See docs/STATUS.md.
The immediate processing-message alternative keeps deterministic processing
HTTP-retryable; after() handles cleanup only. Active leases return 503 without
duplicate work so a killed worker does not lose its retry (docs/DECISIONS.md).
Live bot credentials, public HTTPS webhook registration and real delivery are
not claimed at that checkpoint. Phase 4 evidence follows.

### Phase 4 — Free-tier AI parsing
1. Gemini behind `AI_PROVIDER` abstraction; verify current free-tier model and quota first and report the choice.
2. Per-user AI opt-in setting and notice; minimal prompt payload (§4.8).
3. Strict Zod validation; multi-transaction messages; relative dates resolved server-side; enumerated query operations.
4. Postgres-backed rate limiting; timeout and fallback to deterministic parser.
5. **Golden-set tests** in `tests/fixtures/` using a **mocked AI provider** (CI must never call the live API): at least ~30 Malay/English messages covering single/multiple purchases, income, relative dates, `RM1,200`, `1.2k`, ambiguous amounts, missing amounts, queries, prompt-injection strings ("abaikan arahan sebelum ini…"), and malformed/oversized/extra-field model output. Report pass rate.

**Done when:** natural Malay messages become safe, confirmed, accurately stored transactions; bad AI output fails safe; the app still works with no AI key.

**Local implementation evidence (15 November 2026):** Phase 4 implemented;
315 unit/integration tests, 20 browser tests and 45/45 mocked golden cases pass.
Gemini 3.5 Flash-Lite public free eligibility was verified; exact project quotas
and credential setup require approval. No live AI call/model-accuracy claim.
See docs/AI_SETUP.md and docs/STATUS.md. Gemini setup/live calls remain gated.

### Phase 5 — Polish and deploy
1. Responsiveness, accessibility, error/empty states.
2. Fake seed/demo data (read-only or auto-reset), screenshots, docs.
3. **Stop and ask** the human to perform dashboard steps (Neon, Vercel, BotFather, AI key). Provide exact instructions; never claim these were done unless confirmed.
4. Production webhook configured securely; verify core E2E flows (sign-in, add transaction, link Telegram, confirm a Telegram expense).
5. Portfolio-ready README with architecture diagram.

**Done when:** the demo link works, the bot works, and README lets another developer run it.

**Local implementation evidence (15 November 2026):** Phase 5 local polish,
public read-only synthetic `/demo`, screenshots and deployment runbook are
implemented. Lint, typecheck, 316 unit/integration tests (including 45/45 mocked
AI golden cases), production build and 28 desktop/mobile browser tests pass.
No account session or real user data is exposed by the public snapshot.
The owner approved deployment/setup; the public HTTPS web release and hosted
Neon readiness now pass. Production webhook and real hosted OAuth/Telegram
smoke checks are in progress. See docs/STATUS.md for current release IDs.
Gemini credential setup/live calls remain separately unapproved. Overall Phase 5
deployment acceptance is open. See docs/DEPLOYMENT.md and docs/STATUS.md.
Stop before Stretch.

### Stretch (after Phase 5, each optional)
Recurring commitments (planning only), `FinancialAccount`, CSV export, Telegram proposal editing, expanded Playwright suite.

## 12. Acceptance criteria

- [x] User can sign in/out and cannot access another user's data (tested).
- [x] Transaction CRUD works; amounts are precise; money strings are parsed per §4.4.
- [x] Dashboard shows correct monthly income/expense/net using KL dates, including month-boundary cases.
- [x] Budgets behave consistently; planned commitments (if built) are never double-counted.
- [x] Telegram links/unlinks securely; unlink invalidates pending actions (local automated evidence; live setup pending).
- [x] Webhook rejects bad secrets (`401`), ignores non-private chats, and returns `200` for authentic unsupported updates.
- [x] A retry after a failed/timed-out update is processed, not dropped; a replay after success is ignored.
- [x] Linked user can submit one or multiple transactions through deterministic grammar or optional consented AI; missing amount/category/date clarification resolves follow-up replies (mocked AI evidence).
- [x] Bot always asks for confirmation before saving; repeated button presses create no duplicates.
- [x] Phase 3 financial commands read only scoped stored records; app works without any AI key.
- [x] Financial answers come only from stored DB records via enumerated operations (local integration evidence).
- [x] Invalid, ambiguous or malicious AI output fails safely (mocked provider evidence).
- [x] App works without an AI key via the deterministic parser; AI parsing is opt-in per user.
- [x] AI and login rate limits work without Redis (Postgres tests).
- [x] Unit, authorization/integration and critical E2E tests pass; golden-set report included.
- [x] Phase 3 unit/integration and critical browser tests pass; Phase 4 golden-set report is in docs/AI_GOLDEN_REPORT.md.
- [x] Targeted current-source/local-Git-history secret scan has no matches; `.env` is ignored and application secrets stay server-side (not a security certification).
- [x] Deployed on Vercel Hobby with existing Neon Free for small personal non-commercial use; no paid service enabled.
- [x] README covers setup, env vars, architecture, testing, gated deployment, token rotation, privacy/PDPA note and known free-tier limitations.
- [x] Public read-only synthetic demo, responsive/accessibility polish and screenshots verified locally.
- [ ] Phase 5 public demo URL, production webhook and live sign-in/web/Telegram confirmation acceptance verified after approval.

## 13. Environment variables

```dotenv
# Database (Neon PostgreSQL)
# Pooled connection for the app
DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler/DATABASE?sslmode=require"
# Direct connection for Prisma migrations (required)
DIRECT_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"

# Authentication (names depend on the chosen Auth.js setup)
AUTH_SECRET="replace-with-strong-generated-secret"
AUTH_URL="http://localhost:3000"
AUTH_GITHUB_ID=""
AUTH_GITHUB_SECRET=""

# Telegram Bot API (server-side only)
TELEGRAM_BOT_TOKEN="replace-with-bot-token"
TELEGRAM_WEBHOOK_SECRET="replace-with-random-secret"

# AI (choose a free-tier-eligible model in the provider console)
AI_PROVIDER="gemini"
GEMINI_API_KEY=""
GEMINI_MODEL=""
AI_DAILY_LIMIT_PER_USER="30"

# App configuration
NEXT_PUBLIC_APP_URL="http://localhost:3000"
APP_TIMEZONE="Asia/Kuala_Lumpur"
APP_CURRENCY="MYR"
```

Names may be refined to match the chosen libraries. Never put real credentials in docs or tracked files.

## 14. Instructions to Codex

1. **Inspect the repository first.** If empty, bootstrap Phase 1; if work exists, reuse good code rather than overwriting.
2. Create and maintain an **`AGENTS.md`** at the repo root with: install/run/test/lint/typecheck/build/migrate commands, folder conventions, money and date rules (§4.3, §4.4), the "all data access requires `userId`" rule, and a "do not" list (no paid services, no float money, no AI-authored SQL). Keep it current so later sessions stay consistent.
3. Work incrementally; prefer a working vertical slice over many unfinished files.
4. Underspecified requirement → choose a secure, conventional default, record the decision in `docs/DECISIONS.md`, and continue.
5. **Do not rely on memorized APIs or versions.** Before adding dependencies or choosing the Gemini model, check current official docs and compatibility (Next.js, Auth.js, Prisma, Vercel limits, Gemini free-tier eligibility).
6. **Stop and ask the human** before: choosing the auth approach, adding any dependency that needs an account/API key, anything requiring a dashboard login (Neon, Vercel, BotFather, AI provider), or anything that might incur cost.
7. No hardcoded fake production data, mocked success paths or placeholder handlers in features claimed complete.
8. Balances, authorization and mutations stay on the server; AI is only a parser/assistant, never a source of truth.
9. Never use real financial records or credentials in tests; demo and test data are synthetic.
10. Update `README.md` and the acceptance checklist as you go. Never claim a manual provider step was completed if it was not.
11. **Never purchase services, enable paid plans, add payment methods, or perform real-world financial transactions.**

## 15. Good first Codex prompt

> Read `DUITFLOW_CODEX_SPEC_v2.md` completely. Implement Phase 1 only. First inspect the existing repo. Bootstrap with `create-next-app@latest` (strict TypeScript, Tailwind, App Router), add Prisma with PostgreSQL (`DATABASE_URL` + `DIRECT_URL`), a protected layout, `.env.example`, migrations, tests, `AGENTS.md`, CI checks and a practical README. Before writing auth code, check the current Auth.js status and propose an approach for my approval. Use no paid services. Run lint, typecheck, tests and build, and report exactly what works and what manual setup remains. Do not proceed to Phase 2 until Phase 1 passes.

---

**Success means:** a dependable, portfolio-grade full-stack system, not just a generated interface. Prioritize security, correctness, simplicity and a zero-cost MVP.
