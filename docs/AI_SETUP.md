# DeepSeek Flash setup

DuitFlow uses the local parser by default. The optional adapter uses
`deepseek-flash` with JSON output and thinking disabled. DeepSeek's current
Flash model and API contract were checked on 18 November 2026.
[DeepSeek model pricing](https://api-docs.deepseek.com/quick_start/pricing/),
[Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/)

## Activation with an API key

The DeepSeek API bills by token, deducting granted balance before topped-up
balance. On 18 November 2026 the owner approved metered inference on the existing
API account. The owner manages any balance top-up or payment changes.
[DeepSeek deduction rules](https://api-docs.deepseek.com/quick_start/pricing/#deduction-rules)

Place the existing API key in an ignored local `.env` file. In Vercel, use a sensitive
Production-only Vercel variable. Keep the key out of chat, tracked files,
screenshots and `NEXT_PUBLIC_` variables.

```dotenv
AI_PROVIDER="deepseek"
DEEPSEEK_API_KEY="<save in secret storage>"
DEEPSEEK_MODEL="deepseek-flash"
AI_DAILY_LIMIT_PER_USER="30"
AI_MINUTE_LIMIT_PER_USER="2"
```

Set `AI_PROVIDER=deterministic` to pause API calls. If the balance runs out,
DeepSeek returns HTTP 402 and DuitFlow uses the local parser. [DeepSeek API errors](https://api-docs.deepseek.com/quick_start/error_codes/)

Apply the reviewed Prisma migration to the target database before running this
release. It adds a DeepSeek consent flag that defaults off for all accounts,
including existing users with the legacy flag set. Run `npm run setup:check` to
check configuration format, then restart or redeploy and open **Settings →
Penghuraian AI pilihan** to opt in on an authenticated non-demo account. Consent
persists independently of availability and can be withdrawn from Settings.

## Runtime boundaries and limits

- The local parser handles complete proposals and known amount or date
  clarifications first. The bot recognizes supported financial questions locally
  and renders owner-scoped database results. Unclear requests can use
  `/balance`, `/report` or `/budget`.
- Optional category suggestions use a projection of new linked-user messages.
  DeepSeek sees numbered clauses, locally assigned direction, allowlisted
  bookkeeping words, and the app's static generic category names. Raw text,
  custom names, amounts, dates, user IDs, prior requests and query results stay
  with the application. Common credential, contact and bank patterns bypass AI.
  The projection still reveals the coarse context of the entry. DeepSeek
  documents [default API disk caching](https://api-docs.deepseek.com/guides/kv_cache/).
- Strict bounded Zod schemas reject extra keys, unknown intents, tool calls,
  partial responses and malformed or oversized output. Each model item must
  match a unique local clause and direction. Only a generic category suggestion
  is applied, and only when it matches an owned category of that type. The
  server reads the amount, date and description from the local clause. Missing
  or ambiguous fields trigger clarification. Only explicit Sahkan saves rows
  through the atomic owner-scoped approval transaction.
- Postgres rate events and an advisory transaction lock enforce at most 2 calls
  per rolling minute and 30 per rolling 24 hours per user (configurable downward),
  plus 4/minute and 30/24 hours across the application project. These are local
  safety caps. Attempts reserve capacity before network
  dispatch, including failed calls. No Redis or process-local limit fallback.
- The network, body read and parsing deadline is five seconds. Bounds include a
  32 KB HTTP envelope, 20 KB model text, 4,000 input characters and 4,096 output tokens.
  One direct request per attempt, with tools and app-side caching disabled.
  Missing key, opt-out, cap, DB permission failure, timeout, upstream
  error or invalid output falls back to the deterministic parser. Unsupported
  language gets guidance rather than a fake success.
- Telegram sends immediate processing feedback, then finishes bounded work
  before HTTP success within its existing 30-second route. after() only cleans
  up. It does not own the AI work; a killed worker remains retryable via 503 and
  lease expiry. Persisted proposals reuse stable update UUIDs. Retried queries
  may be answered again from stored results.
- Consent withdrawal blocks subsequent dispatch permission checks. A request
  already sent cannot be recalled. Unlink prevents a later proposal/write/query
  because every scoped DAL operation rechecks the live connection.

Use synthetic messages when verifying the deployment. The Settings notice names
the provider and explains what is sent. Review the provider's applicable
retention and processing terms before approving wider real-data use.
[DeepSeek Open Platform terms](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html)

## Verification and rotation

See [the mocked golden-set report](AI_GOLDEN_REPORT.md) and
[actual check results](STATUS.md). Automated HTTP, integration and browser tests
use synthetic data, disposable storage and mocked AI. They verify application
validation and authorization. A direct live Flash smoke returned two synthetic
expenses in a schema-valid response within the five-second deadline. See the
status log for deployment and signed-in Telegram verification.

Use only synthetic messages for a live smoke check
(e.g. `Paid RM8 for breakfast then paid RM40 for petrol`). Review all proposed values, cancel or
explicitly confirm once, then verify no duplicate on re-tap. Check opt-out and
no-key fallback too. Do not use real financial records for this check.

For a leaked key, disable AI, revoke the key with DeepSeek, and update approved
secret storage with an approved replacement before restarting or redeploying.
