# Telegram integration — Phase 3

Phase 3 uses Telegram's Bot API, the existing Next.js app and PostgreSQL. No AI
provider, separate bot server, Redis, broker or paid service is required.
The web app continues to work when Telegram configuration is absent.

The implementation and automated tests do not create a Telegram bot, register a
live webhook, deploy hosting or send messages to a real user. Those remain owner
setup and live verification steps. Stop before Phase 4.

## Owner setup

1. In Telegram, open the official [BotFather](https://t.me/BotFather), use
   `/newbot` and choose a bot name/username. Store its token only in the ignored
   `.env` or a hosting secret store. Never paste it into chat, Git, screenshots,
   issue descriptions or browser URLs. Bot creation is documented in Telegram's
   [official introduction](https://core.telegram.org/bots#how-do-i-create-a-bot).
2. Set the following server-side variables. These are placeholders:

   ```dotenv
   TELEGRAM_BOT_TOKEN="<token from BotFather>"
   TELEGRAM_WEBHOOK_SECRET="<32–256 random A-Z, a-z, 0-9, underscore or hyphen characters>"
   TELEGRAM_BOT_USERNAME="<username without @>"
   ```

   Use a password manager to generate a strong webhook secret. The token and
   secret must never use a `NEXT_PUBLIC_` prefix. The username is used only to
   build the public bot link; credentials remain server-side.
3. Use a public HTTPS app URL for a live webhook and set `NEXT_PUBLIC_APP_URL`
   accordingly. Telegram cannot deliver to `http://localhost`. Hosting setup is
   outside this phase; use an already approved free HTTPS deployment when ready.
   Preserve the existing GitHub OAuth callback configuration for that deployment.
4. Register the webhook from a trusted local shell after saving the variables.
   This PowerShell example loads the ignored `.env`, submits credentials in the
   HTTPS request and prints only a success message:

   ```powershell
   @'
   const base = process.env.NEXT_PUBLIC_APP_URL;
   const token = process.env.TELEGRAM_BOT_TOKEN;
   const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
   if (!base || !token || !secret) throw new Error("Missing Telegram configuration");
   const url = new URL("/api/telegram/webhook", base);
   if (url.protocol !== "https:") throw new Error("A public HTTPS app URL is required");
   const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({
       url: url.toString(), secret_token: secret,
       allowed_updates: ["message", "callback_query"],
       max_connections: 1,
     }),
     signal: AbortSignal.timeout(10000),
   });
   const result = await response.json();
   if (!response.ok || result.ok !== true) throw new Error("Telegram webhook registration failed");
   console.log("Telegram webhook registered");
   '@ | node --env-file=.env --input-type=module
   ```

   Run this only when the owner is ready to connect the real bot. Never add the
   token to the command text or enable shell HTTP tracing. Telegram documents
   the secret header, HTTPS delivery and update filters in
   [`setWebhook`](https://core.telegram.org/bots/api#setwebhook).
   `max_connections: 1` preserves delivery order for this small personal bot.

## Link, use and unlink

Sign in through GitHub, open **Tetapan** and choose **Jana pautan Telegram**.
Open the generated link and press Telegram's **Start** button. Refresh Settings
to see the connection status. The payload uses URL-safe random bytes, stays
within Telegram's [deep-link limit](https://core.telegram.org/bots/features#deep-linking),
expires after ten minutes and can be redeemed once. The database stores only
its hash. A fresh link invalidates older links. Treat the generated link as a
short-lived credential and do not share it. It is not retained in page URLs or
local storage and disappears from the UI after a reload.

A Telegram identity cannot attach to two web accounts, and a connected web
account cannot silently switch identities. Unlink first when changing the
connection. Demo accounts cannot link Telegram.

Use private chat only. The bot ignores groups and channels, and financial
commands require a live connection. Supported commands are:

| Command | Result |
| --- | --- |
| `/start`, `/link` | Link instructions, or redeem the token supplied by Settings |
| `/help` | Supported formats and commands |
| `/balance` | Current Malaysian month's recorded income, expense and net |
| `/budget` | Current month's limits, spending and remaining amounts |
| `/report` | Current month's stored-record summary |
| `/cancel` | Cancel the current proposal or clarification |

The three financial commands also accept a specific month, for example
`/report 2026-11`. Monthly boundaries use Malaysia's calendar.
Replies are bounded: reports show the top ten expense categories and five recent
records; `/budget` lists up to twenty category budgets. Use the web app to inspect
the complete lists. Income/expense/net totals aggregate all records in the month.

Send `Makan RM12` or `Gaji RM2500`. The deterministic parser asks for missing
details and shows an inline **Sahkan / Batal** proposal. Financial records are
written only by **Sahkan**, within the same transaction that consumes the
unexpired pending action. A casual `ya` does not authorize a write. Double taps
and replays cannot create another transaction. Editing proposals is deferred;
cancel and send a replacement instead.

In Settings choose **Putuskan sambungan Telegram**, then explicitly confirm.
This removes the connection and invalidates outstanding proposals and link
tokens. Existing finance records remain available on the web. Old confirmation
buttons no longer authorize writes, even if that identity reconnects later.

## Live verification still required

After owner setup, use synthetic records for these checks:

- Sign in, link once, and verify replay/expired link rejection.
- Run `/balance`, `/budget` and `/report`; compare with the same web month.
- Send `Makan RM12`; verify no finance write before **Sahkan**, then confirm and
  check exactly one `TELEGRAM` transaction on the web. Tap again and verify no
  duplicate.
- Send a message without an amount, supply the amount when asked, then confirm.
- Cancel a proposal, and verify the old **Sahkan** button cannot save it.
- Unlink in Settings and verify old buttons and financial commands are denied.
- Send an unsupported update and a message from a group; verify no financial
  data is returned to a group. A wrong webhook secret receives `401`.

Automated tests use disposable databases, synthetic sessions and mocked Telegram
HTTP responses. They are not evidence of a deployed webhook or real Telegram
delivery. No live provider verification is claimed by Phase 3 documentation.

## Rotation, privacy and limits

If a bot token leaks, use BotFather `/revoke`, save the replacement in each
approved secret store and restart/redeploy the app. If the webhook secret
leaks, generate a new one and update the app. Re-run `setWebhook` after either
change so Telegram sends the current secret. Unlink affected accounts and
generate fresh links if a linking URL was exposed.

Messages and bot replies pass through Telegram; bot chats are not a place for
bank passwords, authentication secrets or banking credentials. No messages are
sent to an AI service in Phase 3. Application logs must not contain raw messages,
link tokens, webhook secrets or bot tokens. The database holds only the
validated data needed by pending actions and financial records.

Telegram's free platform still has [API limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this).
Neon autosuspend and hosting cold starts may delay replies. Free hosting and
database quotas are not unlimited; this phase enables no paid broadcast mode,
billing, purchases or upgrades. Delivery of an outbound message is not
transactional with a database commit, so a network timeout can leave a reply
uncertain even though duplicate financial writes remain blocked.

## Processing and retry behavior

Phase 3 sends an immediate “Sedang memproses…” chat response for linked-user
intake and runs bounded deterministic work before HTTP success. Each outbound
API call has a four-second timeout and the route declares a 30-second duration.
Next.js `after()` performs cleanup only; it is not a durable job queue. This uses
the brief's immediate-message alternative and keeps real processing failures
retryable through Telegram. Phase 4 must revisit slow parsing before adding AI.

DONE deliveries return 200 without processing again. FAILED/stale updates resume.
An active PROCESSING lease returns 503 without duplicate work until the first
worker finishes or its lease expires; returning 200 here could lose the retry
of a killed worker. Approval and message-level stable action IDs both prevent
duplicate financial writes. A callback-acknowledgment failure cannot mask a
prior retryable processing error. Explicit permanent request/chat rejections
stop retries; uncertain network/configuration/upstream failures remain retryable.

Lazy cleanup after successful processing deletes at most 100 records per table:
DONE updates older than seven days, pending actions expired over seven days ago,
and link tokens expired over one day ago. Consumed action receipts remain long
enough to reject replay without replacing an already saved proposal. Failed and
processing update records are retained for retry. No cron or paid queue is used.
