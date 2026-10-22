# Application profiles: dev, demo, prod

**Current deployment:** the `demo` environment is now provisioned/live and validated with synthetic accounts/data. See `HOSTED-DEMO-22-Oct-2026.md`. Production setup is still pending. Statements below about what profile selectors themselves do remain applicable; provisioning was a separate explicit user request.

Profiles select configuration/resources, not a different code branch. The JS backend and v1 API stay the same. Implemented selectors do not create cloud resources, enable auth on the existing test deployment or run a deployment/migration/reset automatically.

| Profile | Runtime / database | Auth / cleanup |
| --- | --- | --- |
| dev | Local Worker on 8787; isolated `.wrangler/profiles/dev`; `aurelia-dev-db` | Synthetic header-based data locally by default. Optional real auth via `.dev.vars.dev`. Reset command refuses dev. |
| demo | Hosted `aurelia-api-demo`; dedicated `aurelia-demo-db`; matching demo frontend | Configure real auth before remote use. Manual one-command reset retains products/approved accounts. |
| prod | Hosted `aurelia-api-prod`; dedicated `aurelia-prod-db`; matching production frontend | Auth required, legacy demo identities disabled, reset disabled/refused. |

## Switch the selected profile

Use the same `--profile` value in the UI and API repositories:

```powershell
# Local development: run in each repository's terminal.
npm run start -- --profile=dev

# Build the isolated demo artifacts: run in each repository.
npm run build -- --profile=demo

# Build production artifacts: run in each repository.
npm run build -- --profile=prod
```

API builds are Wrangler **dry-run bundles**, not deployments. UI outputs are `dist/dev`, `dist/demo`, `dist/prod`; deploy exactly the selected directory to its corresponding Pages project. Local start is dev only: demo/prod profiles refer to hosted environments, so a local demo copy cannot be mistaken for the remote database reset target.

For a shell-session selection, PowerShell equivalent of Spring's active profile:

```powershell
$env:AURELIA_PROFILE = 'demo'
npm run build
# In the API repository, after deployment prerequisites are ready:
npm run deploy
# Clear the selection when finished:
Remove-Item Env:AURELIA_PROFILE
```

An explicit `--profile=...` overrides the shell selection. API deploy and migration require a profile to be explicitly selected by flag or AURELIA_PROFILE. Never rely on an implicit production target. `npm run deploy -- --profile=demo` and `--profile=prod` affect their separate Workers only after valid account/DB settings and auth flags are configured. No remote operation was performed while implementing this feature.

## One-time configuration

- `wrangler.dev.json` is ready for local-only use, with a placeholder UUID. Run local migrations/seed with `npm run db:migrate:local` and `npm run db:seed:local`; these use the same isolated persistence directory as local start. Existing local data in the old default Wrangler directory is not silently imported.
- Copy `wrangler.demo.example.json` to ignored `wrangler.demo.json` and `wrangler.prod.example.json` to ignored `wrangler.prod.json`. Fill real account IDs, **different** DB UUIDs, frontend origins and AUTH_BASE_URL. Each profile owns all its vars/bindings explicitly. Name/account/DB profile mismatches, shared UUIDs and reuse of the existing test binding are refused by the remote launcher.
- Store remote AUTH_SECRET, Google and mail secrets on each matching Worker with Cloudflare secrets. Use a different auth secret and separate approved Google client/callback configuration per environment. Never use VITE_ variables for secrets.
- Local auth uses ignored `.dev.vars.dev`, copied from `.dev.vars.dev.example`, plus UI `.env.dev.local` with `VITE_DATA_MODE=api` and `VITE_AUTH_ENABLED=true`. The launcher explicitly selects that file, so generic `.dev.vars`/`.env` cannot bleed into another profile. Profile identity/reset flags belong in Wrangler config, not the secrets file.
- Hosted demo/prod secrets are not loaded from local files by profile builds/deploys. Configure remote secrets before enabling auth and completing remote migrations. Migrate only the intended target with `npm run db:migrate -- --profile=demo` or `--profile=prod`; these are remote mutations and were not run here.
- The UI uses same-origin `/api/v1` for demo/prod. Bind its Pages API gateway to the corresponding Worker with `AURELIA_API`, or its correct HTTPS upstream. Use separate frontend origins. Profiles cannot infer cloud IDs, wire Pages bindings or supply OAuth/mail credentials automatically.
- Complete demo baseline setup in `DEMO-RESET.md`. Bootstrap private reusable accounts with the deployed demo maintenance gate disabled, save the approved baseline, and enable the demo gate before exposing the app.

## Runtime isolation

Profile UI requests carry X-Aurelia-Profile. The API checks it before handling the request and includes its own profile on responses; the UI rejects a missing/different profile. This detects mismatched paired deployments, not a permission grant or a substitute for correct cloud bindings. Old API versions without this guard must not be used with new profile builds. Profile-specific session and guest cookie names prevent localhost profiles from overwriting each other's cookies. The identity cache includes the profile.

Production refuses runtime auth-off/demo-identity configuration. Maintenance/reset opt-in is valid only for APP_PROFILE=demo. Reset tooling also verifies the selected profile and fixed target/baseline identity. With AURELIA_PROFILE=prod or dev, `npm run demo:reset` refuses; without a shell selection, that demo-specific command explicitly defaults to the demo target. Its deletion confirmation remains required.

The existing `wrangler.jsonc --env test`, `deploy:test` and UI's unprofiled legacy CI build remain compatibility paths for the currently deployed test app. They are not aliases for prod/demo and do not activate the new auth rollout. Move CI to explicit profiles only after cloud resources, bindings, migrations and auth have been validated.

Compilation checks do not validate real Google/mail callbacks, remote environment separation or destructive cleanup. Preview/end-to-end and disposable reset validation remain release gates. No application tests were added or run in this profile change.

Framework references: [Wrangler environment isolation](https://developers.cloudflare.com/workers/wrangler/environments/), [Vite modes](https://vite.dev/guide/env-and-mode).
