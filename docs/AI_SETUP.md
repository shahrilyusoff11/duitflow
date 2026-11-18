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

- Only new linked-user private-chat messages enter AI, with live connection and
  consent checked under the same user lock used by unlink and approval.
- Provider payload contains only message text, today's Malaysian date and
  category names. Profile names, emails, tokens, IDs, stored history, financial
  totals and query results are never added. Text/category names are untrusted
  data, so users must keep them free of personal information.
- Strict bounded Zod schemas reject extra keys, unknown intents/operations,
  non-string money, tool calls, partial responses and malformed/oversized output.
  Money must be a complete original substring, parsed locally with Decimal;
  dates resolve on the server. Missing/ambiguous money, category or date asks a
  clarification. Ten proposed transactions maximum; only explicit Sahkan can
  save them through the existing atomic owner-scoped approval transaction.
- Read-only operations: net_for_period, spend_by_category, top_categories,
  budget_status and recent_transactions. Server category matching supports
  exact names, a small alias map and unique one-character typos for longer names.
  Unclear category queries ask the user to resend an exact name. SQL and financial
  response prose never come from the model; all answers render stored DB results.
- Postgres rate events and an advisory transaction lock enforce at most 2 calls
  per rolling minute and 30 per rolling 24 hours per user (configurable downward),
  plus 4/minute and 30/24 hours across the application project. These are local
  safety caps. Attempts reserve capacity before network
  dispatch, including failed calls. No Redis or process-local limit fallback.
- Network + body-read + parse deadline: five seconds; 32 KB HTTP envelope,
  20 KB model text, 4,000-character input, 100 category names, 4,096 output tokens.
  One direct request per attempt, with tools and app-side caching disabled.
  Missing key, opt-out, cap, DB permission failure, timeout, upstream
  error or invalid output falls back to the deterministic parser. Unsupported
  language gets guidance rather than a fake success.
- Telegram sends immediate processing feedback, then finishes bounded work
  before HTTP success within its existing 30-second route. after() only cleans
  up. It does not own the AI work; a killed worker remains retryable via 503 and
  lease expiry. Persisted proposals reuse stable update UUIDs. Retried queries
  may be parsed/replied again within quota; they cannot write transactions.
- Consent withdrawal blocks subsequent dispatch permission checks. A request
  already sent cannot be recalled. Unlink prevents a later proposal/write/query
  because every scoped DAL operation rechecks the live connection.

Use synthetic, non-sensitive messages and category names for the portfolio
experiment. The Settings notice names the provider and explains what is sent.
[DeepSeek Open Platform terms](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html)

## Verification and rotation

See [the mocked golden-set report](AI_GOLDEN_REPORT.md) and
[actual check results](STATUS.md). Automated HTTP, integration and browser tests
use synthetic data, disposable storage and mocked AI. They verify application
validation and authorization. A direct live Flash smoke returned two synthetic
expenses in a schema-valid response within the five-second deadline. See the
status log for deployment and signed-in Telegram verification.

Use only synthetic messages for a live smoke check
(e.g. breakfast RM8 and petrol RM40), review all proposed values, cancel or
explicitly confirm once, then verify no duplicate on re-tap. Check opt-out and
no-key fallback too. Do not use real financial records for this check.

For a leaked key, disable AI, revoke the key with DeepSeek, and update approved
secret storage with an approved replacement before restarting or redeploying.
