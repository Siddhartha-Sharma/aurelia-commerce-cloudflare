import {STAFF_DEFAULTS,STAFF_PERMISSIONS,OWNER_PERMISSIONS,requirePermission,requireFreshMfa,
  validateStaffPermissions,requireVerified} from "./policy.js";
import {hashToken,randomToken} from "./repository.js";
import {ServiceError} from "../domain/serviceError.js";

const fail = (message,status = 400,code = "INVALID_INPUT") => {
  throw new ServiceError(message,{status,code});
};
export async function handleTeam({request,path,identity,principal,env}) {
  const repo = identity.repository;
  const input = request.method === "GET" ? {} : await request.json().catch(() => fail("Use valid JSON."));
  if(!input || typeof input!=="object" || Array.isArray(input))fail("Use a valid request.");
  if (path === "/api/v1/invitations/accept" && request.method === "POST") {
    if (!principal.user || !principal.user.emailVerified)
      fail("Sign in and verify the invited email first.",401,"AUTH_REQUIRED");
    if (typeof input.token !== "string" || !/^[a-f0-9]{64}$/.test(input.token)) fail("Invalid invitation.",400);
    const invitation = await repo.invitation(await hashToken(input.token));
    if (!invitation || invitation.usedAt || invitation.revokedAt || invitation.expiresAt < Date.now())
      fail("This invitation expired or was already used. Request a new invitation.",410,"INVITATION_EXPIRED");
    if (principal.user.email.toLowerCase() !== invitation.email.toLowerCase())
      fail("Sign in with the email address that received the invitation.",403,"INVITATION_EMAIL_MISMATCH");
    if (!await repo.acceptInvite(invitation,principal.user.id))
      fail("This account already has shop access or the invitation was used.",409,"CONFLICT");
    await repo.audit(principal,"team.invitation.accepted",invitation.id);
    return {accepted:true};
  }
  if (path.startsWith("/api/v1/support")) {
    requireVerified(principal);
    if (path.endsWith("/request") && request.method === "POST") {
      requirePermission(principal,"support.request");
      if (typeof input.reason !== "string" || input.reason.trim().length < 8 || input.reason.length > 300)
        fail("Explain why support access is needed (8–300 characters).");
      const existing = await repo.supportList();
      if (existing.some(row => row.userId === principal.user.id && !row.revokedAt &&
        ((!row.approvedAt && Date.now()-row.createdAt < 86400000) || row.expiresAt > Date.now())))
        fail("An access request is already pending or active.",409,"CONFLICT");
      await repo.requestSupport(principal.user.id,input.reason.trim());
      await repo.audit(principal,"support.requested",principal.user.id);
      return {requested:true};
    }
    if (request.method === "GET" && path === "/api/v1/support") {
      const items = await repo.supportList();
      return {items:principal.role === "OWNER" ? items :
        items.filter(row => row.userId === principal.user.id)};
    }
    requirePermission(principal,"support.approve");
    requireFreshMfa(principal);
    if (path.endsWith("/approve")) {
      const permitted = ["dashboard.read","inventory.view","orders.read","reports.read","customers.read"];
      if (!Array.isArray(input.permissions) || input.permissions.some(value => !permitted.includes(value)))
        fail("Choose valid read-only support permissions.");
      const result = await repo.approveSupport(input.id,[...new Set(input.permissions)]);
      if (!Number(result.meta.changes)) fail("Request was already handled.",409,"CONFLICT");
      await repo.audit(principal,"support.approved",input.id);
      return {approved:true,durationMinutes:60};
    }
    if (path.endsWith("/revoke")) {
      await repo.revokeSupport(input.id);
      await repo.audit(principal,"support.revoked",input.id);
      return {revoked:true};
    }
    fail("Endpoint not found.",404,"NOT_FOUND");
  }
  requirePermission(principal,path === "/api/v1/access/activity" ? "audit.read" : "team.manage");
  if (path === "/api/v1/team" && request.method === "GET")
    return {...await repo.team(),availablePermissions:STAFF_PERMISSIONS,defaultPermissions:STAFF_DEFAULTS};
  if (path === "/api/v1/access/activity" && request.method === "GET") return {items:await repo.auditList()};
  requireFreshMfa(principal);
  if (path === "/api/v1/team/invite" && request.method === "POST") {
    const email = String(input.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail("Enter a valid email address.");
    const permissions = validateStaffPermissions(input.permissions || STAFF_DEFAULTS);
    const token = randomToken(), id = crypto.randomUUID();
    await repo.createInvite({id,email,role:"STAFF",permissions,tokenHash:await hashToken(token),
      createdBy:principal.user.id,expiresAt:Date.now()+86400000});
    const url = new URL("/accept-invite",env.AUTH_BASE_URL);
    url.searchParams.set("token",token);
    try { await identity.sendEmail({to:email,subject:"Your Aurelia Jewellery staff invitation",
      text:"Accept your shop staff invitation within 24 hours:\n" + url.href +
        "\nSign in using this email address. Two-step verification is required."}); }
    catch (error) { await repo.revokeInvite(id); throw error; }
    await repo.audit(principal,"team.invitation.created",id);
    return {invited:true};
  }
  if (path === "/api/v1/team/update" && request.method === "POST") {
    if (input.userId === principal.user.id) fail("You cannot change your own owner access.");
    const permissions = validateStaffPermissions(input.permissions);
    if (typeof input.disabled !== "boolean") fail("Choose active or disabled access.");
    if (!await repo.updateStaff(input.userId,permissions,input.disabled))
      fail("Staff account not found. Owner/developer access cannot be changed here.",404,"NOT_FOUND");
    await repo.audit(principal,input.disabled ? "team.disabled" : "team.permissions.updated",input.userId);
    return {updated:true};
  }
  if (path === "/api/v1/team/revoke-invite" && request.method === "POST") {
    await repo.revokeInvite(input.id);
    await repo.audit(principal,"team.invitation.revoked",input.id);
    return {revoked:true};
  }
  fail("Endpoint not found.",404,"NOT_FOUND");
}
