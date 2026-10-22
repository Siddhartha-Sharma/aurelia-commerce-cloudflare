/** Identity persistence only; business records and authorization policy stay separate. */
export function createIdentityRepository(db, shopId) {
  const database = () => db.withSession("first-primary");
  return {
    access:userId => database().prepare("SELECT * FROM app_access WHERE userId=? AND shopId=?")
      .bind(userId,shopId).first(),
    assurance:sessionId => database().prepare("SELECT * FROM app_session_assurance WHERE sessionId=? AND expiresAt>?")
      .bind(sessionId,Date.now()).first(),
    async mfaVerified(session, codeHash) {
      const now = Date.now();
      const statements = [
        database().prepare("DELETE FROM app_mfa_replay WHERE expiresAt<?").bind(now),
        ...(codeHash ? [database().prepare("INSERT INTO app_mfa_replay(userId,codeHash,expiresAt) VALUES(?,?,?)")
          .bind(session.user.id,codeHash,now + 120000)] : []),
        database().prepare("INSERT INTO app_session_assurance(sessionId,userId,verifiedAt,expiresAt) VALUES(?,?,?,?) ON CONFLICT(sessionId) DO UPDATE SET verifiedAt=excluded.verifiedAt,expiresAt=excluded.expiresAt")
          .bind(session.session.id,session.user.id,now,new Date(session.session.expiresAt).getTime()),
        database().prepare("DELETE FROM app_mfa_failures WHERE userId=?").bind(session.user.id),
      ];
      await database().batch(statements);
    },
    mfaFailures:userId => database().prepare("SELECT * FROM app_mfa_failures WHERE userId=?").bind(userId).first(),
    async failMfa(userId) {
      const now = Date.now();
      await database().prepare("INSERT INTO app_mfa_failures(userId,count,windowStart) VALUES(?,1,?) ON CONFLICT(userId) DO UPDATE SET count=CASE WHEN windowStart<? THEN 1 ELSE count+1 END,windowStart=CASE WHEN windowStart<? THEN ? ELSE windowStart END")
        .bind(userId,now,now-900000,now-900000,now).run();
    },
    async audit(actor, action, target, detail = "") {
      await database().prepare("INSERT INTO app_audit(id,shopId,actorId,action,targetId,detail,createdAt) VALUES(?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),shopId,actor.user.id,action,target || "",detail,Date.now()).run();
    },
    async team() {
      const [members,invitations] = await database().batch([
        database().prepare("SELECT a.userId,a.role,a.permissions,a.disabled,a.updatedAt,u.name,u.email,u.twoFactorEnabled FROM app_access a JOIN auth_user u ON u.id=a.userId WHERE a.shopId=? ORDER BY a.createdAt").bind(shopId),
        database().prepare("SELECT id,email,role,permissions,expiresAt,usedAt,revokedAt FROM app_invitations WHERE shopId=? ORDER BY createdAt DESC LIMIT 100").bind(shopId),
      ]);
      return {members:members.results,invitations:invitations.results};
    },
    async auditList() {
      return (await database().prepare("SELECT id,actorId,action,targetId,detail,createdAt FROM app_audit WHERE shopId=? ORDER BY createdAt DESC LIMIT 100").bind(shopId).all()).results;
    },
    async createInvite({id,email,role,permissions,tokenHash,createdBy,expiresAt}) {
      await database().prepare("INSERT INTO app_invitations(id,shopId,email,role,permissions,tokenHash,createdBy,createdAt,expiresAt) VALUES(?,?,?,?,?,?,?,?,?)")
        .bind(id,shopId,email,role,JSON.stringify(permissions),tokenHash,createdBy,Date.now(),expiresAt).run();
    },
    invitation:tokenHash => database().prepare("SELECT * FROM app_invitations WHERE tokenHash=? AND shopId=?").bind(tokenHash,shopId).first(),
    async acceptInvite(invitation, userId) {
      // The conditional INSERT and consume happen in the same atomic D1 batch.
      const results = await database().batch([
        database().prepare("INSERT INTO app_access(userId,shopId,role,permissions,disabled,createdAt,updatedAt) SELECT ?,shopId,role,permissions,0,?,? FROM app_invitations WHERE id=? AND shopId=? AND usedAt IS NULL AND revokedAt IS NULL AND expiresAt>? AND NOT EXISTS(SELECT 1 FROM app_access WHERE userId=? AND shopId=?)")
          .bind(userId,Date.now(),Date.now(),invitation.id,shopId,Date.now(),userId,shopId),
        database().prepare("UPDATE app_invitations SET usedAt=? WHERE id=? AND shopId=? AND usedAt IS NULL AND revokedAt IS NULL AND expiresAt>? AND EXISTS(SELECT 1 FROM app_access WHERE userId=? AND shopId=?)")
          .bind(Date.now(),invitation.id,shopId,Date.now(),userId,shopId),
      ]);
      return Number(results[0].meta.changes) === 1;
    },
    async updateStaff(userId, permissions, disabled) {
      const result = await database().prepare("UPDATE app_access SET permissions=?,disabled=?,updatedAt=? WHERE userId=? AND shopId=? AND role='STAFF'")
        .bind(JSON.stringify(permissions),disabled ? 1 : 0,Date.now(),userId,shopId).run();
      if (disabled) await database().prepare("DELETE FROM auth_session WHERE userId=?").bind(userId).run();
      return Number(result.meta.changes) === 1;
    },
    revokeInvite:id => database().prepare("UPDATE app_invitations SET revokedAt=? WHERE id=? AND shopId=? AND usedAt IS NULL")
      .bind(Date.now(),id,shopId).run(),
    async supportGrant(userId) {
      const row = await database().prepare("SELECT * FROM app_support WHERE userId=? AND shopId=? AND approvedAt IS NOT NULL AND revokedAt IS NULL AND expiresAt>? ORDER BY approvedAt DESC LIMIT 1")
        .bind(userId,shopId,Date.now()).first();
      return row ? {...row,permissions:JSON.parse(row.permissions)} : null;
    },
    supportList:async () => (await database().prepare("SELECT id,userId,reason,permissions,createdAt,approvedAt,expiresAt,revokedAt FROM app_support WHERE shopId=? ORDER BY createdAt DESC LIMIT 100").bind(shopId).all()).results,
    requestSupport:(userId,reason) => database().prepare("INSERT INTO app_support(id,shopId,userId,reason,permissions,createdAt) VALUES(?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),shopId,userId,reason,"[]",Date.now()).run(),
    approveSupport:(id,permissions) => database().prepare("UPDATE app_support SET permissions=?,approvedAt=?,expiresAt=? WHERE id=? AND shopId=? AND approvedAt IS NULL AND revokedAt IS NULL")
      .bind(JSON.stringify(permissions),Date.now(),Date.now()+3600000,id,shopId).run(),
    revokeSupport:id => database().prepare("UPDATE app_support SET revokedAt=? WHERE id=? AND shopId=?").bind(Date.now(),id,shopId).run(),
  };
}

export async function hashToken(value) {
  const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2,"0")).join("");
}
export function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2,"0")).join("");
}
