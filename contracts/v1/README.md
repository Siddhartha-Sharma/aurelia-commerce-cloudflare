# v1 compatibility

[OpenAPI](openapi.yaml) covers transport/identity only; feature validators remain authoritative.

- Success: `{data}`; failure: non-2xx `{error:{code,message}}`. Never fall back to demo on auth errors.
- HttpOnly cookies identify accounts. Return safe DTOs, never passwords/session tokens/MFA secrets/Google tokens.
- Enforce verified email, disabled access, permissions and current-session MFA server-side. `twoFactorRedirect` or Google login alone does not grant full access.
- `X-Aurelia-Identity` is a consistency check, not a credential; mismatch returns 409 `IDENTITY_CHANGED`.
- Preserve atomic writes, retry-safe request IDs and server-authoritative stock/prices.
- Keep money as rounded INR numbers, dates as ISO strings (documented access timestamps use milliseconds), lists as `items,total,page,pageSize`.
- Scope private data from signed identity; omit hidden prices/private inventory fields from public DTOs.
- Keep v1 compatible across backend rewrites. Use v2 only for intentional contract changes.
