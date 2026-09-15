-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RankTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'LEGEND');

-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "PenaltyType" AS ENUM ('AFK_WARNING', 'AFK_PENALTY', 'RAGE_QUIT', 'DISCONNECT_TIMEOUT', 'CHEATING', 'ABUSE', 'SPAMMING', 'UNSPORTSMANLIKE_CONDUCT');

-- CreateEnum
CREATE TYPE "PenaltyStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'APPEALED', 'REVOKED');

-- CreateEnum
CREATE TYPE "GameNotificationType" AS ENUM ('MATCH_FOUND', 'MATCH_STARTING', 'MATCH_ENDED', 'RANK_CHANGED', 'ACHIEVEMENT_UNLOCKED', 'SEASON_REWARD', 'FRIEND_ONLINE', 'TOURNAMENT_STARTING', 'PENALTY_RECEIVED', 'APPEAL_RESOLVED');

-- CreateEnum
CREATE TYPE "FriendStatus" AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('WAITING', 'STARTING', 'PLAYING', 'ENDED');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'RECONNECTING');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('CREATED', 'ACTIVE', 'FINISHED', 'ABORTED');

-- CreateEnum
CREATE TYPE "MatchPlayerResult" AS ENUM ('PENDING', 'WIN', 'LOSS', 'DRAW');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CREDIT', 'DEBIT', 'ADJUST');

-- CreateEnum
CREATE TYPE "TransactionReferenceType" AS ENUM ('MATCH_WAGER', 'MATCH_PAYOUT', 'ADMIN', 'BONUS', 'PRACTICE', 'DEPOSIT', 'WITHDRAWAL', 'REFERRAL', 'COUPON', 'TOURNAMENT_ENTRY', 'TOURNAMENT_PRIZE', 'LOCKED_CREDIT', 'REWARD_CREDIT', 'CASHBACK_CREDIT', 'WAGER_REFUND', 'REVERSAL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MATCH_INVITE', 'FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'MATCH_RESULT', 'TOURNAMENT', 'SYSTEM', 'REFERRAL', 'COUPON', 'ANNOUNCEMENT', 'MESSAGE', 'SUPPORT', 'PROMOTION', 'WALLET', 'ACHIEVEMENT', 'SYSTEM_ALERT');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('UPCOMING', 'LIVE', 'ENDED', 'CANCELLED', 'DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'STARTING', 'IN_PROGRESS', 'COMPLETED', 'SETTLING', 'SETTLED', 'PAUSED');

-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('BRACKET', 'KNOCKOUT', 'ROUND_ROBIN', 'SWISS', 'SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION');

-- CreateEnum
CREATE TYPE "BracketSlotStatus" AS ENUM ('PENDING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'BYE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SeedMethod" AS ENUM ('RANDOM', 'RATING', 'ADMIN_DEFINED');

-- CreateEnum
CREATE TYPE "TournamentSettlementStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "WalletRequestKind" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "WalletRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('INFO', 'UPDATE', 'MAINTENANCE', 'PROMOTION', 'ALERT');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CronJobStatus" AS ENUM ('SUCCESS', 'FAILED', 'RUNNING');

-- CreateEnum
CREATE TYPE "ErrorSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ErrorStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "MatchmakingStatus" AS ENUM ('WAITING', 'MATCHED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SupportContentType" AS ENUM ('FAQ', 'QUICK_ACTION', 'GUIDE', 'TROUBLESHOOTING', 'NOTE', 'LINK', 'TUTORIAL');

-- CreateEnum
CREATE TYPE "SupportContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KycLevel" AS ENUM ('LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'REQUIRES_RESUBMISSION');

-- CreateEnum
CREATE TYPE "KycDocumentType" AS ENUM ('AADHAAR_CARD', 'PAN_CARD', 'VOTER_ID', 'PASSPORT', 'DRIVING_LICENCE', 'NATIONAL_ID', 'RESIDENCE_PERMIT', 'UTILITY_BILL', 'BANK_STATEMENT', 'GOVERNMENT_ADDRESS_DOC', 'SELFIE');

-- CreateEnum
CREATE TYPE "KycDocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "customRoleId" TEXT,
    "referralCode" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'user',
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "currency" TEXT DEFAULT 'USD',
    "referredBy" TEXT,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "gems" INTEGER NOT NULL DEFAULT 45,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "streetAddress" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postcode" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "kycStatus" TEXT NOT NULL DEFAULT 'pending',
    "passwordHash" TEXT,
    "twoFactorSecret" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyStreak" INTEGER NOT NULL DEFAULT 0,
    "lastDailyClaim" TIMESTAMP(3),
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "premiumExpiresAt" TIMESTAMP(3),
    "vipLevel" INTEGER NOT NULL DEFAULT 0,
    "battlePassActive" BOOLEAN NOT NULL DEFAULT false,
    "battlePassXp" INTEGER NOT NULL DEFAULT 0,
    "battlePassTier" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Friend" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" "FriendStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Friend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'WAITING',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "stake" INTEGER NOT NULL,
    "minPlayers" INTEGER NOT NULL,
    "maxPlayers" INTEGER NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomPlayer" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seat" INTEGER,
    "isReady" BOOLEAN NOT NULL DEFAULT false,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "isSpectator" BOOLEAN NOT NULL DEFAULT false,
    "connectionStatus" "ConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "roomId" TEXT,
    "gameId" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'CREATED',
    "winnerIds" JSONB NOT NULL DEFAULT '[]',
    "stake" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "matchDeadline" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "resultReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchStatistics" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "averagePing" JSONB NOT NULL DEFAULT '{}',
    "packetLoss" JSONB NOT NULL DEFAULT '{}',
    "reconnections" INTEGER NOT NULL DEFAULT 0,
    "totalMoves" INTEGER NOT NULL DEFAULT 0,
    "illegalMoveAttempts" INTEGER NOT NULL DEFAULT 0,
    "timeoutCount" INTEGER NOT NULL DEFAULT 0,
    "drawOffers" INTEGER NOT NULL DEFAULT 0,
    "rematchRequests" INTEGER NOT NULL DEFAULT 0,
    "performanceData" JSONB NOT NULL DEFAULT '{}',
    "suspiciousActivity" JSONB NOT NULL DEFAULT '[]',
    "afkWarnings" INTEGER NOT NULL DEFAULT 0,
    "spectatorPeak" INTEGER NOT NULL DEFAULT 0,
    "spectatorMinutes" INTEGER NOT NULL DEFAULT 0,
    "coinsAwarded" JSONB NOT NULL DEFAULT '{}',
    "xpAwarded" JSONB NOT NULL DEFAULT '{}',
    "ratingChanges" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchStatistics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "result" "MatchPlayerResult" NOT NULL DEFAULT 'PENDING',
    "score" INTEGER NOT NULL DEFAULT 0,
    "ratingBefore" INTEGER,
    "ratingAfter" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameState" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "turnNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Move" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "action" JSONB NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Move_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leaderboard" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Leaderboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchmakingQueue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "entryFee" INTEGER NOT NULL DEFAULT 0,
    "gameMode" TEXT NOT NULL DEFAULT 'casual',
    "rating" INTEGER DEFAULT 1000,
    "status" "MatchmakingStatus" NOT NULL DEFAULT 'WAITING',
    "socketId" TEXT,
    "matchedWith" TEXT,
    "matchedAt" TIMESTAMP(3),
    "roomId" TEXT,
    "matchId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchmakingQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "bonusBalance" INTEGER NOT NULL DEFAULT 0,
    "lockedBalance" INTEGER NOT NULL DEFAULT 0,
    "rewardBalance" INTEGER NOT NULL DEFAULT 0,
    "cashbackBalance" INTEGER NOT NULL DEFAULT 0,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "frozenAt" TIMESTAMP(3),
    "frozenReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "WalletRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "WalletRequestKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "status" "WalletRequestStatus" NOT NULL DEFAULT 'PENDING',
    "method" TEXT,
    "note" TEXT,
    "adminId" TEXT,
    "adminNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletOtp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'WALLET_WITHDRAWAL',
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER DEFAULT 0,
    "balanceAfter" INTEGER NOT NULL,
    "walletType" TEXT NOT NULL DEFAULT 'MAIN',
    "referenceType" "TransactionReferenceType" NOT NULL,
    "referenceId" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "tournamentEventType" TEXT,
    "referenceId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Replay" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "fileUrl" TEXT,
    "payload" JSONB,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Replay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "gameId" TEXT,
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "condition" JSONB,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("userId","achievementId")
);

-- CreateTable
CREATE TABLE "PlayerStatistic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerStatistic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerGameStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "totalMatches" INTEGER NOT NULL DEFAULT 0,
    "rankedMatches" INTEGER NOT NULL DEFAULT 0,
    "casualMatches" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentWinStreak" INTEGER NOT NULL DEFAULT 0,
    "longestWinStreak" INTEGER NOT NULL DEFAULT 0,
    "currentLossStreak" INTEGER NOT NULL DEFAULT 0,
    "longestLossStreak" INTEGER NOT NULL DEFAULT 0,
    "averageMatchDuration" INTEGER NOT NULL DEFAULT 0,
    "fastestWin" INTEGER,
    "bestPerformance" JSONB,
    "totalTimePlayed" INTEGER NOT NULL DEFAULT 0,
    "rankedTimePlayed" INTEGER NOT NULL DEFAULT 0,
    "casualTimePlayed" INTEGER NOT NULL DEFAULT 0,
    "lastTenMatches" JSONB NOT NULL DEFAULT '[]',
    "lastTwentyMatches" JSONB NOT NULL DEFAULT '[]',
    "lastMatchAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerGameStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitiveRank" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "seasonId" TEXT,
    "mmr" INTEGER NOT NULL DEFAULT 1000,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "peakRating" INTEGER NOT NULL DEFAULT 1000,
    "tier" "RankTier" NOT NULL DEFAULT 'BRONZE',
    "tierProgress" INTEGER NOT NULL DEFAULT 0,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "placementMatches" INTEGER NOT NULL DEFAULT 0,
    "placementComplete" BOOLEAN NOT NULL DEFAULT false,
    "promotionMatches" INTEGER NOT NULL DEFAULT 0,
    "demotionProtection" BOOLEAN NOT NULL DEFAULT false,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "winStreak" INTEGER NOT NULL DEFAULT 0,
    "longestWinStreak" INTEGER NOT NULL DEFAULT 0,
    "globalRank" INTEGER,
    "regionalRank" INTEGER,
    "countryRank" INTEGER,
    "lastMatchAt" TIMESTAMP(3),
    "ratingUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitiveRank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'UPCOMING',
    "rewards" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingHistory" (
    "id" TEXT NOT NULL,
    "rankId" TEXT NOT NULL,
    "seasonId" TEXT,
    "matchId" TEXT,
    "ratingBefore" INTEGER NOT NULL,
    "ratingAfter" INTEGER NOT NULL,
    "ratingChange" INTEGER NOT NULL,
    "mmrBefore" INTEGER NOT NULL,
    "mmrAfter" INTEGER NOT NULL,
    "mmrChange" INTEGER NOT NULL,
    "tierBefore" "RankTier" NOT NULL,
    "tierAfter" "RankTier" NOT NULL,
    "tierProgressBefore" INTEGER NOT NULL,
    "tierProgressAfter" INTEGER NOT NULL,
    "opponentRating" INTEGER,
    "result" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerPenalty" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT,
    "type" "PenaltyType" NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "status" "PenaltyStatus" NOT NULL DEFAULT 'ACTIVE',
    "duration" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "coinsPenalty" INTEGER NOT NULL DEFAULT 0,
    "xpPenalty" INTEGER NOT NULL DEFAULT 0,
    "ratingPenalty" INTEGER NOT NULL DEFAULT 0,
    "detectionMethod" TEXT NOT NULL DEFAULT 'automatic',
    "detectionData" JSONB,
    "appealedAt" TIMESTAMP(3),
    "appealReason" TEXT,
    "appealResolvedAt" TIMESTAMP(3),
    "appealStatus" TEXT,
    "issuedBy" TEXT,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerPenalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerReputation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "tier" TEXT NOT NULL DEFAULT 'Good',
    "reportsReceived" INTEGER NOT NULL DEFAULT 0,
    "reportsValidated" INTEGER NOT NULL DEFAULT 0,
    "complimentsReceived" INTEGER NOT NULL DEFAULT 0,
    "afkCount" INTEGER NOT NULL DEFAULT 0,
    "rageQuitCount" INTEGER NOT NULL DEFAULT 0,
    "sportsmanshipScore" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "gamesCompleted" INTEGER NOT NULL DEFAULT 0,
    "gamesAbandoned" INTEGER NOT NULL DEFAULT 0,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "monthlyScore" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "weeklyScore" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerReputation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "matchId" TEXT,
    "reason" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "evidence" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "action" TEXT,
    "contextData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "GameNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "actionUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "bannerUrl" TEXT,
    "format" "TournamentFormat" NOT NULL DEFAULT 'SINGLE_ELIMINATION',
    "prizePool" INTEGER NOT NULL DEFAULT 0,
    "entryFee" INTEGER NOT NULL DEFAULT 0,
    "minPlayers" INTEGER NOT NULL DEFAULT 2,
    "maxPlayers" INTEGER NOT NULL DEFAULT 8,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "registrationStartsAt" TIMESTAMP(3),
    "registrationEndsAt" TIMESTAMP(3),
    "rules" JSONB NOT NULL DEFAULT '{}',
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "seedMethod" "SeedMethod" NOT NULL DEFAULT 'RANDOM',
    "enableThirdPlace" BOOLEAN NOT NULL DEFAULT false,
    "prizeDistribution" JSONB NOT NULL DEFAULT '[]',
    "grossPool" INTEGER NOT NULL DEFAULT 0,
    "autoStartWhenFull" BOOLEAN NOT NULL DEFAULT false,
    "configSnapshot" JSONB,
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "settledAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentPlayer" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nickname" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seed" INTEGER,
    "result" INTEGER,
    "finalRank" INTEGER,
    "eliminated" BOOLEAN NOT NULL DEFAULT false,
    "eliminatedInRound" INTEGER,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "scoreFor" INTEGER NOT NULL DEFAULT 0,
    "scoreAgainst" INTEGER NOT NULL DEFAULT 0,
    "liveStatus" TEXT NOT NULL DEFAULT 'REGISTERED',
    "currentRound" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TournamentPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentRound" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "matchNumber" INTEGER NOT NULL DEFAULT 0,
    "status" "BracketSlotStatus" NOT NULL DEFAULT 'PENDING',
    "isBye" BOOLEAN NOT NULL DEFAULT false,
    "playerAId" TEXT,
    "playerBId" TEXT,
    "winnerId" TEXT,
    "matchId" TEXT,
    "playerAScore" INTEGER NOT NULL DEFAULT 0,
    "playerBScore" INTEGER NOT NULL DEFAULT 0,
    "nextSlotId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TournamentRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentPrize" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "TournamentSettlementStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentPrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentResultSnapshot" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "playerAId" TEXT NOT NULL,
    "playerBId" TEXT NOT NULL,
    "winnerId" TEXT,
    "loserId" TEXT,
    "playerAScore" INTEGER NOT NULL DEFAULT 0,
    "playerBScore" INTEGER NOT NULL DEFAULT 0,
    "resultReason" TEXT NOT NULL,
    "integrityHash" TEXT NOT NULL,
    "eventsCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT true,
    "reviewStatus" TEXT NOT NULL DEFAULT 'VERIFIED',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentResultSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentDispute" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceUrls" JSONB NOT NULL DEFAULT '[]',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolutionAction" TEXT,
    "adminNotes" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentResultIdempotency" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "winnerId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentResultIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentIntegrityAlert" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "affectedRecord" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "details" TEXT,
    "resolutionNotes" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentIntegrityAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentTier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "entryFee" INTEGER NOT NULL,
    "maxPlayers" INTEGER NOT NULL,
    "prizePool" INTEGER NOT NULL,
    "prizeDistribution" JSONB NOT NULL DEFAULT '[]',
    "gameId" TEXT,
    "format" TEXT NOT NULL DEFAULT 'SINGLE_ELIMINATION',
    "enableThirdPlace" BOOLEAN NOT NULL DEFAULT true,
    "autoStartWhenFull" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentTierScheduleLog" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "slotHour" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentTierScheduleLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "userId" TEXT,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'PROCESSING',
    "response" JSONB,
    "referenceId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "commission" INTEGER NOT NULL DEFAULT 0,
    "referredReward" INTEGER NOT NULL DEFAULT 0,
    "qualifiedAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "CouponDiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "minWager" INTEGER NOT NULL DEFAULT 0,
    "maxRedeemValue" INTEGER,
    "gameId" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "CouponStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "AnnouncementType" NOT NULL DEFAULT 'INFO',
    "imageUrl" TEXT,
    "targetRole" TEXT DEFAULT 'ALL',
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("announcementId","userId")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMember" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedUser" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isStaff" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "deviceName" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'GLOBAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchHistory_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "ErrorEvent" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "severity" "ErrorSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "ErrorStatus" NOT NULL DEFAULT 'OPEN',
    "source" TEXT,
    "path" TEXT,
    "method" TEXT,
    "userId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "meta" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronJobRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" "CronJobStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "error" TEXT,
    "meta" JSONB,

    CONSTRAINT "CronJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentNotificationIdempotency" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentNotificationIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tournamentNotifications" BOOLEAN NOT NULL DEFAULT true,
    "matchReadyNotifications" BOOLEAN NOT NULL DEFAULT true,
    "prizeNotifications" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "secret" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SupportCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportArticle" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentType" "SupportContentType" NOT NULL DEFAULT 'FAQ',
    "status" "SupportContentStatus" NOT NULL DEFAULT 'DRAFT',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "quickAction" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportPageMapping" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "pageRoute" TEXT NOT NULL,
    "context" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportPageMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportArticleFeedback" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT,
    "isHelpful" BOOLEAN NOT NULL,
    "feedback" TEXT,
    "pageRoute" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportArticleFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportArticleTranslation" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportArticleTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportSearchLog" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "userId" TEXT,
    "pageRoute" TEXT,
    "results" JSONB,
    "clickedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportSearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "KycLevel" NOT NULL DEFAULT 'LEVEL_0',
    "status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "country" TEXT,
    "fullName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "mobileNumber" TEXT,
    "streetAddress" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "adminOverride" BOOLEAN NOT NULL DEFAULT false,
    "adminOverrideBy" TEXT,
    "adminOverrideAt" TIMESTAMP(3),
    "adminOverrideReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycDocument" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "documentType" "KycDocumentType" NOT NULL,
    "status" "KycDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "page" INTEGER,
    "side" TEXT,
    "documentNumber" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "issuingCountry" TEXT,
    "isSelfie" BOOLEAN NOT NULL DEFAULT false,
    "rejectionReason" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycReview" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycAuditLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycWithdrawalLimit" (
    "id" TEXT NOT NULL,
    "level" "KycLevel" NOT NULL,
    "dailyLimit" INTEGER NOT NULL,
    "monthlyLimit" INTEGER NOT NULL,
    "singleWithdrawLimit" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycWithdrawalLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycDocumentConfig" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "documentType" "KycDocumentType" NOT NULL,
    "isAccepted" BOOLEAN NOT NULL DEFAULT true,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "requiresBack" BOOLEAN NOT NULL DEFAULT false,
    "hasExpiry" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycDocumentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "targetAudience" JSONB,
    "rolloutPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conditions" JSONB,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemoteConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemoteConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "targetAudience" JSONB,
    "rewards" JSONB,
    "config" JSONB,
    "bannerUrl" TEXT,
    "metadata" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSeason" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "theme" TEXT,
    "rewards" JSONB,
    "battlePass" JSONB,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "leaderboardReset" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceWindow" (
    "id" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "affectedServices" TEXT[],
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerBroadcast" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "targetAudience" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "imageUrl" TEXT,
    "actionUrl" TEXT,
    "buttonText" TEXT,
    "targetAudience" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "dismissedBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreItem" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'coins',
    "originalPrice" DOUBLE PRECISION,
    "isLimited" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER,
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "targetAudience" JSONB,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInventoryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "isEquipped" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserInventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tier" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "interval" TEXT NOT NULL,
    "features" JSONB,
    "rewards" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "paymentMethod" TEXT,
    "externalSubscriptionId" TEXT,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gift" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channels" JSONB,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledNotification" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userIds" JSONB,
    "targetAudience" JSONB,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledNotification_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT,
    "roomId" TEXT,
    "userId" TEXT NOT NULL,
    "gameId" TEXT,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "actionTaken" TEXT NOT NULL DEFAULT 'LOG',
    "timestamp" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "User_customRoleId_idx" ON "User"("customRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRole_name_key" ON "CustomRole"("name");

-- CreateIndex
CREATE INDEX "CustomRole_name_idx" ON "CustomRole"("name");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permission_idx" ON "RolePermission"("permission");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permission_key" ON "RolePermission"("roleId", "permission");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_category_createdAt_idx" ON "AuditLog"("category", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "Profile_referredBy_idx" ON "Profile"("referredBy");

-- CreateIndex
CREATE INDEX "Friend_addresseeId_idx" ON "Friend"("addresseeId");

-- CreateIndex
CREATE UNIQUE INDEX "Friend_requesterId_addresseeId_key" ON "Friend"("requesterId", "addresseeId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- CreateIndex
CREATE INDEX "Room_code_idx" ON "Room"("code");

-- CreateIndex
CREATE INDEX "Room_gameId_status_idx" ON "Room"("gameId", "status");

-- CreateIndex
CREATE INDEX "RoomPlayer_userId_idx" ON "RoomPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomPlayer_roomId_userId_key" ON "RoomPlayer"("roomId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_roomId_key" ON "Match"("roomId");

-- CreateIndex
CREATE INDEX "Match_gameId_status_idx" ON "Match"("gameId", "status");

-- CreateIndex
CREATE INDEX "Match_status_matchDeadline_idx" ON "Match"("status", "matchDeadline");

-- CreateIndex
CREATE INDEX "Match_status_startedAt_idx" ON "Match"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchStatistics_matchId_key" ON "MatchStatistics"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_userId_key" ON "MatchPlayer"("matchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameState_matchId_key" ON "GameState"("matchId");

-- CreateIndex
CREATE INDEX "Move_matchId_idx" ON "Move"("matchId");

-- CreateIndex
CREATE INDEX "Leaderboard_gameId_score_idx" ON "Leaderboard"("gameId", "score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Leaderboard_gameId_userId_key" ON "Leaderboard"("gameId", "userId");

-- CreateIndex
CREATE INDEX "MatchmakingQueue_gameId_entryFee_gameMode_status_joinedAt_idx" ON "MatchmakingQueue"("gameId", "entryFee", "gameMode", "status", "joinedAt");

-- CreateIndex
CREATE INDEX "MatchmakingQueue_userId_status_idx" ON "MatchmakingQueue"("userId", "status");

-- CreateIndex
CREATE INDEX "MatchmakingQueue_status_expiresAt_idx" ON "MatchmakingQueue"("status", "expiresAt");

-- CreateIndex

-- CreateIndex
CREATE INDEX "WalletRequest_userId_kind_createdAt_idx" ON "WalletRequest"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "WalletRequest_kind_status_createdAt_idx" ON "WalletRequest"("kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WalletRequest_status_createdAt_idx" ON "WalletRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WalletOtp_userId_purpose_createdAt_idx" ON "WalletOtp"("userId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "WalletOtp_expiresAt_idx" ON "WalletOtp"("expiresAt");

-- CreateIndex
CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_referenceType_createdAt_idx" ON "Transaction"("referenceType", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_referenceId_idx" ON "Transaction"("referenceId");

-- CreateIndex
CREATE INDEX "AppNotification_userId_readAt_idx" ON "AppNotification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "AppNotification_userId_type_idx" ON "AppNotification"("userId", "type");

-- CreateIndex
CREATE INDEX "AppNotification_tournamentEventType_idx" ON "AppNotification"("tournamentEventType");

-- CreateIndex
CREATE INDEX "ChatMessage_roomId_createdAt_idx" ON "ChatMessage"("roomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Replay_matchId_key" ON "Replay"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_code_key" ON "Achievement"("code");

-- CreateIndex
CREATE INDEX "PlayerStatistic_gameId_rating_idx" ON "PlayerStatistic"("gameId", "rating" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStatistic_userId_gameId_key" ON "PlayerStatistic"("userId", "gameId");

-- CreateIndex
CREATE INDEX "PlayerGameStats_gameId_winRate_idx" ON "PlayerGameStats"("gameId", "winRate" DESC);

-- CreateIndex
CREATE INDEX "PlayerGameStats_gameId_totalMatches_idx" ON "PlayerGameStats"("gameId", "totalMatches" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameStats_userId_gameId_key" ON "PlayerGameStats"("userId", "gameId");

-- CreateIndex
CREATE INDEX "CompetitiveRank_gameId_mmr_idx" ON "CompetitiveRank"("gameId", "mmr" DESC);

-- CreateIndex
CREATE INDEX "CompetitiveRank_gameId_rating_idx" ON "CompetitiveRank"("gameId", "rating" DESC);

-- CreateIndex
CREATE INDEX "CompetitiveRank_gameId_tier_idx" ON "CompetitiveRank"("gameId", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitiveRank_userId_gameId_seasonId_key" ON "CompetitiveRank"("userId", "gameId", "seasonId");

-- CreateIndex
CREATE INDEX "Season_gameId_status_idx" ON "Season"("gameId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Season_gameId_startDate_key" ON "Season"("gameId", "startDate");

-- CreateIndex
CREATE INDEX "RatingHistory_rankId_createdAt_idx" ON "RatingHistory"("rankId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RatingHistory_matchId_idx" ON "RatingHistory"("matchId");

-- CreateIndex
CREATE INDEX "PlayerPenalty_userId_status_expiresAt_idx" ON "PlayerPenalty"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "PlayerPenalty_userId_createdAt_idx" ON "PlayerPenalty"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PlayerPenalty_matchId_idx" ON "PlayerPenalty"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerReputation_userId_key" ON "PlayerReputation"("userId");

-- CreateIndex
CREATE INDEX "PlayerReputation_score_idx" ON "PlayerReputation"("score" DESC);

-- CreateIndex
CREATE INDEX "PlayerReport_status_createdAt_idx" ON "PlayerReport"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PlayerReport_reportedUserId_status_idx" ON "PlayerReport"("reportedUserId", "status");

-- CreateIndex
CREATE INDEX "GameNotification_userId_readAt_idx" ON "GameNotification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "GameNotification_userId_createdAt_idx" ON "GameNotification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Tournament_status_startTime_idx" ON "Tournament"("status", "startTime");

-- CreateIndex
CREATE INDEX "Tournament_gameId_status_idx" ON "Tournament"("gameId", "status");

-- CreateIndex
CREATE INDEX "Tournament_status_createdAt_idx" ON "Tournament"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Tournament_createdAt_idx" ON "Tournament"("createdAt");

-- CreateIndex
CREATE INDEX "Tournament_gameId_createdAt_idx" ON "Tournament"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "Tournament_settledAt_idx" ON "Tournament"("settledAt");

-- CreateIndex
CREATE INDEX "TournamentPlayer_tournamentId_points_idx" ON "TournamentPlayer"("tournamentId", "points" DESC);

-- CreateIndex
CREATE INDEX "TournamentPlayer_tournamentId_finalRank_idx" ON "TournamentPlayer"("tournamentId", "finalRank");

-- CreateIndex
CREATE INDEX "TournamentPlayer_userId_idx" ON "TournamentPlayer"("userId");

-- CreateIndex
CREATE INDEX "TournamentPlayer_registeredAt_idx" ON "TournamentPlayer"("registeredAt");

-- CreateIndex
CREATE INDEX "TournamentPlayer_userId_registeredAt_idx" ON "TournamentPlayer"("userId", "registeredAt");

-- CreateIndex
CREATE INDEX "TournamentPlayer_tournamentId_eliminated_idx" ON "TournamentPlayer"("tournamentId", "eliminated");

-- CreateIndex
CREATE INDEX "TournamentPlayer_tournamentId_liveStatus_idx" ON "TournamentPlayer"("tournamentId", "liveStatus");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPlayer_tournamentId_userId_key" ON "TournamentPlayer"("tournamentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRound_matchId_key" ON "TournamentRound"("matchId");

-- CreateIndex
CREATE INDEX "TournamentRound_tournamentId_roundNumber_idx" ON "TournamentRound"("tournamentId", "roundNumber");

-- CreateIndex
CREATE INDEX "TournamentRound_matchId_idx" ON "TournamentRound"("matchId");

-- CreateIndex
CREATE INDEX "TournamentRound_status_completedAt_idx" ON "TournamentRound"("status", "completedAt");

-- CreateIndex
CREATE INDEX "TournamentRound_completedAt_idx" ON "TournamentRound"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRound_tournamentId_roundNumber_matchNumber_key" ON "TournamentRound"("tournamentId", "roundNumber", "matchNumber");

-- CreateIndex
CREATE INDEX "TournamentPrize_tournamentId_status_idx" ON "TournamentPrize"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "TournamentPrize_status_idx" ON "TournamentPrize"("status");

-- CreateIndex
CREATE INDEX "TournamentPrize_userId_status_idx" ON "TournamentPrize"("userId", "status");

-- CreateIndex
CREATE INDEX "TournamentPrize_status_createdAt_idx" ON "TournamentPrize"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TournamentPrize_paidAt_idx" ON "TournamentPrize"("paidAt");

-- CreateIndex
CREATE INDEX "TournamentPrize_tournamentId_rank_idx" ON "TournamentPrize"("tournamentId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPrize_tournamentId_userId_key" ON "TournamentPrize"("tournamentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentResultSnapshot_matchId_key" ON "TournamentResultSnapshot"("matchId");

-- CreateIndex
CREATE INDEX "TournamentResultSnapshot_tournamentId_roundNumber_idx" ON "TournamentResultSnapshot"("tournamentId", "roundNumber");

-- CreateIndex
CREATE INDEX "TournamentResultSnapshot_reviewStatus_idx" ON "TournamentResultSnapshot"("reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentDispute_disputeId_key" ON "TournamentDispute"("disputeId");

-- CreateIndex
CREATE INDEX "TournamentDispute_tournamentId_status_idx" ON "TournamentDispute"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "TournamentDispute_status_priority_idx" ON "TournamentDispute"("status", "priority");

-- CreateIndex
CREATE INDEX "TournamentDispute_userId_idx" ON "TournamentDispute"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentDispute_matchId_userId_key" ON "TournamentDispute"("matchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentResultIdempotency_matchId_key" ON "TournamentResultIdempotency"("matchId");

-- CreateIndex
CREATE INDEX "TournamentResultIdempotency_tournamentId_idx" ON "TournamentResultIdempotency"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentIntegrityAlert_alertId_key" ON "TournamentIntegrityAlert"("alertId");

-- CreateIndex
CREATE INDEX "TournamentIntegrityAlert_status_severity_idx" ON "TournamentIntegrityAlert"("status", "severity");

-- CreateIndex
CREATE INDEX "TournamentIntegrityAlert_tournamentId_status_idx" ON "TournamentIntegrityAlert"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "TournamentIntegrityAlert_issueType_idx" ON "TournamentIntegrityAlert"("issueType");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTier_code_key" ON "TournamentTier"("code");

-- CreateIndex
CREATE INDEX "TournamentTier_isActive_sortOrder_idx" ON "TournamentTier"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTierScheduleLog_tournamentId_key" ON "TournamentTierScheduleLog"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentTierScheduleLog_tierId_slotHour_idx" ON "TournamentTierScheduleLog"("tierId", "slotHour");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTierScheduleLog_tierId_slotHour_key" ON "TournamentTierScheduleLog"("tierId", "slotHour");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_key_key" ON "IdempotencyRecord"("key");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_userId_createdAt_idx" ON "IdempotencyRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_operation_createdAt_idx" ON "IdempotencyRecord"("operation", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_referenceId_idx" ON "IdempotencyRecord"("referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_createdAt_idx" ON "Referral"("referrerId", "createdAt");

-- CreateIndex
CREATE INDEX "Referral_status_createdAt_idx" ON "Referral"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Referral_code_idx" ON "Referral"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_status_validUntil_idx" ON "Coupon"("status", "validUntil");

-- CreateIndex

-- CreateIndex

-- CreateIndex
CREATE INDEX "CouponRedemption_userId_createdAt_idx" ON "CouponRedemption"("userId", "createdAt");

-- CreateIndex

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_couponId_userId_key" ON "CouponRedemption"("couponId", "userId");

-- CreateIndex
CREATE INDEX "Announcement_type_createdAt_idx" ON "Announcement"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedUser_blockerId_blockedId_key" ON "BlockedUser"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_status_idx" ON "SupportTicket"("userId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_status_priority_idx" ON "SupportTicket"("status", "priority");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoginSession_tokenHash_key" ON "LoginSession"("tokenHash");

-- CreateIndex
CREATE INDEX "LoginSession_userId_createdAt_idx" ON "LoginSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SearchHistory_userId_createdAt_idx" ON "SearchHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ErrorEvent_status_severity_idx" ON "ErrorEvent"("status", "severity");

-- CreateIndex
CREATE INDEX "ErrorEvent_code_createdAt_idx" ON "ErrorEvent"("code", "createdAt");

-- CreateIndex
CREATE INDEX "CronJobRun_jobName_startedAt_idx" ON "CronJobRun"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "TournamentNotificationIdempotency_tournamentId_eventType_idx" ON "TournamentNotificationIdempotency"("tournamentId", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentNotificationIdempotency_tournamentId_playerId_eve_key" ON "TournamentNotificationIdempotency"("tournamentId", "playerId", "eventType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "SiteSetting_category_idx" ON "SiteSetting"("category");

-- CreateIndex
CREATE UNIQUE INDEX "SupportCategory_name_key" ON "SupportCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SupportCategory_slug_key" ON "SupportCategory"("slug");

-- CreateIndex
CREATE INDEX "SupportCategory_isActive_sortOrder_idx" ON "SupportCategory"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SupportArticle_slug_key" ON "SupportArticle"("slug");

-- CreateIndex
CREATE INDEX "SupportArticle_categoryId_status_sortOrder_idx" ON "SupportArticle"("categoryId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "SupportArticle_contentType_status_idx" ON "SupportArticle"("contentType", "status");

-- CreateIndex
CREATE INDEX "SupportArticle_tags_idx" ON "SupportArticle"("tags");

-- CreateIndex
CREATE INDEX "SupportArticle_status_createdAt_idx" ON "SupportArticle"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportPageMapping_pageRoute_isActive_priority_idx" ON "SupportPageMapping"("pageRoute", "isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "SupportPageMapping_articleId_pageRoute_key" ON "SupportPageMapping"("articleId", "pageRoute");

-- CreateIndex
CREATE INDEX "SupportArticleFeedback_articleId_createdAt_idx" ON "SupportArticleFeedback"("articleId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportArticleFeedback_userId_idx" ON "SupportArticleFeedback"("userId");

-- CreateIndex
CREATE INDEX "SupportArticleTranslation_articleId_language_idx" ON "SupportArticleTranslation"("articleId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "SupportArticleTranslation_articleId_language_key" ON "SupportArticleTranslation"("articleId", "language");

-- CreateIndex
CREATE INDEX "SupportSearchLog_query_idx" ON "SupportSearchLog"("query");

-- CreateIndex
CREATE INDEX "SupportSearchLog_userId_createdAt_idx" ON "SupportSearchLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportSearchLog_pageRoute_createdAt_idx" ON "SupportSearchLog"("pageRoute", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "KycRequest_userId_key" ON "KycRequest"("userId");

-- CreateIndex
CREATE INDEX "KycRequest_status_idx" ON "KycRequest"("status");

-- CreateIndex
CREATE INDEX "KycRequest_level_idx" ON "KycRequest"("level");

-- CreateIndex
CREATE INDEX "KycRequest_country_idx" ON "KycRequest"("country");

-- CreateIndex
CREATE INDEX "KycRequest_createdAt_idx" ON "KycRequest"("createdAt");

-- CreateIndex
CREATE INDEX "KycDocument_requestId_idx" ON "KycDocument"("requestId");

-- CreateIndex
CREATE INDEX "KycDocument_documentType_idx" ON "KycDocument"("documentType");

-- CreateIndex
CREATE INDEX "KycDocument_status_idx" ON "KycDocument"("status");

-- CreateIndex
CREATE INDEX "KycReview_requestId_createdAt_idx" ON "KycReview"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "KycReview_reviewerId_createdAt_idx" ON "KycReview"("reviewerId", "createdAt");

-- CreateIndex
CREATE INDEX "KycAuditLog_requestId_createdAt_idx" ON "KycAuditLog"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "KycAuditLog_action_createdAt_idx" ON "KycAuditLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "KycWithdrawalLimit_level_key" ON "KycWithdrawalLimit"("level");

-- CreateIndex
CREATE INDEX "KycWithdrawalLimit_level_isActive_idx" ON "KycWithdrawalLimit"("level", "isActive");

-- CreateIndex
CREATE INDEX "KycDocumentConfig_country_isAccepted_idx" ON "KycDocumentConfig"("country", "isAccepted");

-- CreateIndex
CREATE UNIQUE INDEX "KycDocumentConfig_country_documentType_key" ON "KycDocumentConfig"("country", "documentType");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RemoteConfig_key_environment_key" ON "RemoteConfig"("key", "environment");

-- CreateIndex
CREATE INDEX "LiveEvent_status_idx" ON "LiveEvent"("status");

-- CreateIndex
CREATE INDEX "GlobalAnnouncement_status_idx" ON "GlobalAnnouncement"("status");

-- CreateIndex
CREATE INDEX "UserInventoryItem_userId_type_idx" ON "UserInventoryItem"("userId", "type");

-- CreateIndex
CREATE INDEX "UserSubscription_userId_status_idx" ON "UserSubscription"("userId", "status");

-- CreateIndex
CREATE INDEX "Gift_recipientId_status_idx" ON "Gift"("recipientId", "status");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_name_key" ON "NotificationTemplate"("name");

-- CreateIndex
CREATE INDEX "ScheduledNotification_status_scheduledAt_idx" ON "ScheduledNotification"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_idx" ON "SecurityEvent"("userId");

-- CreateIndex
CREATE INDEX "SecurityEvent_severity_createdAt_idx" ON "SecurityEvent"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_eventType_createdAt_idx" ON "SecurityEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_matchId_idx" ON "SecurityEvent"("matchId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "CustomRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friend" ADD CONSTRAINT "Friend_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomPlayer" ADD CONSTRAINT "RoomPlayer_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomPlayer" ADD CONSTRAINT "RoomPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchStatistics" ADD CONSTRAINT "MatchStatistics_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameState" ADD CONSTRAINT "GameState_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Move" ADD CONSTRAINT "Move_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Move" ADD CONSTRAINT "Move_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leaderboard" ADD CONSTRAINT "Leaderboard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchmakingQueue" ADD CONSTRAINT "MatchmakingQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletRequest" ADD CONSTRAINT "WalletRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletRequest" ADD CONSTRAINT "WalletRequest_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletOtp" ADD CONSTRAINT "WalletOtp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Replay" ADD CONSTRAINT "Replay_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStatistic" ADD CONSTRAINT "PlayerStatistic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameStats" ADD CONSTRAINT "PlayerGameStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitiveRank" ADD CONSTRAINT "CompetitiveRank_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitiveRank" ADD CONSTRAINT "CompetitiveRank_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingHistory" ADD CONSTRAINT "RatingHistory_rankId_fkey" FOREIGN KEY ("rankId") REFERENCES "CompetitiveRank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingHistory" ADD CONSTRAINT "RatingHistory_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPenalty" ADD CONSTRAINT "PlayerPenalty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerReputation" ADD CONSTRAINT "PlayerReputation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerReport" ADD CONSTRAINT "PlayerReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerReport" ADD CONSTRAINT "PlayerReport_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameNotification" ADD CONSTRAINT "GameNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRound" ADD CONSTRAINT "TournamentRound_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPrize" ADD CONSTRAINT "TournamentPrize_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPrize" ADD CONSTRAINT "TournamentPrize_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "TournamentPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentResultSnapshot" ADD CONSTRAINT "TournamentResultSnapshot_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentDispute" ADD CONSTRAINT "TournamentDispute_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentDispute" ADD CONSTRAINT "TournamentDispute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentIntegrityAlert" ADD CONSTRAINT "TournamentIntegrityAlert_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTierScheduleLog" ADD CONSTRAINT "TournamentTierScheduleLog_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "TournamentTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedUser" ADD CONSTRAINT "BlockedUser_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedUser" ADD CONSTRAINT "BlockedUser_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginSession" ADD CONSTRAINT "LoginSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ErrorEvent" ADD CONSTRAINT "ErrorEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportArticle" ADD CONSTRAINT "SupportArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SupportCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportPageMapping" ADD CONSTRAINT "SupportPageMapping_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "SupportArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportArticleFeedback" ADD CONSTRAINT "SupportArticleFeedback_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "SupportArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycRequest" ADD CONSTRAINT "KycRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycRequest" ADD CONSTRAINT "KycRequest_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "KycRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycReview" ADD CONSTRAINT "KycReview_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "KycRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycReview" ADD CONSTRAINT "KycReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycAuditLog" ADD CONSTRAINT "KycAuditLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "KycRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

