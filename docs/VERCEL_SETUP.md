# Vercel agent setup and release — 15 November 2026

The owner approved Vercel setup/publication and explicitly requested fetching
and following [Vercel's getting-started guide](https://vercel.com/get-started.md).
Deployment uses the owner's personal Hobby workspace; Gemini and paid services
remain excluded. Existing Neon and other agent configuration were preserved.

## Verified machine and agent setup

| Item | Actual result |
| --- | --- |
| Global CLI | `npm install --global vercel@latest`; `vercel --version` reports **65.16.0 (native)** |
| CLI authentication | Official device login completed by the owner; `vercel whoami` reports `shahrilyusoff11` |
| Workspace | `SY` / `sy-74fc`, owner role, **Hobby**; verified through CLI identity/team reads |
| Guidance | Existing **Vercel plugin**, installed, enabled and **GLOBAL**, confirmed by plugin discovery; no duplicate skills/plugin installation |
| Shared MCP | Added with `codex mcp add vercel --url https://mcp.vercel.com`; owner browser OAuth completed successfully |
| MCP configuration | Additive user-wide entry in `C:/Users/shahr/.codex/config.toml`; no project-scoped server |
| Server inventory | `vercel` is enabled with `o_auth`; previous `codex_app`, `cua_repl` and `node_repl` names/settings remain present |
| Documentation tool | Vercel documentation search succeeded in the running desktop session |
| Authenticated MCP check | Shared `mcp__vercel` tools confirm `shahrilyusoff11`, list `SY` / `sy-74fc`, and read the exact deployed DuitFlow project |
| Reload | New tools loaded on the subsequent chat turn; verification is complete |

The shared tools loaded on the next chat turn. Their authenticated user matches
the CLI account and correct Hobby workspace. Vercel required a separate workspace
grant; the owner completed the SY access screen. An immediate retry still gave
403, while a bounded later retry on the same connection succeeded. The reason
for that brief delay was not established. `search_vercel_documentation` works,
`list_teams` returns SY, and explicit team-scoped `get_project` returns the exact
known DuitFlow project. CLI and shared MCP access are both verified.
No unrelated connection was removed, no confirmation settings were weakened,
and no MCP token was extracted or printed.

## Project and release

- Local checkout linked to `sy-74fc/duitflow`, project
  `prj_3N2G8nhG2CQIMOaMGFSPxwLhStRQ`.
- Canonical public origin: [DuitFlow](https://duitflow-lyart.vercel.app),
  [synthetic demo](https://duitflow-lyart.vercel.app/demo).
- Final production source `9bd3995bc28f21530a440ea7f59d34048343598a`, deployment
  `dpl_F4skacS8mqYwV3KKr8WdsXChoCsL`, **READY** and promoted; build **1m 46s**.
  Its generated URL `https://duitflow-2wdmuqaex-sy-74fc.vercel.app` remains
  protected. [CI run 43702137694](https://github.com/shahrilyusoff11/duitflow/actions/runs/43702137694)
  passed every required step, including **316 tests / 28 browser tests**.
- Next.js preset, `npm ci`, `npm run build`, Node **26.x** (repository-supported),
  basic Hobby build machine (2 vCPU / 8 GB), Node functions in **cle1** near the
  existing Neon `us-east-2` database. No paid build machine, add-on or new DB.
- Production-only database/auth settings; existing auth encryption secret
  preserved. Direct migration URLs and production secrets were not added to
  previews. `AI_PROVIDER=deterministic`; no Gemini key or Free-project attestation.
- Final project metadata verified `DATABASE_URL`, `BETTER_AUTH_SECRET`,
  `GITHUB_CLIENT_SECRET`, `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` are
  Secret/sensitive and Production-only, with no values printed. Hosting contains
  no `GEMINI_API_KEY`, `DATABASE_URL_UNPOOLED` or `DIRECT_URL`. API reads confirmed
  the final source commit and currently promoted production target.
- `.vercelignore` excludes `.env*`, `.neon`, dependencies, generated clients,
  build output, local agent configuration and test artifacts. CLI dry inspection
  verified no sensitive path was uploaded. `.env`, `.env.local` and `.vercel/`
  remain Git-ignored. The CLI created ignored `.env.local` for development OIDC;
  redundant ignore lines it appended were removed without weakening exclusions.
- Manual reviewed CLI deployment and promotion; automatic Git publishing was
  not enabled. [Release evidence](STATUS.md) records exact deployment/commit IDs.

The initial staged production build was checked through authenticated
`vercel curl`, then promoted after GitHub CI passed. That command automatically
created a project automation protection-bypass secret; its value was never
printed. Generated deployment URLs retain Vercel Authentication. Public-domain
checks were repeated without that bypass, including browser → app → Prisma →
Neon readiness and anonymous session denial. App authentication was preserved.

## OAuth, Telegram and completed live smoke

The owner confirmed adding the production callback to the existing GitHub OAuth
app while preserving localhost. Existing client credentials were reused without
creating or printing another secret. The owner confirmed the real production
dashboard opened, then sign-out/re-login and synthetic web expense add/edit/delete
passed. Windows computer use stopped when it could not verify the current browser
URL, so the agent did not operate the owner's UI. This live UI evidence is the
owner's explicit report; no session was fabricated or borrowed.

The owner saved bot credentials directly in ignored `.env`. Telegram `getMe`
verified `duitflow00bot`. A random webhook secret was generated locally without
printing it. The bot token/secret are stored only in ignored local configuration
and Production Secret variables; bot username is Production Config. Public bot:
[@duitflow00bot](https://t.me/duitflow00bot). Missing-secret `POST {}` returned
401; an empty update with the correct secret returned 200. Official
`setWebhook`/`getWebhookInfo` confirmed the canonical
`https://duitflow-lyart.vercel.app/api/telegram/webhook` URL, update types
`message`/`callback_query`, `max_connections: 1`, zero pending updates and no
delivery error at registration. The secret must never be pasted into chat,
screenshots, Git or command arguments.

The owner replied **“ALL CHECKS PASSED”** to the exact requested production
smoke: generate the Settings link, Start in private chat, submit a synthetic
RM12 expense and Sahkan, verify exactly one web expense, re-tap without a
duplicate, separately add/edit/delete a web expense, then sign out and re-login.
This confirms actual approved auth and synthetic finance/bot writes, separately
from automated hosted readiness and CI. No personal finance records were
inspected, and no additional live unlink check is claimed beyond existing local
tests. Phase 5 is complete; [STATUS.md](STATUS.md) records the full evidence.

After this smoke, official webhook status still showed the canonical URL,
`message`/`callback_query`, one connection, zero pending updates and no delivery
error. Hosted `verify:app` passed again with zero browser errors. The final
deployment's recent five-minute request-log scan found zero HTTP ≥500 requests
with no excluded intervals. A targeted scan of 14 deployed public HTML/JavaScript
files found none of the configured app credential values. These bounded checks
are not a broader uptime or security certification.

See [the deployment runbook](DEPLOYMENT.md) for gated provider actions, live
synthetic checks and rotation. Stop before Stretch; Gemini setup/live calls remain
unapproved and disabled. The shared MCP account, workspace and project read
checks are complete alongside the CLI release and live app smoke.
