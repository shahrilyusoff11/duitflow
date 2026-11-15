# Phase 5 deployment runbook — authorized

Prepared on 15 November 2026. This is a reviewable plan, not an executed
deployment. Phase 5 local work created no Vercel project, production OAuth app,
bot, webhook, Gemini credential or live provider request. Existing Neon Free
and local GitHub OAuth remain intact. See [actual evidence](STATUS.md).

The owner approved the following deployment/setup scope in chat on
15 November 2026. Record the reviewed release commit and actual results:

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
4. Approve the target project, exact commit and public origin before setup or
   publishing. Record the previous deployment/commit if one exists. There is no
   existing Vercel release to roll back on first launch.

Browser fixtures always use disposable storage. Never point their migrations at
production or replace their explicit DB/AI overrides with provider credentials.

## 2. Owner: choose free hosting and the canonical origin

After approval, open [Vercel New Project](https://vercel.com/new), select the
personal **Hobby** scope and import `shahrilyusoff11/duitflow`. Review the
approved branch/commit. Choose Next.js, repository root, install `npm ci`, build
`npm run build`, and default Next.js output. Add no Marketplace resource, card,
Pro trial, paid domain or add-on. Hobby is for personal non-commercial use with
finite included usage; at a limit, reduce/pause use instead of upgrading.
Recheck [Hobby terms and limits](https://vercel.com/docs/plans/hobby).

Use the actual assigned stable `https://<project>.vercel.app` production origin,
with no path/trailing slash; availability of a particular name is not assumed.
Both app URL variables must match. If the final origin is assigned only after
the first deployment, initially publish only the credential-free landing/demo,
then configure exact URLs and approved secrets and redeploy before testing auth
or registering the webhook.

Under **Settings → Build and Deployment → Node.js Version**, select Node 24
LTS. Verify the resulting build/runtime: the repo also permits Node 26, and
Vercel's package engine resolution can override dashboard selection. Both are
repo-supported; do not claim Node 24 without checking the result. See
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
| `BETTER_AUTH_URL` | Exact canonical HTTPS origin, no trailing slash | Omit unless separate preview auth approved |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Approved production OAuth app below | Omit |
| `NEXT_PUBLIC_APP_URL` | Same canonical origin | Preview's own origin if needed |
| `APP_TIMEZONE` | `Asia/Kuala_Lumpur` | Same |
| `APP_CURRENCY` | `MYR` | Same |
| `AI_PROVIDER` | `deterministic` | `deterministic` |
| `TELEGRAM_BOT_TOKEN` | Approved BotFather token; configure all three bot variables | Omit |
| `TELEGRAM_WEBHOOK_SECRET` | 32–256 random `A-Z a-z 0-9 _ -` characters | Omit |
| `TELEGRAM_BOT_USERNAME` | Actual username without `@` | Omit |

Leave `GEMINI_API_KEY` absent and `GEMINI_FREE_TIER_CONFIRMED` absent or `no`.
Do not enable Gemini. Deterministic flows work without a key; a later request
must separately approve [AI setup](AI_SETUP.md).

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

After approval, open **GitHub → Settings → Developer settings → OAuth Apps →
New OAuth App**. A separate production app preserves local OAuth and its secret.

| Field | Value |
| --- | --- |
| Application name | `DuitFlow portfolio` or another public name |
| Homepage URL | Exact canonical HTTPS origin |
| Authorization callback URL | `https://<project>.vercel.app/api/auth/callback/github` |

Create a client secret and save it directly in Production, with the matching
client ID. Leave working local credentials unchanged. Do not add wildcard
preview origins, broaden trusted origins or enable password login. GitHub now
supports multiple registered callback URLs; this plan uses a separate app for
isolation. See [current OAuth registration steps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).

## 5. Review migrations separately, then publish

Existing Neon already has all three reviewed migrations. Phase 5 adds no schema
migration or demo DB seed. Do not reset, recreate or reseed production. In a
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

For initial approved publication, deploy the reviewed commit with correct env,
then record canonical URL, commit, deployment ID and result. Git integration
can publish future pushes automatically: agree the release policy with the owner
before enabling it; pushing an unapproved commit may publish it immediately.

Later authorized CLI releases can stage production with `vercel deploy --prod
--skip-domain`, check it, then assign with `vercel promote <deployment-url>`.
Do not assume a preview carries production env. See
[Vercel's promotion workflow](https://vercel.com/docs/deployments/promoting-a-deployment).
Real OAuth and Telegram require the canonical public origin; protected staging
URLs do not replace app session checks.

## 6. Owner: create and register Telegram

After bot approval, use official [BotFather](https://t.me/BotFather) and `/newbot`.
Save token/username directly in approved storage. Generate the webhook secret,
configure all three bot variables and redeploy reviewed code. Never place the
token in a browser URL.

Before registration, POST to the deployed webhook without a secret: expect
401. A missing server configuration gives 503 and must be fixed first. A correct
secret with empty JSON returns 200 without finance processing. Run probes from
a trusted environment, print only statuses and never headers/tokens. Do not add
a fake-session route for live verification.

Use the exact secret-safe PowerShell/Node `setWebhook` example in
[Telegram owner setup](TELEGRAM_SETUP.md#owner-setup), with:

```json
{
  "url": "https://<project>.vercel.app/api/telegram/webhook",
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
access. Keep Gemini disabled throughout.

| Check | Expected evidence |
| --- | --- |
| Landing and `/demo`, desktop/mobile | Render; synthetic/read-only notice; no personal records or overflow |
| Anonymous finance and Settings | Sign-in redirect; `/api/profile` 401 |
| `/api/health` | 200 with readiness fields only |
| Real GitHub sign-in/out/re-login | Own data only; sign-out blocks protected pages |
| Web finance | Add/view/edit synthetic expense; correct month totals/budget warning; delete after verification |
| Settings Telegram link | Ten-minute single-use link redeems privately; connection appears |
| `/balance`, `/budget`, `/report` | Match stored web records for the Malaysian month |
| `Makan RM12` | Proposal; no row before Sahkan; one TELEGRAM row after approval |
| Tap Sahkan again | No duplicate financial write |
| Missing amount and Batal | Clarification resolves; canceled/old buttons cannot write |
| Unlink | Old buttons/links and financial commands denied; web records preserved |
| Bad secret and group update | Bad secret 401; no financial disclosure outside private chat |
| AI off with no key | Deterministic intake works; no live AI request |

`verify:app` supports a hosted target via `APP_VERIFY_URL` and checks landing,
readiness and anonymous denial. It does not perform consent, mutations or bot
delivery; its success alone does not complete Phase 5.

Record date, deployment commit/URL and each actual pass/fail in STATUS.md.
Separate real delivery from mocks. Evidence must exclude names, email, cookies,
tokens, link payloads, bot IDs and raw financial messages. Remove synthetic
records through normal authorized UI actions. Mark Phase 5 complete only when
the public demo and live core flows pass. Stretch remains excluded.

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
plan re-authentication. Any future Gemini replacement remains separately gated.

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
