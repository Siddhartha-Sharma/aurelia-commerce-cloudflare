CREATE TABLE app_pos_drafts (
  userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  shopId TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data)),
  updatedAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  PRIMARY KEY(userId,shopId)
);
