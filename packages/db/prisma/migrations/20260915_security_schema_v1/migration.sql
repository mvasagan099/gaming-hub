-- ============================================================
-- Security Schema v1 Migration
-- 2026-09-15
-- ============================================================
-- This migration is idempotent: all ALTER TABLE statements use
-- IF NOT EXISTS / conditional logic so it can be re-run safely.
-- NEVER run prisma migrate reset against production data.
-- ============================================================

-- -----------------------------------------------------------
-- 1. LoginSession: mfaVerifiedAt (C-02)
-- -----------------------------------------------------------
ALTER TABLE "LoginSession"
  ADD COLUMN IF NOT EXISTS "mfaVerifiedAt" TIMESTAMPTZ;

-- -----------------------------------------------------------
-- 2. Profile: TOTP encryption fields (M-05)
-- -----------------------------------------------------------
ALTER TABLE "Profile"
  ADD COLUMN IF NOT EXISTS "twoFactorSecretEncrypted"  TEXT,
  ADD COLUMN IF NOT EXISTS "twoFactorSecretKeyVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "totpEncryptedAt"           TIMESTAMPTZ;

-- -----------------------------------------------------------
-- 3. Profile: promotional balance migration marker
-- -----------------------------------------------------------
ALTER TABLE "Profile"
  ADD COLUMN IF NOT EXISTS "promoMigratedAt" TIMESTAMPTZ;

-- -----------------------------------------------------------
-- 4. CouponRedemption: saga state machine fields (H-01)
-- -----------------------------------------------------------
ALTER TABLE "CouponRedemption"
  ADD COLUMN IF NOT EXISTS "couponCodeHash"       TEXT,
  ADD COLUMN IF NOT EXISTS "externalTxId"         TEXT,
  ADD COLUMN IF NOT EXISTS "sagaStatus"           TEXT    NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN IF NOT EXISTS "failureReason"        TEXT,
  ADD COLUMN IF NOT EXISTS "externalConfirmedAt"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "completedAt"          TIMESTAMPTZ;

-- Unique constraint on couponCodeHash (global single-use coupon protection)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CouponRedemption_couponCodeHash_key'
  ) THEN
    ALTER TABLE "CouponRedemption"
      ADD CONSTRAINT "CouponRedemption_couponCodeHash_key" UNIQUE ("couponCodeHash");
  END IF;
END $$;

-- Unique constraint on externalTxId
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CouponRedemption_externalTxId_key'
  ) THEN
    ALTER TABLE "CouponRedemption"
      ADD CONSTRAINT "CouponRedemption_externalTxId_key" UNIQUE ("externalTxId");
  END IF;
END $$;

-- Index for saga worker queries (PENDING/EXTERNAL_CONFIRMED rows)
CREATE INDEX IF NOT EXISTS "CouponRedemption_sagaStatus_createdAt_idx"
  ON "CouponRedemption" ("sagaStatus", "createdAt");

-- -----------------------------------------------------------
-- 5. UserPrivacy: persistent privacy settings (M-01)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "UserPrivacy" (
  "userId"              TEXT         NOT NULL,
  "profileVisibility"   TEXT         NOT NULL DEFAULT 'EVERYONE',
  "showEmail"           BOOLEAN      NOT NULL DEFAULT false,
  "showPhone"           BOOLEAN      NOT NULL DEFAULT false,
  "showStats"           BOOLEAN      NOT NULL DEFAULT true,
  "allowFriendRequests" BOOLEAN      NOT NULL DEFAULT true,
  "allowGameInvites"    BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "UserPrivacy_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserPrivacy_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- -----------------------------------------------------------
-- 6. Verify defaults for new accounts (C-04)
-- Wallet.balance and Profile.coins should default to 0.
-- Check existing column defaults and correct if needed.
-- -----------------------------------------------------------
DO $$
BEGIN
  -- Wallet.balance default
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Wallet'
      AND column_name = 'balance'
      AND column_default::text != '0'
  ) THEN
    ALTER TABLE "Wallet" ALTER COLUMN "balance" SET DEFAULT 0;
  END IF;

  -- Profile.coins default
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Profile'
      AND column_name = 'coins'
      AND column_default::text != '0'
  ) THEN
    ALTER TABLE "Profile" ALTER COLUMN "coins" SET DEFAULT 0;
  END IF;
END $$;

-- -----------------------------------------------------------
-- 7. WalletRequest: externalTransferId & processingStartedAt (H-02)
-- -----------------------------------------------------------
ALTER TABLE "WalletRequest"
  ADD COLUMN IF NOT EXISTS "externalTransferId" TEXT,
  ADD COLUMN IF NOT EXISTS "processingStartedAt" TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WalletRequest_externalTransferId_key'
  ) THEN
    ALTER TABLE "WalletRequest"
      ADD CONSTRAINT "WalletRequest_externalTransferId_key" UNIQUE ("externalTransferId");
  END IF;
END $$;

