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

The new shared MCP server's `list_teams` tool has not yet been exercised in this
already-running desktop chat. Its tool catalogue still exposes the pre-existing
desktop connector, which has a different account/scope and returned an access
error. CLI deployment uses the explicitly verified personal Hobby workspace.
The CLI server list was refreshed and confirms successful OAuth. A fresh Codex
chat/client reload is needed to load the new server tools; then call
`search_vercel_documentation` and authenticated `list_teams` and verify `SY`.
No unrelated connection was removed, no confirmation settings were weakened,
and no MCP token was extracted or printed.

## Project and release

- Local checkout linked to `sy-74fc/duitflow`, project
  `prj_3N2G8nhG2CQIMOaMGFSPxwLhStRQ`.
- Canonical public origin: [DuitFlow](https://duitflow-lyart.vercel.app),
  [synthetic demo](https://duitflow-lyart.vercel.app/demo).
- Next.js preset, `npm ci`, `npm run build`, Node **26.x** (repository-supported),
  basic Hobby build machine (2 vCPU / 8 GB), Node functions in **cle1** near the
  existing Neon `us-east-2` database. No paid build machine, add-on or new DB.
- Production-only database/auth settings; existing auth encryption secret
  preserved. Direct migration URLs and production secrets were not added to
  previews. `AI_PROVIDER=deterministic`; no Gemini key or Free-project attestation.
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

## OAuth, Telegram and remaining live checks

The owner confirmed adding the production callback to the existing GitHub OAuth
app while preserving localhost. Existing client credentials were reused without
creating or printing another secret. Production real sign-in and web/Telegram
financial smoke verification still require the owner's real sessions because
Windows computer use stopped when it could not verify the current browser URL.
No session was fabricated or borrowed for verification.

The owner saved bot credentials directly in ignored `.env`. Telegram `getMe`
verified `duitflow00bot`. A random webhook secret was generated locally without
printing it. The bot token/secret are stored only in ignored local configuration
and Production Secret variables; bot username is Production Config. Registration
and the final Telegram-enabled release evidence belong in STATUS.md. The secret
must never be pasted into chat, screenshots, Git or command arguments.

See [the deployment runbook](DEPLOYMENT.md) for gated provider actions, live
synthetic checks and rotation. Stop before Stretch; Gemini setup/live calls still
need separate approval.
