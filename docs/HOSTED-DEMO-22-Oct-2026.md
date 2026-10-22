# Hosted demo — 22-Oct-2026

## Live resources

- Shop: https://aurelia-demo-aqt.pages.dev/shop
- Owner/staff sign-in: https://aurelia-demo-aqt.pages.dev/login
- Customer sign-in: https://aurelia-demo-aqt.pages.dev/shop/sign-in
- Pages project: `aurelia-demo`, production branch label `demo`.
- API Worker: `aurelia-api-demo`, authenticated `APP_PROFILE=demo`.
- Same-origin Pages binding: `AURELIA_API` → `aurelia-api-demo`.
- Dedicated D1: `aurelia-demo-db`, UUID `3cc642e0-98d6-4722-97b4-06e4b451a85f`.
- Migrations 0001–0004 applied to this new demo database only.
- Existing `aurelia-test-db`/test Worker/Pages and production bindings were not reset or redeployed. Source catalogue reads were read-only.

89 products and the two existing catalogue configuration rows were copied from test. An exact row checksum matched after copying, including image fields. No customer/order/contact history was copied. Source catalogue/settings checksum: `1416bf8c84b83a535bf803c99673281da959c848eb530d88f8259b3cc43b9558`.

## Reusable accounts and dependencies

Three synthetic CUSTOMER/OWNER/STAFF accounts were bootstrapped by the trusted operator, with random passwords and verified fictional `.example` emails. Credential hashes in D1 use the current explicit scrypt policy. Demo AUTH_SECRET was generated in memory and stored in Cloudflare only. Owner/staff MFA was enrolled and verified; it remains required on later logins and is preserved across reset. Staff can create POS sales/customers, read inventory/orders, update customers/fulfilment and confirm payments; owner-only destructive/settings/team actions remain restricted.

Windows-user-restricted, git-ignored handoff folder: `.demo-private/` in the API repo. `DEMO-ACCESS.md` contains the operator login details, instructions and recovery codes; `owner-authenticator.png` and `staff-authenticator.png` let the presenter add those fictional accounts to an authenticator. `demo-access.json` is the private machine-readable equivalent. These handoff files intentionally contain synthetic login/MFA secrets, are not runtime database password storage, are not uploaded to the UI and must not be committed or shared as public assets.

Google OAuth and Resend credentials were explicitly deferred by the user. Google login is unavailable; new email signup, verification email and email password reset are unavailable. The UI explains existing-account use, and the backend rejects email-dependent requests before creating an unfinishable signup. Customer account creation can be enabled later after the email provider is configured; Google is a separate setup. The current demo uses provided accounts, not new visitor signup.

## One-command remote reset

From the API repository:

```powershell
npm run demo:reset
```

Review the configured remote demo target and type `RESET` once. The command handles validation, maintenance, cleanup, baseline restoration, session revocation and final checks. It targets Cloudflare, not local D1. Products are not deleted. Newly introduced non-product configuration rows absent from the clean baseline are removed, so shop/payment details typed during a demo do not remain just because the original baseline had no such row. New product rows are preserved. Retained account password/MFA/role/permission edits are not rolled back; use disposable accounts for those security-management demonstrations.

Private `wrangler.demo.json` and `demo-reset.config.json` are configured to the exact demo UUID and the three retained user IDs. Production/dev reset is refused. Close demo tabs and run reset after each presentation. No scheduled automatic deletion is enabled. Do not run the one-time catalogue/account bootstrap scripts again against an active demo.

## Actual hosted validation completed

`scripts/verifyHostedDemo.mjs --confirm=aurelia-demo-db` ran against the real Pages domain with synthetic data, then restored the clean state:

- Hosted login HTML and same-origin API health/profile.
- Anonymous order access denied and wrong-profile requests refused.
- Reusable CUSTOMER password login.
- OWNER and STAFF password login, authenticator enrollment/verification and assurance.
- Customer bag + online COD order; owner order review; staff fulfilment; owner delivery/payment confirmation.
- Customer private-directory access and staff product deletion denied.
- Visitor/auth record cleanup, cart/wishlist/customer/order/payment/activity cleanup, removal of newly introduced configuration, sign-out of existing sessions.
- All 89 products and all baseline settings restored with the exact original full-row checksum, including image fields.
- Exactly three retained auth users; no leftover active sessions from verification.

The successful report is `.demo-private/hosted-demo-validation.json` (counts/results only). The disposable verification user's record was removed. Credentials/OTP values were not printed into chat.

Browser automation could not start because the local tool kernel failed twice. Therefore actual browser rendering, focus/mobile/accessibility and visual screenshot review are **not** claimed complete. HTML availability and real hosted API flows are verified; this is not a full security or load audit. Cloudflare Time Travel/platform logs/previous exports have independent retention; active database reset is not a promise of immediate forensic erasure or storage compaction.

## Fixes found while validating

- Reusable auth-server 0.1.3 preserves the request stream before the provider consumes it, so post-MFA replay/assurance hooks can read the verification body. This fixed the hosted verification error without relaxing MFA.
- The operator catalogue importer chunks image-bearing JSON before SQLite assembly to respect D1's SQL statement limit while preserving exact data.
- The UI profile deployer stages a canonical Pages config and Functions/assets snapshot. Pages disallows custom Wrangler config paths/account_id in its config; the selected account is passed through the environment instead. This avoids changing the existing test project's root configuration.

Changes are deployed directly to the isolated demo from the current working trees. No Git commit/push or merge was performed.
