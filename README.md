# إتمام | ETMAM CV

Independent Arabic/English CV website sharing accounts, resumes, Zid activation codes and AI usage with `@etmam_cv_bot`.

- Website: https://etmam-cv.netlify.app/
- Editor example: https://etmam-cv.netlify.app/try?example=1
- Telegram: https://t.me/etmam_cv_bot
- Support: https://t.me/mohamdto21

## Local development

Use Node 22.18+ and pnpm. Install with `pnpm install --frozen-lockfile`, copy `.env.example` into `.env.local` and supply public Supabase settings, then run `pnpm dev`. `pnpm build` performs TypeScript validation and produces `dist/`. `pnpm test` verifies the domain model and renderer safety.

Only public configuration may have a `VITE_` prefix. Never put service credentials, activation codes, encryption keys or OpenAI keys in this folder's public files. `.env.local`, `private/`, the bot database and private deployment configuration must stay outside Git.

## Architecture

- React/TypeScript/Vite static frontend on a new Netlify Free Legacy project. Existing Netlify projects are untouched.
- Existing Supabase project `okwqqkcifvmaoarlemix`, isolated `etmam` schema. All tables have RLS and no browser grants. Server-only RPC gateway functions enforce account ownership, revision checks and atomic quotas.
- `etmam-api`: verifies the Supabase user token and confirmed email, resolves the canonical account, and handles drafts, activation, linking, jobs and exports. CORS allows the configured frontend origins only.
- `etmam-telegram`: validates the Telegram webhook secret, persists the update before acknowledgement and drains it asynchronously. Conversation state is separate from canonical document content. `max_connections=1` is used at cutover.
- `etmam-maintenance`: authenticated recovery of previously queued jobs/updates, never automatic retries of an interrupted AI call. Its five-minute Cloudflare trigger is enabled following the user's explicit approval.
- `etmam-cv-renderer`: isolated Cloudflare Browser Run Worker; controlled HTML, embedded licensed Tajawal fonts, JavaScript and external resource fetching disabled. Shared account free quotas apply, including browser launches at most once every 20 seconds. One bounded retry handles launch throttling; daily exhaustion fails safely.
- Private Supabase Storage bucket `etmam-private`, owner-checked five-minute download links, cache keyed by account/content/revision/design/renderer version. Approved PDF export is shared by the bot and website.

The runtime secrets use Supabase platform environment variables when configured, otherwise a single encrypted Supabase Vault entry `etmam-runtime-v1`. Only the service role can call its accessor; the decrypted Vault view is never granted to browser roles. Existing Elmam secrets and authentication templates were not overwritten.

## Product rules

25 SAR buys three calendar months from activation, up to three drafts and 20 successful AI requests. Active renewal extends the expiry and adds 20 operations; expired renewal starts a new allowance. Reusing a code cannot grant twice. Existing short and legacy codes keep their original HMAC compatibility.

Manual editing, preview and PDF export do not consume AI operations. Improvement, translation, import and assistant requests share the same quota across channels. Inputs require consent; proposals require review and a matching document revision before application. Failed requests do not charge; interrupted provider calls become `uncertain` and are not silently replayed.

After expiry, drafts remain readable and only the last approved snapshots are downloadable. A changed, unapproved draft must not replace its previously approved snapshot.

Guests may edit and preview. Their draft is stored temporarily in browser session storage; server persistence and export require activation. Guest session storage is not a permanent account backup.

Email and Telegram link through a five-minute, single-use token plus confirmation in Telegram. CV contact fields and usernames are not ownership evidence. Two independently used accounts are referred to support rather than merged automatically.

## Email launch gate

Email login is enabled in the published build as of 2026-10-31. Resend verified `auth.etmamsa.online`; Supabase custom SMTP sends from `login@auth.etmamsa.online` using a sending-only domain-restricted key stored outside this repository. Signup and magic-link templates include `{{ .Token }}` and retain `{{ .ConfirmationURL }}`. Actual OTP delivery to the owner's designated Gmail address was confirmed as Delivered in Resend; the deployed website successfully reached the code-entry screen. The owner entered the emailed OTP successfully on the published website; the UI displayed My Drafts and My Account. Delivery to a second address has not been separately tested.

Preserve Elmam's existing email flows: when configuring SMTP/templates, include compatible existing links where needed and retain existing allowed redirect URLs. Do not change the project Site URL to ETMAM unconditionally. After delivery and regression checks, set `VITE_EMAIL_LOGIN_READY=true`, rebuild and redeploy. A frontend deployment alone does not complete this gate.

## Validation and release

See `docs/CLOUD_E2E.json`, `docs/PDF_VERIFICATION.json`, `docs/BOT_CUTOVER.json` and `docs/RELEASE_STATUS_AR.md`. The cloud integration test uses an isolated synthetic account/code, real AI calls, approved PDF storage and cache; it deletes only its own disposable records. It does **not** prove external email delivery.

`scripts/validate-sql.mjs` runs the entire migration and behavioral SQL checks inside a rollback-only transaction on the isolated local validation database. The database is initialized with existing PostgreSQL binaries by `scripts/init-test-db.mjs`; Docker/WSL is not required. The scripts currently contain this workstation's paths and must be adjusted on another machine.

Bot conversation UI is vendored from the approved bot, with source hashes in `docs/BOT_SOURCE_PROVENANCE.json`. `scripts/vendor-bot.mjs` is a development maintenance tool, not a production dependency. `scripts/pdf-matrix.mjs` likewise uses the existing bot's synthetic fixtures for QA only.

Manual Netlify deployment uploads `dist/` or its zip, never the full source/private directory. `_redirects` and `_headers` are included in the built frontend. The local-only `review-mobile.html` fixture is not included in the production build.

## Recovery

Do not rerun the SQLite importer after the cloud cutover. Its final-delta flag is restricted to a controlled migration with every writer stopped; replaying the original database afterward could overwrite newer work or reactivate redeemed codes. The cutover script refuses to run if cloud mode or a webhook is already active.

Rollback requires freezing both channels, backing up the current cloud ETMAM data and exporting all post-cutover changes before changing the webhook or restarting the old poller. Never restore an old SQLite snapshot and resume accepting codes: new redemptions, drafts and AI usage would be lost. Prefer rolling back a Netlify deployment or Edge Function version while keeping the shared database as the source of truth.
