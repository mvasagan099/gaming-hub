-- ============================================================
-- Security Schema v1 Migration
-- 2026-09-15
-- ============================================================
-- Object creation is intentionally strict. Existing columns, tables, or
-- indexes cause the migration to fail instead of silently accepting drift.
-- ============================================================

-- -----------------------------------------------------------
-- 1. LoginSession: mfaVerifiedAt (C-02)
-- -----------------------------------------------------------
ALTER TABLE "LoginSession"
  ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);

-- -----------------------------------------------------------
-- 2. Profile: TOTP encryption fields (M-05)
-- -----------------------------------------------------------
ALTER TABLE "Profile"
  ADD COLUMN "twoFactorSecretEncrypted"  TEXT,
  ADD COLUMN "twoFactorSecretKeyVersion" INTEGER,
  ADD COLUMN "totpEncryptedAt"           TIMESTAMP(3);

-- -----------------------------------------------------------
-- 3. Profile: promotional balance migration marker
-- -----------------------------------------------------------
ALTER TABLE "Profile"
  ADD COLUMN "promoMigratedAt" TIMESTAMP(3);

-- -----------------------------------------------------------
-- 4. CouponRedemption: saga state machine fields (H-01)
-- -----------------------------------------------------------
ALTER TABLE "CouponRedemption"
  ADD COLUMN "couponCodeHash"       TEXT,
  ADD COLUMN "externalTxId"         TEXT,
  ADD COLUMN "sagaStatus"           TEXT    NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "failureReason"        TEXT,
  ADD COLUMN "externalConfirmedAt"  TIMESTAMP(3),
  ADD COLUMN "completedAt"          TIMESTAMP(3);

CREATE UNIQUE INDEX "CouponRedemption_couponCodeHash_key"
  ON "CouponRedemption" ("couponCodeHash");

CREATE UNIQUE INDEX "CouponRedemption_externalTxId_key"
  ON "CouponRedemption" ("externalTxId");

-- Index for saga worker queries (PENDING/EXTERNAL_CONFIRMED rows)
CREATE INDEX "CouponRedemption_sagaStatus_createdAt_idx"
  ON "CouponRedemption" ("sagaStatus", "createdAt");

-- -----------------------------------------------------------
-- 5. UserPrivacy: persistent privacy settings (M-01)
-- -----------------------------------------------------------
CREATE TABLE "UserPrivacy" (
  "userId"              TEXT         NOT NULL,
  "profileVisibility"   TEXT         NOT NULL DEFAULT 'EVERYONE',
  "showEmail"           BOOLEAN      NOT NULL DEFAULT false,
  "showPhone"           BOOLEAN      NOT NULL DEFAULT false,
  "showStats"           BOOLEAN      NOT NULL DEFAULT true,
  "allowFriendRequests" BOOLEAN      NOT NULL DEFAULT true,
  "allowGameInvites"    BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserPrivacy_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserPrivacy_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- -----------------------------------------------------------
-- 6. Verify defaults for new accounts (C-04)
-- Wallet.balance and Profile.coins should default to 0.
-- Check existing column defaults and correct if needed.
-- -----------------------------------------------------------
ALTER TABLE "Wallet" ALTER COLUMN "balance" SET DEFAULT 0;
ALTER TABLE "Profile" ALTER COLUMN "coins" SET DEFAULT 0;

-- -----------------------------------------------------------
-- 7. WalletRequest: externalTransferId & processingStartedAt (H-02)
-- -----------------------------------------------------------
ALTER TABLE "WalletRequest"
  ADD COLUMN "externalTransferId" TEXT,
  ADD COLUMN "processingStartedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "WalletRequest_externalTransferId_key"
  ON "WalletRequest" ("externalTransferId");
