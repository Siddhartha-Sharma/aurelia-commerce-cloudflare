# Auth hardening — 22-Oct-2026

**Follow-up:** isolated hosted demo auth is now ON, with reusable synthetic email/password accounts and mandatory team MFA validated. Server adapter is now 0.1.3 (MFA request-stream preservation fix). Existing test auth remains OFF; Google/email-provider setup remains deferred. See `HOSTED-DEMO-22-Oct-2026.md` for the actual deployment/verification scope.

## Implemented in this change

- Server adapter 0.1.2 explicitly supplies password hash/verify callbacks to Better Auth 1.7.12. Signup, reset and password change use these same callbacks.
- New hashes use native `node:crypto` scrypt, N=32768, r=8, p=3, 64-byte key, independent random 16-byte salt, and timing-safe verification. This is OWASP's 32 MiB profile. The algorithm is provided by the runtime; the module only handles policy, serialization and compatibility.
- Stored format: `scrypt$v1$32768$8$3$<32 lowercase hex salt characters>$<128 lowercase hex key characters>`. The salt is passed to scrypt as its hex text, and the password is NFKC-normalized. Costs are an allowlist, not trusted database-controlled numbers. These details matter for future implementations.
- Existing Better Auth `salt:key` hashes remain readable with the pinned provider's original N=16384/r=16/p=1 settings. They are not silently rewritten during login; a successful password reset/change writes the new format. Authentication is still off live, so no production password migration is being claimed.
- Unknown or malformed hash formats are rejected. No plaintext password fallback, reversible password encryption, new database field or secret pepper was introduced.
- Backend auth-enabled API requests reject remote HTTP, including context/team/business requests; the reusable provider also guards its own endpoints. Exact localhost/127.0.0.1 HTTP is allowed for local development only. Forwarded headers cannot override this check.
- Client 0.1.1 blocks credential requests from insecure remote pages or to insecure endpoints before sending data. Protected business/team calls use that same guard. Authenticated API fetches reject redirects. React adapter 0.1.1 pins the matching client peer.
- Pages API gateway refuses insecure incoming requests and forwards only to its configured service binding or HTTPS upstream. HTTPS API responses carry six-month HSTS without includeSubDomains/preload.

## Deployment dependencies and remaining release gates

1. Configure preview-only D1 migrations, random AUTH_SECRET, approved origins, HTTPS frontend URL and Resend sender/secret using `AUTH-ROLLOUT.md`. Configure Google consent/client/redirect separately; email/password does not require Google credentials.
2. At Cloudflare enable HTTP-to-HTTPS redirection for the frontend and security headers on HTML/static responses. API HSTS alone cannot protect the very first HTTP visit to an unprotected page. Never redirect a received password POST from HTTP as a substitute for refusing it.
3. Validate signup, verification, sign-in/out, reset, changed-password session revocation, authenticator/recovery replay, disabled staff, denied permissions, cross-account data and owner invitations in preview. These are required release checks; no browser/end-to-end tests were run by this change.
4. Measure scrypt CPU time, concurrent-request memory and error rate in the actual Cloudflare plan. The profile uses approximately 32 MiB working memory per calculation, not a 32 MiB total Worker budget. Do not weaken hashing automatically on timeout; allocate adequate resources and apply edge abuse/rate controls.
5. Keep DB exports, provider secrets and session cookies private. A hash leak still permits offline guessing; a stolen session cookie can grant access independently of password hashing. Incident response must rotate affected credentials/revoke sessions after investigation.
6. Review losing-all-MFA recovery operationally; no automatic bypass or support recovery queue exists. Historical customer/order linkage still requires reviewed migration.

Build/type checks are compilation evidence only. Live auth remains OFF; no remote migration, deployment, push or publication was performed.

References: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt), [Cloudflare node:crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/).
