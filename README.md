# Aurelia Commerce Worker API

Independent Cloudflare Worker + D1 API. No React imports. Version 0.1.0: demo/development.

## Fresh local setup

```bash
npm ci
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Seed only a fresh demo database. Existing records use INSERT OR IGNORE. D1 local data stays in this project's .wrangler directory; it is not automatically copied from the backup repository.

## Review

```bash
npm test
npm run check
npx wrangler deploy --dry-run
```

Domain tests do not replace D1 integration/device tests.

## Deploy

Create a D1 database, replace database_id in wrangler.jsonc, set ALLOWED_ORIGINS to the Pages URL, apply remote migrations, seed reviewed synthetic data, then npm run deploy. DEMO_MODE defaults false; data endpoints are locked. Authentication is pending. Enable demo mode only for disposable synthetic demo data. Owner audience headers are not authentication.

Shared domain files in src/domain are owned here for live data validation. UI's mock domain copy must remain contract compatible. No SQL, migration or Worker runtime belongs in the UI repo.

## HTTP integration checks

Start the local Worker against a disposable synthetic D1 database, then in Git Bash:

```bash
AURELIA_TEST_API_URL=http://127.0.0.1:8790/api npm run test:integration
```

Without the environment variable the integration suite is skipped. Checks cover database health, customer permission boundaries, missing session, malformed JSON, disallowed origin and unknown route. These demo checks do not substitute for production authentication.
