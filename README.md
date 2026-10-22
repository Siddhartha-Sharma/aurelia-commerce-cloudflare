# Aurelia Commerce Cloudflare API

Cloudflare Worker + D1 backend for products, orders, customers and payments.
`src/auth/` integrates `snort-auth-js` with Aurelia permissions and MFA policy.

## Fresh local setup

```bash
npm ci
npm run db:migrate:local
npm run db:seed:local
npm run start -- --profile=dev
```

Seed only a fresh synthetic dev database. Local data stays in `.wrangler/profiles/dev`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run check` | TypeScript check |
| `npm run build -- --profile=demo` | Dry-run bundle; does not deploy |
| `npm run deploy -- --profile=demo` | Deploy configured demo Worker |
| `npm run demo:reset` | Confirmed demo-only cleanup; preserves products |

Before hosted use: configure the correct DB, migrations, origins and secrets. Auth is mandatory for production; Google/email flows need provider credentials. Use disposable databases for tests.

## References

- [Profiles/deployment](docs/PROFILES.md) / [Auth rollout](docs/AUTH-ROLLOUT.md) / [Demo reset](docs/DEMO-RESET.md)
- [Repo ownership](docs/THREE-REPO-DELIVERY.md) / [v1 contract](contracts/v1/README.md)
- [Auth provenance](vendor/auth-provenance.json): commit active tarball and lockfile; no sibling repo required.
