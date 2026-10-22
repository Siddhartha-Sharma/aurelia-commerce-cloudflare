-- Aurelia policy/persistence, independent of the auth provider.
CREATE TABLE app_access (
  userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  shopId TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('OWNER','STAFF','DEVELOPER')),
  permissions TEXT NOT NULL CHECK(json_valid(permissions)),
  disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)),
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(userId,shopId)
);
CREATE TABLE app_session_assurance (
  sessionId TEXT PRIMARY KEY REFERENCES auth_session(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  verifiedAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL
);
CREATE TABLE app_mfa_replay (
  userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  codeHash TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  PRIMARY KEY(userId,codeHash)
);
CREATE TABLE app_mfa_failures (
  userId TEXT PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  count INTEGER NOT NULL,
  windowStart INTEGER NOT NULL
);
CREATE TABLE app_invitations (
  id TEXT PRIMARY KEY,
  shopId TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('OWNER','STAFF','DEVELOPER')),
  permissions TEXT NOT NULL CHECK(json_valid(permissions)),
  tokenHash TEXT NOT NULL UNIQUE,
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  usedAt INTEGER,
  revokedAt INTEGER
);
CREATE INDEX invitations_shop ON app_invitations(shopId,createdAt);
CREATE TABLE app_audit (
  id TEXT PRIMARY KEY,
  shopId TEXT NOT NULL,
  actorId TEXT NOT NULL,
  action TEXT NOT NULL,
  targetId TEXT NOT NULL,
  detail TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX audit_shop_time ON app_audit(shopId,createdAt);
CREATE TABLE app_support (
  id TEXT PRIMARY KEY,
  shopId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  permissions TEXT NOT NULL CHECK(json_valid(permissions)),
  createdAt INTEGER NOT NULL,
  approvedAt INTEGER,
  expiresAt INTEGER,
  revokedAt INTEGER
);
CREATE INDEX support_shop_user ON app_support(shopId,userId,expiresAt);
CREATE TABLE app_guest_claims (
  guestId TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  claimedAt INTEGER NOT NULL
);
