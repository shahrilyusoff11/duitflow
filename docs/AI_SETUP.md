# Phase 4 AI parsing — free-only setup proposal

Implementation is available locally. **Credential setup and live API calls are
not approved or performed.** No key is required for the web app, Telegram
commands, deterministic intake, tests or build. Stop before Phase 5.

## Public eligibility checked on 15 November 2026

Proposed model: **`gemini-3.5-flash-lite`**, direct Gemini Developer API,
standard text `generateContent`, no tools or grounding. Google's current
[pricing](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite) lists
free input/output tokens, and the [model page](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite)
supports structured output. The older 2.5 Flash model is deprecated; do not copy
old model names or enable automatic fallback to another model.

[Malaysia is supported](https://aistudio.google.com/docs/available-regions).
The [billing guide](https://aistudio.google.com/docs/billing) says new accounts
begin on Free; paid usage requires linking a billing account. Use an **unbilled
Free project**, never a paid project, billing account, card, prepayment or trial
that could incur charges. If account verification demands payment, stop and
keep the deterministic parser. Public eligibility does not verify this owner's
account, available quota or access to the model.

Google's [quota guide](https://aistudio.google.com/docs/rate-limits) currently
directs developers to AI Studio for project-specific RPM/TPM/RPD. It does not
publish a universal numeric quota for the chosen model. Quotas apply per project,
not per key; Google's daily reset is Pacific midnight and capacity is not
guaranteed. Record actual project limits only after approved read-only dashboard
inspection. Do not promise any particular free request allowance.

The [current terms](https://aistudio.google.com/docs/terms) require age 18+ and
an allowed region; unpaid prompts/responses can be used for product improvement
and human review. They prohibit submitting sensitive, confidential or personal
information. Free service also has regional restrictions for EEA/UK/Switzerland
clients. This opt-in portfolio experiment is limited to adults in Malaysia using
synthetic, non-sensitive examples. Do not represent consent as overriding those
terms or offer real confidential financial processing through this free tier.

## Approval required before proceeding

The owner's request and AGENTS.md require approval before credential setup or
dashboard operations. The reviewable proposal is direct Gemini with this fixed
model, an unbilled Free project, synthetic smoke input only, no paid fallback,
and the default limits below. Approval to implement Phase 4 does not itself
approve creating/importing a project, accepting terms, creating a key or calling
the live service. None of these has happened in this phase.

After explicit approval, the owner can open
[AI Studio API keys](https://aistudio.google.com/api-keys), confirm the project
shows **Free** with no linked billing, inspect
[active quotas](https://aistudio.google.com/rate-limit), and create/restrict a
server-only key for the Gemini API. Never paste the key into chat, screenshots,
tracked files or a NEXT_PUBLIC variable. Save it only in ignored .env or a
separately approved hosting secret store. Hosting setup belongs to Phase 5.

Only once those conditions are confirmed, the proposed ignored local config is:

```dotenv
AI_PROVIDER="gemini"
GEMINI_API_KEY="<save locally only>"
GEMINI_MODEL="gemini-3.5-flash-lite"
GEMINI_FREE_TIER_CONFIRMED="yes"
AI_DAILY_LIMIT_PER_USER="30"
AI_MINUTE_LIMIT_PER_USER="2"
```

`GEMINI_FREE_TIER_CONFIRMED` is an owner attestation, not an API billing probe.
The app cannot infer the billing tier from a key. If eligibility, terms or model
availability change, set AI_PROVIDER=deterministic and remove the attestation.
Never upgrade billing to repair a 429/403. Lower local limits if the project's
actual quotas are smaller. Run setup:check (format only), restart the app, then
enable consent in Settings on an authenticated non-demo account. Consent is
stored independently of service availability and defaults off at signup.

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
  safety caps, **not Google's quotas**. Attempts reserve capacity before network
  dispatch, including failed calls. No Redis or process-local limit fallback.
- Network + body-read + parse deadline: five seconds; 32 KB HTTP envelope,
  20 KB model text, 4,000-character input, 100 category names, 4,096 output tokens.
  No retries, tools, cache, paid routing, gateway account or new npm dependency.
  Missing key/attestation, opt-out, cap, DB permission failure, timeout, upstream
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

The installed Next.js mutation, Route Handler and after() guides were read;
[Vercel's duration guide](https://vercel.com/docs/functions/configuring-functions/duration)
was checked. No hosting account, configuration change, timing benchmark or live
Telegram/Gemini delivery is claimed.

## Verification and rotation

See [the mocked golden-set report](AI_GOLDEN_REPORT.md) and
[actual check results](STATUS.md). Automated HTTP, integration and browser tests
use synthetic data/disposable storage and mocked AI; CI never calls Gemini.
They establish application validation and authorization, not live model accuracy.

Once separately approved, a live smoke check should use only synthetic messages
(e.g. breakfast RM8 and petrol RM40), review all proposed values, cancel or
explicitly confirm once, then verify no duplicate on re-tap. Check opt-out and
no-key fallback too. Do not use real financial records for this check.

For a leaked key, disable AI, revoke it in AI Studio, create a restricted
replacement only after approval, update ignored/approved secret storage, and
restart/redeploy. Consent need not be reset, but users should be informed if
their data was exposed. Never log or commit either key. Provider terms, quotas
and eligibility must be rechecked before eventual deployment.
