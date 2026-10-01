# Aurelia API contract — v0.1.0

GET /api/health: {data:{ready:true,mode:"demo"|"locked"}}.

POST /api/services?operation=<operation> with JSON {operation,input}; Content-Type: application/json, X-Aurelia-Session (16–80 letters/digits/hyphens), X-Aurelia-Audience (customer or owner). Query operation is diagnostic; body operation is authoritative.

Success: {data:...}. Failure: {error:{code,message,details?}} with appropriate HTTP status. Session scopes customer cart/wishlist/profile/addresses/order history. Owner preview must use owner audience for analytics. Demo audience headers do not authenticate users.

Operations and payloads: UI src/services/api/featureServices.js; authoritative validations: backend src/domain/operations.js. Current envelope is transport-neutral and can be implemented by Node or Java. Preserve IDs, date strings, money semantics, idempotency requestId, error codes and atomic stock/order/payment behavior during migration.

Both repositories contain this contract. Domain rules are copied at this split checkpoint, not synchronized automatically. Review and test both sides on future contract changes.
