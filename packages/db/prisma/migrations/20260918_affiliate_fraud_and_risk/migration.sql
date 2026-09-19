-- ============================================================
-- Affiliate Fraud & Risk Monitoring Migration
-- 2026-09-18
-- ============================================================

-- Ensure enum values exist
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AFFILIATE_COMMISSION';
ALTER TYPE "TransactionReferenceType" ADD VALUE IF NOT EXISTS 'AFFILIATE_COMMISSION';
ALTER TYPE "TransactionReferenceType" ADD VALUE IF NOT EXISTS 'AFFILIATE_COMMISSION_REVERSAL';

-- Ensure base table AffiliateCommission exists before altering
CREATE TABLE IF NOT EXISTS "AffiliateCommission" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "referralId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "depositAmount" DECIMAL(12,2) NOT NULL,
    "commissionPercent" DECIMAL(5,2) NOT NULL,
    "commissionAmount" DECIMAL(12,2) NOT NULL,
    "affiliateMode" TEXT DEFAULT 'CONTINUOUS',
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "reversalReason" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AffiliateCommission_referrerId_idx" ON "AffiliateCommission"("referrerId");
CREATE INDEX IF NOT EXISTS "AffiliateCommission_referredUserId_idx" ON "AffiliateCommission"("referredUserId");
CREATE INDEX IF NOT EXISTS "AffiliateCommission_status_idx" ON "AffiliateCommission"("status");
CREATE INDEX IF NOT EXISTS "AffiliateCommission_affiliateMode_idx" ON "AffiliateCommission"("affiliateMode");
CREATE INDEX IF NOT EXISTS "AffiliateCommission_createdAt_idx" ON "AffiliateCommission"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateCommission_sourceType_sourceId_key" ON "AffiliateCommission"("sourceType", "sourceId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateCommission_referrerId_fkey'
  ) THEN
    ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateCommission_referredUserId_fkey'
  ) THEN
    ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateCommission_referralId_fkey'
  ) THEN
    ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable Referral: Per-referral affiliate block fields and first commission
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "firstCommissionAt" TIMESTAMP(3);
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "affiliateBlockedAt" TIMESTAMP(3);
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "affiliateBlockedReason" TEXT;
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "affiliateBlockedBy" TEXT;

-- AlterTable AffiliateCommission: Hold and maturity tracking fields
ALTER TABLE "AffiliateCommission" ADD COLUMN IF NOT EXISTS "payoutDueAt" TIMESTAMP(3);
ALTER TABLE "AffiliateCommission" ADD COLUMN IF NOT EXISTS "heldUntil" TIMESTAMP(3);
ALTER TABLE "AffiliateCommission" ADD COLUMN IF NOT EXISTS "holdMinutes" INTEGER DEFAULT 0;
ALTER TABLE "AffiliateCommission" ADD COLUMN IF NOT EXISTS "releasedAt" TIMESTAMP(3);

-- CreateIndex for held commissions
CREATE INDEX IF NOT EXISTS "AffiliateCommission_status_heldUntil_idx" ON "AffiliateCommission"("status", "heldUntil");

-- CreateTable ReferralRiskEvent
CREATE TABLE IF NOT EXISTS "ReferralRiskEvent" (
    "id" TEXT NOT NULL,
    "referralId" TEXT,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "ReferralRiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes on ReferralRiskEvent
CREATE INDEX IF NOT EXISTS "ReferralRiskEvent_userId_idx" ON "ReferralRiskEvent"("userId");
CREATE INDEX IF NOT EXISTS "ReferralRiskEvent_referralId_idx" ON "ReferralRiskEvent"("referralId");
CREATE INDEX IF NOT EXISTS "ReferralRiskEvent_type_idx" ON "ReferralRiskEvent"("type");
CREATE INDEX IF NOT EXISTS "ReferralRiskEvent_severity_idx" ON "ReferralRiskEvent"("severity");
CREATE INDEX IF NOT EXISTS "ReferralRiskEvent_status_idx" ON "ReferralRiskEvent"("status");
CREATE INDEX IF NOT EXISTS "ReferralRiskEvent_createdAt_idx" ON "ReferralRiskEvent"("createdAt");

-- AddForeignKey ReferralRiskEvent -> Referral
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ReferralRiskEvent_referralId_fkey'
  ) THEN
    ALTER TABLE "ReferralRiskEvent" ADD CONSTRAINT "ReferralRiskEvent_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey ReferralRiskEvent -> User
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ReferralRiskEvent_userId_fkey'
  ) THEN
    ALTER TABLE "ReferralRiskEvent" ADD CONSTRAINT "ReferralRiskEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
