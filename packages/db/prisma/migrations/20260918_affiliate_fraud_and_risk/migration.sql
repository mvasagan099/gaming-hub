-- ============================================================
-- Affiliate Fraud & Risk Monitoring Migration
-- 2026-09-18
-- ============================================================

-- AlterTable Referral: Per-referral affiliate block fields
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
