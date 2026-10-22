# Auth implementation and rollout — 22-Oct-2026

**Current delivery update — 23-Oct-2026:** the reusable repository is `snort-auth-js`; UI/client versions are 0.1.2 and backend adapter is 0.1.4. The isolated hosted demo already has migrations and email/password + team MFA enabled. Existing test/prod were not changed by that demo rollout. Google and email delivery still need credentials. The numbered steps below describe the original rollout checklist, not an assertion that no demo has since been deployed. See `HOSTED-DEMO-22-Oct-2026.md` for completed demo validation and `THREE-REPO-DELIVERY.md` for repository ownership.

## Stable recovery points

Both application repositories have `backup/stable-before-auth-22-Oct-2026` branches. Source archives, full Git bundles, an existing dist archive and a remote **test** D1 export are in the sibling `backups/2026-10-22-pre-auth-refactor` directory. The existing dist archive is not evidence of a fresh build or a live deployment. Restore database exports only after reviewing the target environment and newer transactions.

## Branches

- UI: `aurelia/auth-ui-api-v1`
- Worker API: `aurelia/auth-api-v1`
- Local reusable module repository: `snort-auth-js`, branch `aurelia/auth-core`; first implementor / target label: `aurelia-commerce-ui`

## Structure

`src/index.ts` is the Cloudflare composition entry. `src/http/worker.ts` owns versioned transport, CORS and identity composition. `src/http/v1.js` owns public DTO projection and input normalization. `src/auth/` owns project access rules, repository, mail, guest bag transfer, invitations, support and private drafts. `src/domain/` retains jewellery rules. `src/d1Adapter.js` retains D1 transactions. Database/provider code is not imported by the UI.

Existing `/api/services` remains a compatibility alias governed by the same authorization as `/api/v1/services` when auth is enabled. Legacy header identities work only with explicit `AUTH_ENABLED=false` and `DEMO_MODE=true`. Disabled auth with demo disabled locks business endpoints. An auth configuration failure never falls back to demo access.

## Enable in a separate environment first

1. Keep stable traffic on its current version. Create a separate preview Worker/Pages environment and a database restored from an approved backup. Do not point preview code at the stable database.
2. Install with `npm ci` in UI/API. Vendor tarballs and lockfiles are committed inputs; no private npm registry is required.
3. Apply migrations 0002–0004 to the preview database using the appropriate Wrangler environment. No migration has been applied remotely by this implementation task.
4. Use HTTPS and a same-origin API gateway: configure Pages service binding `AURELIA_API` to the preview Worker, or set `API_UPSTREAM_ORIGIN` to its HTTPS origin. Frontend `VITE_API_BASE_URL=/api/v1`.
5. Configure Worker `AUTH_BASE_URL` to the **frontend** HTTPS origin, `AUTH_SHOP_ID`, `AUTH_APP_NAME`, an explicit `ALLOWED_ORIGINS` list and a random `AUTH_SECRET` of at least 32 characters. Store secrets with Wrangler/Cloudflare secrets, not committed env files. Keep the secret stable; rotation needs a planned provider/session migration.
6. Configure a verified Resend sender: `AUTH_EMAIL_FROM`, secret `RESEND_API_KEY`. Delivery/verification/reset links need real inbox validation. The mail adapter is replaceable.
7. Configure Google OAuth web application credentials. Set the authorized redirect URI to `<frontend-origin>/api/v1/auth/callback/google`, authorized frontend origin to the preview frontend, and secrets `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Configure consent publishing/test users in Google Cloud. Microsoft is intentionally excluded.
8. Create the initial owner invitation using `node scripts/createAccessInvitation.mjs --email=<owner-email> --role=OWNER --base-url=<frontend-origin> --output=bootstrap-auth/owner --shop=aurelia`. Inspect the generated SQL, then execute it only against the intended database. Deliver the private one-time URL securely. The CLI does not execute SQL or email invitations. Developer bootstrap uses `--role=DEVELOPER` after explicit review.
9. Set Worker `AUTH_ENABLED=true`, `DEMO_MODE=false`, and UI `VITE_AUTH_ENABLED=true`. Build and deploy both preview components together. Verify callback URLs before inviting users.
10. Complete environment-level login, recovery, cross-account isolation, staff restriction, payment/stock and checkout checks before production. Type-check/build success is not end-to-end evidence.

## Access policy

Password policy, HTTPS guards, package versions and the remaining release gates are recorded in `AUTH-HARDENING.md`. Local auth requires localhost/127.0.0.1 or HTTPS; LAN HTTP is deliberately not a secure auth environment.

- Customer signup always creates a customer identity. Owner/staff/developer access requires a server-stored, verified-email-matching, single-use invitation.
- Owner/staff/developer must enroll and verify authenticator MFA, including after Google login. Customers may opt into MFA in Account Security.
- Sensitive owner/team/payment/archive actions require verification within five minutes. A shared dialog asks for a new authenticator code, retains the screen and asks the user to retry the action. It never silently replays a destructive request.
- Staff permissions are allowlisted. Editing/adjusting inventory includes inventory read; changing orders/payments and viewing/exporting reports includes the corresponding read access. Browser flags cannot grant API permissions.
- Developer has diagnostics/support-request access only. Owner may approve a one-hour read-only support grant and revoke it immediately. No permanent platform superuser bypass.
- Staff disabling deletes their current sessions; later requests also check disabled access.
- Business mutations write their audit entry in the same D1 transaction. Team/support changes write access audit entries; those separate audit writes are not atomic with the management mutation.

## Customer experience and ownership

Shop → bag → sign in/create account → verified email → checkout. There is no customer dashboard. Personal orders, profile and security are separate utility screens. Offline POS customers do not need online accounts.

Anonymous bags/wishlists use signed HttpOnly guest cookies. Verified sign-in claims that bag once; stock and catalogue prices are re-read. Addresses, profile, wishlist, bag and online orders use server-selected account scope. A typed phone/email never claims old customer history. Existing demo/browser sessions and legacy order history are not automatically reassigned; any historical linkage requires a separately reviewed migration. POS drafts in auth mode are server-side, per user/shop, expire after seven days and never reserve stock. Legacy local-browser drafts are not imported into accounts.

The current deployment is single-shop per Worker/database. `AUTH_SHOP_ID` is an access namespace; it does not make the existing global catalogue a multi-tenant database.

## Recovery / limitations

Password reset revokes other sessions. Recovery codes are single-use and encrypted by the provider; displayed codes stay in UI memory until explicitly downloaded. Losing all factors needs an operational identity review. There is no automatic owner/developer MFA bypass or implemented support recovery queue. Do not disable MFA by editing database rows without a reviewed recovery procedure and audit trail.

Provider credentials, mail delivery, remote migrations, a remote auth repository, npm publication, browser security review and end-to-end validation remain release work. This task does not activate authentication on the live environment. Broad decomposition of the remaining Storefront/domain monoliths can continue independently without changing v1 DTOs.
