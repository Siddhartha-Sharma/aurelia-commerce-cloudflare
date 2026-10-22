# Manual demo reset

**Deployment update:** the isolated hosted demo is now configured and its synthetic reset flow has been validated. See `HOSTED-DEMO-22-Oct-2026.md` for current URLs and evidence. The original setup instructions below remain useful for another environment.

## Routine use: one command

This tool now validates the `demo` application profile (`APP_PROFILE=demo` in wrangler.demo.json). A shell AURELIA_PROFILE=dev/prod refuses reset; a demo-specific command without a shell selection defaults to demo. Keep the reset config aligned with that same dedicated profile. See `PROFILES.md`. Remote use requires auth-enabled configuration after bootstrap setup.

After one-time administrator setup, close demo tabs and run only `npm run demo:reset` from the API repository. The terminal displays the target and summary and asks you to type `RESET` once. This is the explicit deletion confirmation, not another command. Target validation, maintenance, cleanup, baseline/stock restore, session sign-out and final count checks run together. Separate status/dry-run commands are optional diagnostics. No scheduled automatic deletion is enabled.

## Availability and boundaries

The CLI is implemented in `scripts/demoReset.mjs`. It is manual, remote-D1 only, and has no cron, automatic logout cleanup or automatic daily deletion. The hosted demo database/configuration is provisioned and its synthetic remote reset passed validation; see the deployment report. This does not authorize resets on existing test/production databases.

Run from the **API repository**, not the UI or historical combined repository:

```powershell
Set-Location 'E:\Siddhartha Buisness Project\aurelia-commerce-app\aurelia-commerce-worker-api'
```

## One-time setup before the first demo

1. Create a **new dedicated Cloudflare D1 demo database** and isolated demo Worker/frontend. Do not reuse the current test/production database. Copy `wrangler.demo.example.json` to ignored `wrangler.demo.json` and `demo-reset.config.example.json` to ignored `demo-reset.config.json`. Fill in the matching account ID, database UUID/name and dedicated demo Worker configuration. No tokens/passwords belong in the reset configuration.
2. Apply migrations 0001–0004 and import the approved catalogue/settings into this new database. Do not seed personal customer/order history. Preserve source images and clean product data. Configure auth/Google/mail/owner invitations following `AUTH-ROLLOUT.md` against this isolated environment only.
3. Bootstrap the fictional reusable owner, staff and customer accounts **before enabling the maintenance gate in the deployed demo Worker**. For bootstrap only, deploy this isolated Worker with `DEMO_RESET_ENABLED=false` and real auth enabled; keep the demo private. Record their immutable auth user IDs in `retainUserIds`. Use fictional personal details and controlled test mailboxes. At least one retained account must be an active OWNER. Staff permissions and MFA must be configured before the demo.
4. Set `DEMO_RESET_ENABLED=true` in the local dedicated Worker config so the maintenance CLI can validate the target. Save the clean baseline with the command below while no visitors use the environment. Then deploy the dedicated Worker with this setting true before opening any demo. The regular test/prod Worker configuration remains untouched. An opted-in Worker without a saved baseline refuses traffic.

```powershell
npm run demo:status
npm run demo:baseline -- --confirm=aurelia-demo-db
```

The baseline contains only approved catalogue/settings rows, not visitor accounts, orders, passwords or personal-data exports. Baseline capture refuses visitor accounts, orders/payments and inventory movement history. It is a one-time operation, not something to run after every demo. To intentionally update an existing clean baseline, use `demo:baseline` with `--replace` and the same explicit confirmation; never capture stock after a sale as the new starting stock.

## Before each demo

```powershell
npm run demo:status
```

The status command above is optional. If previous demo activity remains, close demo browser tabs and run the single reset command:

```powershell
npm run demo:reset
```

Reload the shop/dashboard and sign in again with the reusable accounts. Checkout signup can be demonstrated with a disposable visitor account; that account is removed on reset. A reusable account already exists, so it demonstrates login rather than fresh signup.

## After each demo — recommended time to reset

Close demo tabs and run the command below; type `RESET` at its confirmation prompt. Do not reset while presenting, while someone is placing an order or while another operator is doing maintenance. The command checks and prints the final result itself. No separate status/dry-run command is required. A second reset before the next demo is unnecessary if the environment stayed unused.

```powershell
npm run demo:reset
```

An interactive reset requires typing `RESET` after reviewing the displayed target. Noninteractive administrator use retains the original `--confirm=<database-name>` gate; an incorrect explicit confirmation always fails. One-time baseline setup still requires that explicit database-name confirmation. There is no unattended default reset. Failed CLI/configuration checks do not silently switch to test/production. Unknown resources/tables need retention review before reset.

## Reset policy

| Preserved / restored | Cleared from the active demo database |
| --- | --- |
| Every current product; existing baseline products are restored even if a demo deleted them | Orders, payment/reference records, inventory movements |
| Baseline product fields, stock, image references, SKU, category and prices | Customer contact/history records, including archived records |
| Baseline shop profile, payment settings, themes, feature flags, custom purities and campaign settings | All carts, wishlists, personal profiles, addresses, shared-product activity, stock alert contacts and product-view history |
| Explicit retained account IDs, their existing password hashes, provider links, roles/permissions and MFA setup | All other auth users and their cascading linked credentials/access/MFA records |
| New product rows added after the baseline (no product DELETE exists in reset SQL) | All sessions, verification links, rate-limit entries, MFA transient records, invitations, audit/support records, guest claims and POS drafts |

New products added after the baseline are retained with their current values; approve a new clean baseline if their stock/settings must also be restored on subsequent demos. Product SKU conflicts or SQL failures stop the reset and leave maintenance active. Do not resolve a conflict by mass-deleting products.

The reset does not roll back retained account password/MFA/permission edits, erase their Google links or recreate their roles. Exercise password/account-access changes on disposable accounts when a fresh account is needed next time. It does not change Google passwords or delete a Google account. Login secrets are not copied into baseline snapshots.

## Maintenance / failure handling

The Worker refuses demo requests while reset is locked. D1 triggers additionally block application transaction commits and provider/team INSERT/UPDATE operations during maintenance. Cleanup is restartable; **do not assume all SQL import statements form one cross-command transaction**. If a step fails, partial cleanup stays behind the maintenance gate until resumed successfully. No success is printed before checking visitor/activity counts and verifying the product count did not decrease.

The command prints a maintenance ID. If it fails, first stop the previous CLI process and resolve the reported configuration/data issue. Then rerun `npm run demo:reset -- --resume=<printed-maintenance-id>` and confirm at the prompt (or rerun the original baseline setup action with its database-name confirmation if setup failed). Resume takes ownership of the lock; never run concurrent reset processes. A dry-run/status does not unlock maintenance. There is deliberately no unsafe force-unlock command.

## Privacy, backups and limits

No visitor SQL export, pre-reset personal-data backup or user detail list is generated by this tool. Its summary prints counts, not names/emails. Temporary maintenance SQL contains only retention IDs and statements and is removed after execution. Keep the operator configuration private.

Deletion is from the **active demo database**. Cloudflare Time Travel/backups, existing manual exports, platform logs, email inboxes and Google/provider records have independent retention. This command cannot promise immediate erasure of those copies or physical database compaction. Review retention/deletion there separately. Retained synthetic accounts and approved shop details are an explicit exception, not a promise that every account is erased.

Before real use, validate the complete destructive reset on a separate disposable copy, including failure/resume, concurrent requests, visitor Google signup and unchanged product/image counts. No such database operation was run as part of this implementation.
