# Cloudflare test deployment

Branch: aurelia-commerce-cloudflare. Test Worker: aurelia-api-test. Test D1: aurelia-test-db. Test Pages project: aurelia-ui-test (provisional; verify availability). No production database is used.

1. Authenticate with `npx wrangler login` and confirm account with `npx wrangler whoami`.
2. Create remote demo DB: `npx wrangler d1 create aurelia-test-db`.
3. Copy its database ID into env.test.d1_databases in wrangler.jsonc. Preserve the default local binding.
4. Run `npm run db:migrate:test`.
5. Generate seed: `node scripts/createSeed.mjs`. Review the synthetic SQL, then import ONCE: `npx wrangler d1 execute aurelia-test-db --remote --config wrangler.jsonc --env test --file seed.sql`.
6. Set env.test.vars.ALLOWED_ORIGINS to the actual test Pages URL; no wildcard.
7. Run tests/check, then `npm run deploy:test`.
8. Verify the deployed /api/health and /api/services endpoints and configure UI with the actual Worker URL.

Test data endpoints are explicitly enabled by DEMO_MODE=true. Owner headers are not authentication. Use only disposable synthetic data, and restrict access before storing real customer data. Do not attach this Worker to a production D1 binding.

For automatic deployment, the supplied GitHub Actions workflow deploys the current branch after tests/typecheck. Set repository Actions secrets CLOUDFLARE_API_TOKEN (Workers edit and D1 access for this account) and CLOUDFLARE_ACCOUNT_ID. Use an API token, not the local OAuth credential. Workflow execution is pending those secrets and a push. Never put a seed/reset command in auto-deploy. Reviewed schema migrations run separately.

First deployment requires account authorization; configuration alone does not establish live deployment success. Sonar files remain unrelated uncommitted work and should not be staged with this deployment feature.

## Independent repository secrets

Store CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID separately in each repository Actions secrets. Both repositories can use the same account and token with Pages, Workers and D1 permissions. Rotate both copies when the token changes. Each workflow deploys only its own repository. Secret updates require a workflow rerun or branch push. No cross-repository checkout or organization subscription is needed. The UI deployment targets the existing aurelia-test Pages project. Database seed/reset is not part of deployment.
