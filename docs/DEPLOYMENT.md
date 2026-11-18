# Phase 5 deployment runbook — complete

Updated on 15 November 2026. The approved Vercel Hobby web release is live at
[DuitFlow](https://duitflow-lyart.vercel.app), including
[the read-only synthetic demo](https://duitflow-lyart.vercel.app/demo).
Hosted readiness and anonymous denial pass. The owner confirmed real production
OAuth, synthetic web CRUD, Telegram linking/approval and no duplicate on re-tap.
Phase 5 is complete. The 18 November update added metered DeepSeek Flash with
user opt-in. Stretch is unstarted. See
[the setup record](VERCEL_SETUP.md) and [full verification evidence](STATUS.md).

## Phase 5 release evidence

| Item | Actual result |
| --- | --- |
| Vercel scope / project | Hobby `SY` / `sy-74fc`; `duitflow` / `prj_3N2G8nhG2CQIMOaMGFSPxwLhStRQ` |
| Source / deployment | `9bd3995bc28f21530a440ea7f59d34048343598a`; `dpl_F4skacS8mqYwV3KKr8WdsXChoCsL`, **READY**, promoted |
| Build / runtime | Basic 2 vCPU / 8 GB, **1m 46s**; Node **26.x**, function region `cle1` |
| Canonical public origin | [duitflow-lyart.vercel.app](https://duitflow-lyart.vercel.app) |
| Protected generated URL | `https://duitflow-2wdmuqaex-sy-74fc.vercel.app` |
| Release CI | [43702137694](https://github.com/shahrilyusoff11/duitflow/actions/runs/43702137694), all required steps pass; **316 tests / 28 browser tests** |
| Release method | Reviewed manual CLI staging/promotion; no Git auto-deploy integration |

The first web release used `ade424e3575464738a3e926a748ef5be81a74981` and
`dpl_r7u4LcdzNNBGdrcrjbbPHQCxggEA`; the current source is its docs-only successor
with the approved Production Telegram configuration enabled.

CLI-authorized staged checks passed before promotion: `/`, `/demo`, `/sign-in`
200; `/api/profile` 401; `/dashboard` 307; health 200. Raw unauthenticated
canonical checks then passed with the same expected statuses, health `no-store`
and configured security headers. `verify:app` against the canonical origin
passed a real headless browser → health → Prisma → Neon check, anonymous
redirect/profile denial and zero client errors. These checks do not prove
real OAuth login, finance writes or bot delivery.

Separately, official webhook registration/status checks confirmed the canonical
webhook URL, `message`/`callback_query` updates, one delivery connection, zero
pending updates and no delivery error at registration. Public secret probes
returned 401 without the secret and 200 for an authenticated empty update. The
owner explicitly confirmed the real UI/chat smoke results recorded in §7.
After that smoke, webhook status still matched with zero pending updates and
no delivery error, and hosted `verify:app` passed again with zero browser errors.
The final deployment's recent five-minute request-log window contained zero
HTTP ≥500 requests with no excluded intervals; a targeted scan of 14 public
HTML/JavaScript files found no configured application credential values.
These bounded checks are not an uptime guarantee or security certification.

Generated/preview deployment protection stays enabled. CLI access automatically
created a platform protection-bypass secret; its value was never printed or
committed. Do not weaken application sessions or publish that secret. A
five-minute runtime-log review saw one `pg` future SSL-mode deprecation warning
on a healthy readiness request and no observed request failures; no zero-log or
latency claim is made. No schema changes, live Gemini or paid services occurred.

The owner approved the following deployment/setup scope in chat on
15 November 2026:

- Vercel Hobby setup and publication to the assigned free `*.vercel.app` origin.
- Production GitHub OAuth configuration, preserving local OAuth.
- BotFather setup, approved secret storage, secure webhook registration and
  live synthetic sign-in/finance/Telegram verification.
- Reuse of the existing Neon project/production branch, with no new provider.

Gemini setup and live calls are excluded. Publication approval does not approve
AI Studio, a Gemini key, billing, a card, a trial, paid features or a custom
domain. Stop before Stretch. These gates come from the owner's request,
[AGENTS.md](../AGENTS.md) and specification §11 Phase 5.

## 1. Review the release locally

1. Choose the exact commit, inspect the diff, confirm `.env` and generated output
   stay ignored, and record actual checks in STATUS.md.
2. Run:

   ```sh
   npm ci
   npm run db:validate
   npm run lint
   npm run typecheck
   npm test
   npm run build
   npx playwright install chromium
   npm run test:e2e
   git diff --check
   ```

3. Inspect `/demo` on desktop/mobile. It contains synthetic data, no session,
   database reads, writes, AI or linking. Anonymous finance/Settings pages must
   still require real GitHub login.
4. For a later release, verify the authorized target, reviewed commit and
   canonical origin. Record the current deployment above as the rollback target.
   Existing deployment/setup approval is recorded; do not recreate its project.

Browser fixtures always use disposable storage. Never point their migrations at
production or replace their explicit DB/AI overrides with provider credentials.

## 2. Owner: choose free hosting and the canonical origin

Reuse the existing project above in the confirmed **Hobby** scope. The release
uses Next.js, repository root, `npm ci`, `npm run build` and default Next.js
output. It was deployed by reviewed CLI staging and promotion; no Git integration
was configured. Add no Marketplace resource, card, Pro trial, paid domain or
add-on. Hobby is for personal non-commercial use with finite included usage;
at a limit, reduce/pause use instead of upgrading. Recheck
[Hobby terms and limits](https://vercel.com/docs/plans/hobby).

The canonical origin is exactly `https://duitflow-lyart.vercel.app`, without a
trailing slash. Both app URL variables use this origin. Do not substitute a
protected generated deployment URL for OAuth or Telegram callbacks.

The observed release runtime is **Node 26.x**, permitted by this repository.
CI uses Node 24 LTS. Vercel's package engine resolution can override dashboard
selection, so verify actual build/runtime results on later releases. See
[Node version precedence](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

Keep Node.js and the existing 30-second webhook limit. Confirm Fluid Compute is
on. Current Hobby Fluid Compute has a 300-second ceiling; the app keeps its
shorter limit. This does not guarantee request latency. See
[function duration](https://vercel.com/docs/functions/configuring-functions/duration).
Choose a function region near the existing Neon region after confirming it;
do not move/recreate the database to guess at proximity.

## 3. Owner: scope environment variables

Save secrets directly in approved Vercel environment settings, never in chat,
Git, command arguments, screenshots or logs. Check **Production** scope for
each value. Env changes require a new deployment.

| Variable | Production value/source | Preview policy |
| --- | --- | --- |
| `DATABASE_URL` | Existing pooled Neon URL with TLS | Omit; isolated DB needs separate approval |
| `BETTER_AUTH_SECRET` | Existing strong secret when sharing the existing auth DB; preserve encrypted provider-token compatibility | Omit |
| `BETTER_AUTH_URL` | `https://duitflow-lyart.vercel.app` | Omit unless separate preview auth approved |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Existing approved GitHub OAuth credentials, scoped to Production | Omit |
| `NEXT_PUBLIC_APP_URL` | Same canonical origin | Preview's own origin if needed |
| `APP_TIMEZONE` | `Asia/Kuala_Lumpur` | Same |
| `APP_CURRENCY` | `MYR` | Same |
| `AI_PROVIDER` | `deepseek` | `deterministic` |
| `DEEPSEEK_API_KEY` | Approved token stored as a Production-only Secret | Omit |
| `TELEGRAM_BOT_TOKEN` | Approved BotFather token; configure all three bot variables | Omit |
| `TELEGRAM_WEBHOOK_SECRET` | 32–256 random `A-Z a-z 0-9 _ -` characters | Omit |
| `TELEGRAM_BOT_USERNAME` | Actual username without `@` | Omit |

Final project-metadata verification confirmed `DATABASE_URL`,
`BETTER_AUTH_SECRET`, `GITHUB_CLIENT_SECRET`, `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_WEBHOOK_SECRET` are Secret/sensitive and Production-only. No values
were printed. Hosting contains no `GEMINI_API_KEY`, `DATABASE_URL_UNPOOLED` or
`DIRECT_URL`; preserve those boundaries on future releases.

For the approved [DeepSeek activation](AI_SETUP.md), set `AI_PROVIDER=deepseek`
in Production and store `DEEPSEEK_API_KEY` as a Production-only Secret. Apply the reviewed
`20261118000000_deepseek_consent` migration via `npm run db:deploy` before
deploying the DeepSeek code, including in deterministic mode. Use the approved
direct connection for the migration and keep it out of Vercel.

The auth secret must have at least 32 random characters. Do not silently replace
it while reusing the existing database: Better Auth also uses it for encrypted
provider tokens. A distinct production secret belongs with a separately approved
isolated auth database or a reviewed rotation/re-authentication plan. Local and
production origins still have separate host-scoped cookies.

`DATABASE_URL_UNPOOLED` (preferred) or `DIRECT_URL` is needed only in the trusted
operator's migration environment, not by deployed runtime/build. Local
`setup:check` expects a direct alias and validates format only. Keep direct URLs
out of previews. Preview builds need no production DB/OAuth/bot/AI credentials;
the synthetic demo works without them.

Use **Settings → Deployment Protection → Standard Protection → Vercel
Authentication** for previews/generated deployment URLs. Keep the canonical
production domain reachable by Telegram. Do not pay for Password Protection or
give Telegram a protection-bypass token. Standard Protection is available on
all plans and excludes production domains; confirm its active scope in
[the protection guide](https://vercel.com/docs/deployment-protection).

## 4. Owner: configure production GitHub OAuth

The existing GitHub credentials are already scoped to Vercel Production. The
owner was asked to open **GitHub → Settings → Developer settings → OAuth Apps →
the existing DuitFlow app** and add the canonical callback while retaining the
working localhost callback. The owner confirmed that callback is added, the
production dashboard opens, and sign-out/re-login passes. No new OAuth app or
client secret was required.

| Field | Value |
| --- | --- |
| Additional authorization callback URL | `https://duitflow-lyart.vercel.app/api/auth/callback/github` |
| Existing local callback | Retain the currently working localhost callback |

Leave the working local credentials unchanged. Do not add wildcard preview
origins, broaden trusted origins or enable password login. GitHub supports
multiple registered callback URLs; see
[current OAuth registration steps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).
The owner completed real sign-in/out/re-login and the synthetic web-finance
check. Computer-use safety stopped Windows browser URL verification, so this
live UI evidence is owner-confirmed; the agent did not operate the owner's UI
or impersonate a session. Repeat those checks after future auth releases.

## 5. Review migrations separately, then publish

Phase 5 used the three existing migrations. The DeepSeek update added the
reviewed consent migration listed above. Do not reset, recreate or reseed production. In a
trusted local shell with the existing ignored `.env`:

```sh
npm run setup:check
npm run db:status
```

For a genuinely new environment with unapplied migrations, verify the target,
review SQL and obtain required provider approval before `npm run db:deploy`.
Preserve checks, composite ownership/type keys, the pending-action partial index
and signup trigger. Never create migrations/reset production. Do not put
`db:deploy` in every hosting build/preview; migrations are a separate release
step.

The initial approved CLI publication is recorded above. There is no Git
auto-deploy integration. If one is proposed later, agree its release policy with
the owner first: future pushes can publish automatically once it is enabled.

Later authorized CLI releases can stage production with `vercel deploy --prod
--skip-domain`, check it, then assign with `vercel promote <deployment-url>`.
Do not assume a preview carries production env. See
[Vercel's promotion workflow](https://vercel.com/docs/deployments/promoting-a-deployment).
Real OAuth and Telegram require the canonical public origin; protected staging
URLs do not replace app session checks.

## 6. Owner: create and register Telegram

The owner supplied BotFather credentials directly in ignored `.env`; `getMe`
validated [@duitflow00bot](https://t.me/duitflow00bot). The bot token, random
webhook secret and username are configured only in approved Production scopes.
The final release is deployed and its webhook registered. Never send the token
through chat or a browser URL. Preserve existing configuration; the steps below
are the repeatable procedure for an approved environment or credential rotation.

Before registration, POST to the deployed webhook without a secret: expect
401. A missing server configuration gives 503 and must be fixed first. A correct
secret with empty JSON returns 200 without finance processing. Run probes from
a trusted environment, print only statuses and never headers/tokens. Do not add
a fake-session route for live verification.

Use the exact secret-safe PowerShell/Node `setWebhook` example in
[Telegram owner setup](TELEGRAM_SETUP.md#owner-setup), with:

```json
{
  "url": "https://duitflow-lyart.vercel.app/api/telegram/webhook",
  "secret_token": "<read from environment; never tracked>",
  "allowed_updates": ["message", "callback_query"],
  "max_connections": 1
}
```

Do not set `drop_pending_updates=true`; that intentionally discards deliveries.
The HTTPS endpoint must be reachable without Vercel login. Call `getWebhookInfo`
from the same trusted environment and verify URL, update types and connection
limit, then inspect pending count/delivery errors without publishing raw HTTP
traces. See [Telegram's registration/status API](https://core.telegram.org/bots/api#setwebhook).

## 7. Verify the deployed core flows

Use the owner's real browser session and private bot chat with synthetic data.
Complete real OAuth normally; no impersonation, fake cookie or demo write
access. Keep external AI disabled throughout.

The owner replied **“ALL CHECKS PASSED”** to the exact final smoke request:
Settings link/Start, synthetic RM12 expense/Sahkan, exactly one visible web row,
re-tap without duplication, separate web expense add/edit/delete, and
sign-out/re-login. This owner-performed evidence is separate from automated
readiness and CI. Approved real auth and synthetic finance/bot writes occurred.

| Check | Evidence and limit |
| --- | --- |
| Landing/demo/readiness and anonymous denial | Automated hosted HTTP/headless checks passed; desktop/mobile UI also covered locally/CI |
| Real GitHub dashboard, sign-out/re-login | Owner-confirmed passed |
| Synthetic web expense add/edit/delete | Owner-confirmed passed; month totals/budget warnings retain automated evidence |
| Settings link → private bot Start | Owner-confirmed passed |
| Synthetic RM12 expense → Sahkan | Owner confirmed exactly one expense visible on web |
| Re-tap the same approval | Owner confirmed no duplicate |
| Missing-secret/correct-secret empty update | Public probes returned 401/200 |
| `/balance`, `/budget`, `/report`, clarification and Batal | Existing local automated evidence; no additional live check claimed |
| Unlink, expiry, cross-account and group denial | Existing local automated evidence; no live unlink check claimed |
| AI off/no key | Deterministic live intake worked; Gemini remains unapproved and disabled |

`verify:app` supports a hosted target via `APP_VERIFY_URL` and checks landing,
readiness and anonymous denial. It does not perform consent, mutations or bot
delivery; its success alone does not complete Phase 5.

Record date, deployment commit/URL and each actual pass/fail in STATUS.md.
Separate real delivery from mocks. Evidence must exclude names, email, cookies,
tokens, link payloads, bot IDs and raw financial messages. Remove synthetic
records through normal authorized UI actions. Phase 5 is complete on the
automated and owner-confirmed evidence above. This table is the regression
baseline for future approved releases; Stretch remains excluded.

## Rollback, rotation and operating limits

If a release fails, stop further publication. With approval, restore the
previous known-good deployment or deploy its recorded commit with correct env.
Code rollback does not undo DB changes; Phase 5 has none. Never reset production
to repair a release. Verify auth, readiness and canonical webhook after rollback;
review automatic production-domain assignment before another push.

To pause bot delivery, use approved `deleteWebhook` without dropping pending
updates, or restore the last working endpoint. Re-register once healthy.
Replies can repeat after uncertain delivery; atomic approvals prevent duplicate
financial writes.

For leaks, use BotFather `/revoke`, replace bot token/webhook secret in approved
stores, redeploy and repeat `setWebhook` plus the synthetic check. Unlink and
replace exposed links. Revoke exposed database/OAuth credentials. Auth-secret
rotation invalidates session signatures and affects encrypted provider tokens;
plan re-authentication. Use `AI_PROVIDER=deterministic` and redeploy to pause DeepSeek.

Neon autosuspend and hosting cold starts can delay first requests. Free plans
have finite capacity, recovery and history: check actual usage in approved
dashboards and reduce/pause use at caps instead of enabling billing. No uptime,
latency or unlimited-quota claim. No paid monitoring, Redis, cron, separate
backend, backup automation or CSV export is introduced.

This is a personal portfolio experiment for synthetic data, without a production
security/privacy review for real records. Before wider use, review Malaysian
PDPA applicability, notices, retention, access/deletion processes and Telegram
disclosures. See [AI privacy limits](AI_SETUP.md); consent neither overrides
provider terms nor approves credential setup.
