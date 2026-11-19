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

The reviewed `20261119000002_deepseek_chat_consent` migration adds a flag
that defaults off for every account. Earlier opt-ins for category suggestions
remain in the legacy column. After applying the migration to the authorized
target and running `npm run setup:check`, open **Tetapan → Tafsiran mesej
Telegram oleh DeepSeek** to opt in with a signed-in account. Consent persists
independently of availability and can be withdrawn from Tetapan.

## Runtime boundaries and limits

- Local interpretation handles commands, callbacks, clear questions, complete
  proposals, and known clarifications first. When a message needs interpretation,
  optional DeepSeek selects a supported finance query, follow-up, bill list or
  lookup, bill payment proposal, or transaction intake. Existing budget changes,
  edits, undo, bill creation and notification commands are handled locally.
- The provider payload preserves the order of allowlisted Malay and English
  words, including ordinary conversational words. Placeholders replace
  amounts, dates, numbers, custom category names and unrecognized text.
  The app's static generic category names accompany the message. Common
  credential, contact and bank patterns bypass AI. The phrasing can reveal the
  intent of the message. DeepSeek documents its default API disk caching.
  [DeepSeek context caching](https://api-docs.deepseek.com/guides/kv_cache/)
- Strict schemas reject unknown choices, extra fields, tool calls, partial
  responses and unbound or mistyped references. The server maps placeholders
  from the current message, resolves account scope and Malaysian dates,
  matches actual records and categories, and computes totals using Decimal.
  Current and previous topics and numbered records remain local on the linked
  connection for up to 10 minutes. A bill payment or transaction becomes a
  preview. The owner-scoped approval checks the bill version and consumes the
  proposal atomically after the user taps **Sahkan**.
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

See the [local check results](STATUS.md). Automated checks use synthetic data,
disposable PostgreSQL and mocked AI or an explicitly disabled provider.
The manual check calls the configured Flash adapter with five synthetic
messages and checks the corresponding server-validated routes. It runs
outside CI and uses no database or Telegram account.

```sh
npm exec -- tsx --conditions=react-server --env-file=.env scripts/verify-deepseek-chat.ts
```

Use only synthetic messages for a live smoke check
(e.g. `Paid RM8 for breakfast then paid RM40 for petrol`). Review all proposed values, cancel or
explicitly confirm once, then verify no duplicate on re-tap. Check opt-out and
no-key fallback too. Do not use real financial records for this check.

For a leaked key, disable AI, revoke the key with DeepSeek, and update approved
secret storage with an approved replacement before restarting or redeploying.
