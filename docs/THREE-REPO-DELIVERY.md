# Three-repository auth delivery — 23-Oct-2026

| Repository | Branch | Responsibility |
| --- | --- | --- |
| `aurelia-commerce-ui` | `aurelia/auth-ui-api-v1` | All application/auth UI; first implementor |
| `snort-auth-js` | `aurelia/auth-core` | Reusable auth backend and optional UI adapters |
| `aurelia-commerce-cloudflare` | `aurelia/auth-api-v1` | This backend's business API and auth policy/deployment integration |

The local folder is `aurelia-commerce-worker-api`; the GitHub repository remains `aurelia-commerce-cloudflare`.

This repository installs `@snort-intelligence/auth-server` 0.1.4 from its committed vendor tarball. The UI installs client/React 0.1.2. No sibling-directory runtime import or npm publication is required. See `vendor/README.md` for artifact provenance.

The reusable adapter owns credentials/provider/session operations. `src/auth` here owns Aurelia roles, permissions, disabled access, invitations, support grants, current-session MFA assurance, replay checks and guest ownership. Its context projection remains host-owned so a new UI cannot bypass business policy.

## Delivery and rollout

Push all three feature branches, then review UI/backend changes against their existing base branches. Pushing these feature branches does not trigger the base-branch test deploy workflows. Auth repository is initially its own versioned source baseline; it has no earlier stable base for a PR.

The isolated demo was already provisioned and validated over HTTP on 22-Oct (see `HOSTED-DEMO-22-Oct-2026.md`). The subsequent UI-independent adapter refactor has compilation checks only and has not been deployed. Existing test/prod have not been cut over to auth by this work.

Before a new isolated demo rollout: confirm the demo config targets its own DB, keep the existing secret, deploy backend then matching UI, and perform separately authorized environment validation. Do not reset data or migrate a stable database just to publish code. Auth schema migrations and provider credentials are explicit environment setup steps.

Google/email signup/reset remain blocked on external credentials. Demo password accounts are reusable; team MFA remains mandatory. Browser review, provider flow validation and recovery operations remain production gates. No new tests were run for this delivery preparation.
