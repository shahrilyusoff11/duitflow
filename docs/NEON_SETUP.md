# Neon setup and change record — 15 November 2026

**Subsequent update:** GitHub credentials have now been configured locally.
Real login, logout, protected-page redirect and re-login passed in Chrome. The
pending-OAuth statements and command output below describe the earlier Neon
setup checkpoint; current acceptance status is in STATUS.md. The first remote
[CI run has since passed](https://github.com/shahrilyusoff11/duitflow/actions/runs/43630396318).

## Result

The app uses the owner's existing **Free** Neon organization/project:

| Context | Value |
| --- | --- |
| Organization | org-withered-mountain-16883150 |
| Project | solitary-hill-74765097 |
| Branch | production |
| Branch ID | br-holy-paper-bd8x7t8d |
| Services used | Postgres only |

No plan, payment method, paid service, project, auth provider, or hosting provider
was substituted. The local production Next.js server is running at
http://127.0.0.1:3000. This does not publish the web frontend to Neon or Vercel.
GitHub OAuth still needs its Client ID/secret and real browser consent verification.

## Requested CLI sequence

1. `npm i -g neon@latest` installed Neon CLI **9.5.0** successfully.
2. Ran the exact requested initialization:

   ```sh
   neon init -y --org-id org-withered-mountain-16883150 --project-id solitary-hill-74765097 --branch production --services postgres
   ```

   It generated `neon.ts`, linked ignored `.neon`, installed agent tooling, added
   `@neon/config` / `@neon/env`, and added `.neon` to `.gitignore`. Initial linking
   was offline, explicitly not proof of live access.
3. `neon deploy` opened browser OAuth and reported `Auth complete (profile
   DEFAULT)`. It then reported:

   ```text
   No changes — branch production already matches the policy.
   Utilized services: Postgres
   Pulled 5 Neon variables into .env
   ```

   Names only: DATABASE_URL, DATABASE_URL_UNPOOLED, NEON_BRANCH, NEON_BRANCH_ID,
   NEON_FUNCTION_HOST_SUFFIX. The last is metadata, not a deployed Function.
   Existing non-Neon environment values were retained. No secrets are recorded
   in this report, application logs, or tracked example files.

## Skills and MCP inventory

Fetched the exact requested source successfully with PowerShell HTTPS:
[Neon skill](https://neon.com/.well-known/agent-skills/neon/SKILL.md).
The web extraction tool could not access that URL, so the direct HTTPS download
was used. The fetched file was kept in the OS temporary directory for inspection.
The installed overview and neon-postgres skills were read and applied.

The initialization installed the **neon-postgres 3.0.8** user-level plugin for
Codex and VS Code. The Codex plugin is enabled in
`C:/Users/shahr/.codex/config.toml` and bundles:

- Seven skills: neon, neon-postgres, neon-auth, neon-functions,
  neon-object-storage, neon-ai-gateway, neon-realtime.
- The URL-only HTTP MCP server `https://mcp.neon.tech/mcp` in the plugin's
  `mcp.json`. No project-level API key was created.

Its installed package is under
`C:/Users/shahr/.codex/plugins/cache/plugins-cli/neon-postgres/3.0.8/`.
`neon skills status --global` reports **all seven up to date**. User-level
installation applies to this project. Following the skill's instruction not to
duplicate plugin-provided MCP/skills, no extra project `.codex/config.toml`, MCP
entry, or redundant skill install was added. The existing node_repl MCP entry
remains in the user's Codex configuration. MCP configuration was inspected; the
current chat used the authenticated CLI, not a live Neon MCP tool call.

The requested `init` also reported adding user-level Neon skills/MCP support for
Antigravity, Gemini CLI, GitHub Copilot CLI, Hermes and OpenCode. Its printed file
updates were:

- `C:/Users/shahr/.gemini/config/mcp_config.json`
- `C:/Users/shahr/.gemini/settings.json`
- `C:/Users/shahr/.copilot/mcp-config.json`
- `C:/Users/shahr/AppData/Local/hermes/config.yaml`
- `C:/Users/shahr/.config/opencode/opencode.jsonc`

These were CLI-managed Neon additions. The agent did not replace these files or
rewrite unrelated settings. Copilot CLI was absent from PATH, so its plugin
could not install; the CLI installed skills/MCP as its fallback. No retry or
duplicate installation was needed after the later inventory request.

## Application/repository changes

- `neon.ts`: generated Postgres-only policy, Managed Auth disabled; existing
  branch settings are retained by the branch function. It was not rewritten
  after creation. A final `neon config plan` reports no changes.
- `.neon`: owner-specified production context, git-ignored. It remained pinned
  to production throughout verification; temporary validation did not check out
  another branch or replace the main environment file.
- `.env`: Neon-managed variables pulled into the existing ignored file; auth
  secret and other configuration retained. Credentials were not printed.
- `.env.example`: documents DATABASE_URL_UNPOOLED and the DIRECT_URL alias,
  with placeholders only.
- `src/lib/config/database.ts`, `prisma7.config.ts`, `scripts/setup-check.mjs`:
  CLI migrations use DATABASE_URL_UNPOOLED first, then DIRECT_URL. They reject
  pooled migration URLs and never fall back to the app's DATABASE_URL. The old
  DIRECT_URL placeholder was preserved, not silently changed.
- Runtime remains Prisma 7.10.1 with node-postgres over pooled DATABASE_URL,
  one connection per instance, on the Node.js runtime. No HTTP-only database
  transport was substituted for the interactive transactions used by the app.
- `src/app/api/health/route.ts`: real, uncached database readiness query; returns
  only generic status, with no database host, schema, secrets, or user records.
- `scripts/neon-preflight.mjs`: read-only connectivity/schema inventory.
- `scripts/verify-neon.mjs`: real pooled Prisma, migration count, atomic default
  categories, exact money/date read-back; synthetic writes are always rolled back.
- `scripts/verify-live-app.mjs`: headless real-browser checks against the running
  app, with real Neon behind its health route. No mocks or auth bypass.
- `package.json` / lockfile: init added @neon/config and @neon/env; pg is now a
  direct dependency; tsx is a dev dependency for Prisma's generated TS imports.
  Added db:preflight, verify:neon and verify:app commands.
- `tests/unit/database-config.test.ts`: migration URL precedence and pooled-URL
  rejection checks. `tests/helpers/start-browser-server.mjs`: explicitly
  overrides DATABASE_URL_UNPOOLED so fixture migrations stay on the disposable
  local test database even when real Neon credentials exist in .env.
- `AGENTS.md`, README, DECISIONS, SETUP and STATUS: updated Neon authorization,
  env naming, commands, evidence and remaining GitHub work.

## Migration safety and live proof

Read-only preflight confirmed an empty public schema and organization plan
`free`. A temporary child of production was used to validate all three existing
reviewed migrations before applying them to production. Its env was written to
a separate ignored file, without changing .neon or the production .env.

After validation, the same migrations were applied to production. The temporary
branch **duitflow-verify-mwgr5f5q** and its temporary env file were removed.
The final branch inventory contains only production. Verification transaction
records were rolled back; no synthetic users, categories or transactions remain.

Actual successful command output:

```text
npm run db:deploy
All migrations have been successfully applied.

npm run db:status
Database schema is up to date!

npm run verify:neon
Neon pooled connection through Prisma: PASS
Reviewed migrations applied: 3
Atomic per-user category seeding (10 categories): PASS
DECIMAL 12.50 and Malaysian DATE round-trip: PASS
Verification rolled back; no test records remain: PASS

npm run build
Compiled successfully
Finished TypeScript
Generating static pages (7/7)
/api/health  Dynamic

npm run start -- --hostname 127.0.0.1 --port 3000
Ready in 155ms

npm run verify:app
Live app landing page: HTTP 200, rendered
Browser -> /api/health -> Prisma -> Neon: HTTP 200 {"status":"ok","database":"connected"}
Anonymous dashboard redirects to sign-in; profile returns HTTP 401: PASS
Real GitHub OAuth verification: pending provider credentials
Browser runtime errors: 0
```

Lint/typecheck pass. **43 unit/integration tests and 8 browser tests pass.**
The ordinary browser test suite continues to use disposable local data; the live
verification commands above are separate, explicit checks of real Neon.

## Failures, warnings, and remaining work

- The first temporary-branch create included a suspend-timeout setting and was
  rejected: `modifying the suspend interval is not permitted on this account`.
  Confirmed no branch had been created; retried without that setting. No plan
  change or paid workaround was used.
- The initial standalone verification runner used native Node TS loading, which
  could not resolve generated Prisma's extensionless imports. It was corrected
  to use tsx; branch and production verification then passed.
- A first inline preflight attempt hit a PowerShell/JavaScript quoting error;
  the maintained preflight script replaced it and connected successfully.
- Python was unavailable for a configuration inventory attempt. A read-only
  Node inventory succeeded instead; no Python installation was needed.
- pg emitted a non-fatal SSL-mode future-semantics warning for the Neon-provided
  `sslmode=require`. The installed version currently verifies fully. TLS was not
  disabled and the owner's pulled URLs were preserved.
- npm retains seven pre-existing moderate development-only lint-chain audit
  findings. The production dependency audit is clean.
- GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are still empty. Real GitHub OAuth
  consent/sign-in/out is not claimed complete. Follow SETUP.md's GitHub section.
- The local app is running; no public frontend URL or Vercel deployment exists.

No paid upgrade, billing method, real financial operation, unsolicited feedback
message, or additional Neon service was enabled.
