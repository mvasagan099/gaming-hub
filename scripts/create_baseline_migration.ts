import fs from "node:fs";
import path from "node:path";

const fullSql = fs.readFileSync("/tmp/full_schema.sql", "utf8");

// We need to construct the baseline schema prior to 20260828, 20260831, and 20260915.
// 1. Remove AppVersionConfig table creation and its foreign keys / indices (handled by 20260831)
// 2. Remove UserPrivacy table creation and its foreign keys / indices (handled by 20260915)
// 3. In TournamentTierScheduleLog: remove "gameId" column and use original unique constraint/index
// 4. In Profile: remove twoFactorSecretEncrypted, twoFactorSecretKeyVersion, totpEncryptedAt, promoMigratedAt
// 5. In LoginSession: remove mfaVerifiedAt
// 6. In CouponRedemption: remove couponCodeHash, externalTxId, sagaStatus, failureReason, externalConfirmedAt, completedAt
// 7. In WalletRequest: remove externalTransferId, processingStartedAt

let baselineSql = fullSql;

// Remove AppVersionConfig
baselineSql = baselineSql.replace(/-- CreateTable\s+CREATE TABLE "AppVersionConfig"[\s\S]*?\);\n/g, "");

// Remove UserPrivacy
baselineSql = baselineSql.replace(/-- CreateTable\s+CREATE TABLE "UserPrivacy"[\s\S]*?\);\n/g, "");
baselineSql = baselineSql.replace(/-- AddForeignKey\s+ALTER TABLE "UserPrivacy"[\s\S]*?;\n/g, "");

// Modify TournamentTierScheduleLog in baseline
baselineSql = baselineSql.replace(
  /CREATE TABLE "TournamentTierScheduleLog" \([\s\S]*?\);/,
  `CREATE TABLE "TournamentTierScheduleLog" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "slotHour" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentTierScheduleLog_pkey" PRIMARY KEY ("id")
);`
);
baselineSql = baselineSql.replace(
  /CREATE UNIQUE INDEX "TournamentTierScheduleLog_tierId_gameId_slotHour_key" ON "TournamentTierScheduleLog"\("tierId", "gameId", "slotHour"\);/,
  `CREATE UNIQUE INDEX "TournamentTierScheduleLog_tierId_slotHour_key" ON "TournamentTierScheduleLog"("tierId", "slotHour");`
);
baselineSql = baselineSql.replace(
  /CREATE INDEX "TournamentTierScheduleLog_tierId_gameId_slotHour_idx" ON "TournamentTierScheduleLog"\("tierId", "gameId", "slotHour"\);/,
  `CREATE INDEX "TournamentTierScheduleLog_tierId_slotHour_idx" ON "TournamentTierScheduleLog"("tierId", "slotHour");`
);

// Remove security fields added in 20260915:
// Profile:
baselineSql = baselineSql.replace(/\s+"twoFactorSecretEncrypted"\s+TEXT,/g, "");
baselineSql = baselineSql.replace(/\s+"twoFactorSecretKeyVersion"\s+INTEGER,/g, "");
baselineSql = baselineSql.replace(/\s+"totpEncryptedAt"\s+TIMESTAMP\(3\),/g, "");
baselineSql = baselineSql.replace(/\s+"promoMigratedAt"\s+TIMESTAMP\(3\),/g, "");

// LoginSession:
baselineSql = baselineSql.replace(/\s+"mfaVerifiedAt"\s+TIMESTAMP\(3\),/g, "");

// CouponRedemption baseline (before 20260915_security_schema_v1):
baselineSql = baselineSql.replace(
  /CREATE TABLE "CouponRedemption" \([\s\S]*?\);/,
  `CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);`
);
baselineSql = baselineSql.replace(/CREATE UNIQUE INDEX "CouponRedemption_couponCodeHash_key"[\s\S]*?;\n/g, "");
baselineSql = baselineSql.replace(/CREATE UNIQUE INDEX "CouponRedemption_externalTxId_key"[\s\S]*?;\n/g, "");
baselineSql = baselineSql.replace(/CREATE INDEX "CouponRedemption_sagaStatus_createdAt_idx"[\s\S]*?;\n/g, "");

// WalletRequest:
baselineSql = baselineSql.replace(/\s+"externalTransferId"\s+TEXT,/g, "");
baselineSql = baselineSql.replace(/\s+"processingStartedAt"\s+TIMESTAMP\(3\),/g, "");
baselineSql = baselineSql.replace(/CREATE UNIQUE INDEX "WalletRequest_externalTransferId_key"[\s\S]*?;\n/g, "");

const migrationDir = path.resolve("packages/db/prisma/migrations/20260801000000_init");
fs.mkdirSync(migrationDir, { recursive: true });
fs.writeFileSync(path.join(migrationDir, "migration.sql"), baselineSql);
console.log("Wrote baseline migration to:", path.join(migrationDir, "migration.sql"));
