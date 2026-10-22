import {ServiceError} from "../domain/serviceError.js";

export const STAFF_PERMISSIONS = Object.freeze([
  "pos.create","pos.discount","pos.price.override","inventory.view","inventory.edit","inventory.adjust",
  "customers.read","customers.create","customers.update","orders.read","orders.fulfil","orders.cancel","payments.confirm",
  "reports.read","reports.export",
]);
export const STAFF_DEFAULTS = Object.freeze(["pos.create","customers.read","customers.create","orders.read"]);
export const OWNER_PERMISSIONS = Object.freeze([
  ...STAFF_PERMISSIONS,"inventory.delete","dashboard.read","customers.archive","customers.delete",
  "settings.read","settings.write","payments.configure","campaigns.write","team.manage","audit.read","support.approve",
]);
const publicOperations = new Set([
  "products.list","products.get","cart.get","cart.save","wishlist.get","wishlist.save",
  "sharedProducts.list","sharedProducts.get","sharedProducts.create","sharedProducts.update","sharedProducts.remove",
  "themeConfig.get","features.get","paymentConfig.get","festivalFeed.get","campaignImageCleanup.get",
  "analytics.recordView","analytics.trending","analytics.counts","stockAlerts.subscribe",
]);
const ownOperations = new Set([
  "profile.get","profile.save","addresses.list","addresses.get","addresses.create","addresses.update","addresses.remove",
  "orders.list","orders.get","payments.reference",
]);
const operationPermission = {
  "products.create":"inventory.edit","products.update":"inventory.edit","products.remove":"inventory.delete",
  "customers.list":"customers.read","customers.get":"customers.read","customers.create":"customers.create",
  "customers.update":"customers.update","customers.archive":"customers.archive","customers.restore":"customers.archive",
  "customers.remove":"customers.delete","inventory.adjust":"inventory.adjust","inventoryMovements.list":"inventory.view",
  "inventory.lowStock":"inventory.view","orders.list":"orders.read","orders.get":"orders.read",
  "orders.status":"orders.fulfil","payments.list":"payments.confirm","payments.confirm":"payments.confirm",
  "dashboard.summary":"dashboard.read","reports.summary":"reports.read",
  "notifications.list":"dashboard.read","search.suggestions":"orders.read","search.all":"orders.read",
  "stockAlerts.list":"inventory.view","shopProfile.get":"settings.read",
  "shopProfile.save":"settings.write","shopProfile.saveWithPayment":"payments.configure",
  "paymentConfig.save":"payments.configure","themeConfig.save":"settings.write","features.save":"settings.write",
  "festivalFeed.save":"campaigns.write","campaignImageCleanup.save":"settings.write",
  "customPurities.get":"inventory.view","customPurities.save":"inventory.edit",
};
export const SENSITIVE_OPERATIONS = new Set([
  "products.remove","customers.remove","customers.archive","customers.restore","payments.confirm","paymentConfig.save",
  "shopProfile.saveWithPayment","features.save",
]);

export function can(principal, permission) { return Boolean(principal?.permissions?.includes(permission)); }
export function requirePermission(principal, permission) {
  requireVerified(principal);
  if (!can(principal,permission)) throw new ServiceError("Your account cannot perform this action.", {status:403,code:"FORBIDDEN"});
}
export function requireVerified(principal) {
  if (!principal?.user) throw new ServiceError("Sign in to continue.", {status:401,code:"AUTH_REQUIRED"});
  if (principal.disabled) throw new ServiceError("Your access has been disabled. Contact the shop owner.", {status:403,code:"ACCOUNT_DISABLED"});
  if (!principal.user.emailVerified) throw new ServiceError("Verify your email to continue.", {status:403,code:"EMAIL_UNVERIFIED"});
  if (principal.needsMfaEnrollment) throw new ServiceError("Set up two-step verification to continue.", {status:403,code:"MFA_ENROLLMENT_REQUIRED"});
  if (principal.needsMfaVerification) throw new ServiceError("Verify your authenticator code to continue.", {status:403,code:"MFA_REQUIRED"});
}
export function requireFreshMfa(principal) {
  requireVerified(principal);
  if (!principal.user.twoFactorEnabled || Date.now() - Number(principal.mfaVerifiedAt || 0) > 5 * 60 * 1000)
    throw new ServiceError("Verify it's you before saving this change.", {status:403,code:"STEP_UP_REQUIRED"});
}
export function authorizeOperation(principal, operation, input) {
  if (publicOperations.has(operation)) {
    if (["cart.save","wishlist.save"].includes(operation) && (!Array.isArray(input.data) || input.data.length > 100))
      throw new ServiceError("Keep up to 100 items in your bag or wishlist.", {status:400,code:"INVALID_INPUT"});
    return;
  }
  if (operation === "orders.place") {
    requireVerified(principal);
    if (input.channel === "ONLINE") return;
    requirePermission(principal,"pos.create");
    if (Number(input.discount || 0) > 0 && !can(principal,"pos.discount"))
      throw new ServiceError("Ask the owner to approve this discount.", {status:403,code:"FORBIDDEN"});
    return;
  }
  if (ownOperations.has(operation) && (principal.role === "CUSTOMER" || !["orders.list","orders.get"].includes(operation) || input.view === "storefront")) { requireVerified(principal); return; }
  if (operation === "orders.status" && input.status === "CANCELLED") {
    requirePermission(principal,"orders.cancel");
    requireFreshMfa(principal);
    return;
  }
  if(operation==="shopProfile.get" && can(principal,"inventory.edit")){requireVerified(principal);return;}
  const permission = operationPermission[operation];
  if (!permission) throw new ServiceError("This operation is not available.", {status:403,code:"FORBIDDEN"});
  requirePermission(principal,permission);
  if (SENSITIVE_OPERATIONS.has(operation)) requireFreshMfa(principal);
}
export function effectivePermissions(access, grant) {
  if (!access || access.disabled) return [];
  if (access.role === "OWNER") return [...OWNER_PERMISSIONS];
  if (access.role === "DEVELOPER") return ["platform.diagnostics","support.request",...(grant?.permissions || [])];
  const permissions = JSON.parse(access.permissions || "[]").filter(value => STAFF_PERMISSIONS.includes(value));
  const dependencies={"inventory.edit":["inventory.view"],"inventory.adjust":["inventory.view"],"customers.create":["customers.read"],"customers.update":["customers.read"],"orders.fulfil":["orders.read"],"orders.cancel":["orders.read"],"payments.confirm":["orders.read"],"reports.read":["orders.read"],"reports.export":["reports.read","orders.read"]};
  return [...new Set(permissions.flatMap(value=>[value,...(dependencies[value] || [])]))];
}
export function validateStaffPermissions(permissions) {
  if (!Array.isArray(permissions) || permissions.length > STAFF_PERMISSIONS.length ||
    permissions.some(value => !STAFF_PERMISSIONS.includes(value)))
    throw new ServiceError("Choose valid staff permissions.", {status:400,code:"INVALID_INPUT"});
  return [...new Set(permissions)];
}
