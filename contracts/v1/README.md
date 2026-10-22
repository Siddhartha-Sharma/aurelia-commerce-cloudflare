# Compatibility requirements

The OpenAPI document describes the transport envelope and identity boundary. Detailed service request/result fields remain the existing feature-service interfaces and domain validators; full per-operation schemas are not yet generated. Do not claim this partial schema validates all jewellery operations.

- JSON success: `{data:...}`. Failure: `{error:{code,message}}` with non-2xx HTTP status. Never interpret a 403/configuration error as anonymous/demo success.
- Identity: HttpOnly cookie; context includes safe user/session IDs, never passwords, session bearer tokens, authenticator secrets or Google tokens.
- Access errors: `AUTH_REQUIRED`, `EMAIL_UNVERIFIED`, `MFA_ENROLLMENT_REQUIRED`, `MFA_REQUIRED`, `ACCOUNT_DISABLED`, `FORBIDDEN`, `STEP_UP_REQUIRED`. Temporary failures may be 429/503; cancellation/timeout is a client concern.
- MFA credential login can return `twoFactorRedirect:true` without a full session. Google login can create a partial session; app permission checks require enrollment/assurance before access.
- Mutations must retain validation, atomic inventory/order/payment writes and retry-safe request IDs. A price typed by an online customer is never authoritative. Staff price overrides/discounts require their specific permissions.
- Money remains the existing rounded two-decimal INR number representation. Dates remain ISO strings except explicitly documented Unix-millisecond access timestamps. Changing units/types is a versioned contract change.
- Lists use `items,total,page,pageSize`; product public DTOs omit pricing inputs/private inventory fields. Hidden prices are omitted, not sent behind a CSS flag.
- Account data scope comes from validated identity. `view:'storefront'` narrows an owner's personal order history; it never grants extra access.
- Java migration: keep v1 compatible while implementing new internals. A v2 endpoint is necessary only for intentional behavior/schema changes. Support both until clients migrate; changing the frontend base URL alone is insufficient if the contract differs.

- Optional X-Aurelia-Identity is an expected browser identity, never a credential. A mismatch returns 409 IDENTITY_CHANGED. The signed session alone determines the actor. This protects stale browser tabs after an account switch.
