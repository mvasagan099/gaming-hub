-- ============================================================
-- Finalize Affiliate Wallet Commissions Migration
-- 2026-09-18
-- ============================================================

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AFFILIATE_COMMISSION';

-- AlterEnum
ALTER TYPE "TransactionReferenceType" ADD VALUE IF NOT EXISTS 'AFFILIATE_COMMISSION';
ALTER TYPE "TransactionReferenceType" ADD VALUE IF NOT EXISTS 'AFFILIATE_COMMISSION_REVERSAL';

-- AlterTable
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "firstCommissionAt" TIMESTAMP(3);

-- CreateTable
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

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AffiliateCommission_referrerId_idx" ON "AffiliateCommission"("referrerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AffiliateCommission_referredUserId_idx" ON "AffiliateCommission"("referredUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AffiliateCommission_status_idx" ON "AffiliateCommission"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AffiliateCommission_affiliateMode_idx" ON "AffiliateCommission"("affiliateMode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AffiliateCommission_createdAt_idx" ON "AffiliateCommission"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateCommission_sourceType_sourceId_key" ON "AffiliateCommission"("sourceType", "sourceId");

-- AddForeignKey
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
