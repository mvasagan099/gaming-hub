/**
 * Shared tournament types, state machine, and bracket utilities.
 * Used by: apps/api, apps/socket-server, apps/web
 */

// ---------------------------------------------------------------------------
// Enums / literal types
// ---------------------------------------------------------------------------

export type TournamentStatus =
  | "UPCOMING"
  | "LIVE"
  | "ENDED"
  | "CANCELLED"
  | "DRAFT"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "STARTING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "SETTLING"
  | "SETTLED"
  | "PAUSED";

export type TournamentFormat =
  | "BRACKET"
  | "KNOCKOUT"
  | "ROUND_ROBIN"
  | "SWISS"
  | "SINGLE_ELIMINATION"
  | "DOUBLE_ELIMINATION";

export type BracketSlotStatus =
  | "PENDING"
  | "READY"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "BYE"
  | "CANCELLED";

export type SeedMethod = "RANDOM" | "RATING" | "ADMIN_DEFINED";

export type TournamentSettlementStatus = "PENDING" | "PAID" | "FAILED";

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  DRAFT:               ["REGISTRATION_OPEN", "CANCELLED"],
  REGISTRATION_OPEN:   ["REGISTRATION_CLOSED", "STARTING", "CANCELLED"],
  REGISTRATION_CLOSED: ["STARTING", "REGISTRATION_OPEN", "CANCELLED"],
  STARTING:            ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS:         ["COMPLETED", "PAUSED", "CANCELLED"],
  PAUSED:              ["IN_PROGRESS", "CANCELLED"],
  COMPLETED:           ["SETTLING"],
  SETTLING:            ["SETTLED", "CANCELLED"],
  SETTLED:             [],
  CANCELLED:           [],
  UPCOMING:            ["REGISTRATION_OPEN", "CANCELLED"],
  LIVE:                ["COMPLETED", "IN_PROGRESS", "CANCELLED"],
  ENDED:               ["SETTLED", "SETTLING"],
};

export function canTransitionTournamentStatus(
  current: TournamentStatus,
  next: TournamentStatus,
): boolean {
  return (ALLOWED_TRANSITIONS[current] ?? []).includes(next);
}

// ---------------------------------------------------------------------------
// Bracket utilities
// ---------------------------------------------------------------------------

export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 2;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function computeByeCount(playerCount: number): number {
  return nextPowerOfTwo(playerCount) - playerCount;
}

export function computeTotalRounds(playerCount: number): number {
  return Math.log2(nextPowerOfTwo(playerCount));
}

export interface BracketSlot {
  matchNumber: number;
  playerAId: string | null;
  playerBId: string | null;
  isBye: boolean;
  nextSlotMatchNumber: number | null;
}

export interface BracketRound {
  roundNumber: number;
  slots: BracketSlot[];
}

export function generateFirstRoundSlots(seededPlayerIds: string[]): BracketSlot[] {
  const n = seededPlayerIds.length;
  const bracketSize = nextPowerOfTwo(n);
  const byeCount = bracketSize - n;
  const slots: BracketSlot[] = [];
  const slotCount = bracketSize / 2;

  const padded: Array<string | null> = [...seededPlayerIds];
  for (let i = 0; i < byeCount; i++) {
    padded.push(null);
  }

  for (let i = 0; i < slotCount; i++) {
    const playerA = padded[i] ?? null;
    const playerB = padded[bracketSize - 1 - i] ?? null;
    const isBye = playerA !== null && playerB === null;
    const nextSlotMatchNumber = Math.floor(i / 2);
    slots.push({
      matchNumber: i,
      playerAId: playerA,
      playerBId: playerB,
      isBye,
      nextSlotMatchNumber: slotCount > 1 ? nextSlotMatchNumber : null,
    });
  }

  return slots;
}

export function generateFullBracketStructure(seededPlayerIds: string[]): BracketRound[] {
  const totalRounds = computeTotalRounds(seededPlayerIds.length);
  const rounds: BracketRound[] = [];
  const firstRoundSlots = generateFirstRoundSlots(seededPlayerIds);

  rounds.push({ roundNumber: 1, slots: firstRoundSlots });

  let prevSlotCount = firstRoundSlots.length;
  for (let r = 2; r <= totalRounds; r++) {
    const slotCount = prevSlotCount / 2;
    const slots: BracketSlot[] = [];
    for (let i = 0; i < slotCount; i++) {
      slots.push({
        matchNumber: i,
        playerAId: null,
        playerBId: null,
        isBye: false,
        nextSlotMatchNumber: slotCount > 1 ? Math.floor(i / 2) : null,
      });
    }
    rounds.push({ roundNumber: r, slots });
    prevSlotCount = slotCount;
  }

  return rounds;
}

// ---------------------------------------------------------------------------
// Prize distribution
// ---------------------------------------------------------------------------

export interface PrizeDistributionEntry {
  rank: number;
  percentage: number;
  amount?: number;
}

export function defaultPrizeDistribution(format: TournamentFormat): PrizeDistributionEntry[] {
  if (format === "SINGLE_ELIMINATION" || format === "BRACKET" || format === "KNOCKOUT") {
    return [
      { rank: 1, percentage: 60 },
      { rank: 2, percentage: 30 },
      { rank: 3, percentage: 10 },
    ];
  }
  return [{ rank: 1, percentage: 100 }];
}

export function validatePrizeConfiguration(
  prizePool: number,
  distribution: PrizeDistributionEntry[],
): { valid: boolean; totalPercentage: number; totalAmount: number; error?: string } {
  if (prizePool < 0) {
    return { valid: false, totalPercentage: 0, totalAmount: 0, error: "Prize pool cannot be negative" };
  }
  if (!Array.isArray(distribution) || distribution.length === 0) {
    return { valid: true, totalPercentage: 100, totalAmount: prizePool };
  }

  let totalPercentage = 0;
  let totalFixedAmount = 0;

  for (const entry of distribution) {
    if (entry.rank < 1) {
      return { valid: false, totalPercentage, totalAmount: 0, error: `Invalid rank: ${entry.rank}` };
    }
    if (entry.percentage != null) {
      if (entry.percentage < 0 || entry.percentage > 100) {
        return { valid: false, totalPercentage, totalAmount: 0, error: `Percentage must be between 0 and 100 for rank ${entry.rank}` };
      }
      totalPercentage += entry.percentage;
    }
    if (entry.amount != null) {
      if (entry.amount < 0) {
        return { valid: false, totalPercentage, totalAmount: 0, error: `Amount cannot be negative for rank ${entry.rank}` };
      }
      totalFixedAmount += entry.amount;
    }
  }

  if (totalPercentage > 100) {
    return {
      valid: false,
      totalPercentage,
      totalAmount: Math.floor((prizePool * totalPercentage) / 100),
      error: `Sum of prize percentages (${totalPercentage}%) exceeds 100%`,
    };
  }

  if (totalFixedAmount > prizePool) {
    return {
      valid: false,
      totalPercentage,
      totalAmount: totalFixedAmount,
      error: `Sum of fixed prizes (${totalFixedAmount}) exceeds authoritative prize pool (${prizePool})`,
    };
  }

  const calculatedTotal = totalFixedAmount > 0 ? totalFixedAmount : Math.floor((prizePool * totalPercentage) / 100);
  return { valid: true, totalPercentage, totalAmount: calculatedTotal };
}

export function calculatePrizes(
  grossPool: number,
  distribution: PrizeDistributionEntry[],
): { rank: number; amount: number }[] {
  if (!distribution || distribution.length === 0) {
    return [{ rank: 1, amount: grossPool }];
  }
  return distribution.map((d) => ({
    rank: d.rank,
    amount: d.amount != null && d.amount > 0 ? d.amount : Math.floor((grossPool * (d.percentage ?? 0)) / 100),
  }));
}

export interface TournamentPrizeConfigSnapshot {
  entryFee: number;
  prizePool: number;
  grossPool: number;
  platformShare?: number;
  prizeDistribution: PrizeDistributionEntry[];
  calculatedPrizes: { rank: number; amount: number; percentage?: number }[];
  prizesByRank?: Record<number, { percentage: number; amount: number }>;
  currency: string;
  format: TournamentFormat;
  gameId: string;
  stateVersion: number;
  snapshottedAt: string;
}

export type TournamentSettlementStatusType =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "PAID"
  | "FAILED"
  | "CREDITED";

export interface TournamentSettlementRecord {
  id: string;
  settlementId: string;
  tournamentId: string;
  tournamentTitle?: string;
  userId: string;
  playerId?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
  position: number;
  rank: number;
  prizeAmount: number;
  status: TournamentSettlementStatusType;
  transactionId?: string | null;
  failureReason?: string | null;
  retryCount: number;
  lastAttemptAt?: string | null;
  paidAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TournamentSettlementSummary {
  tournamentId: string;
  tournamentTitle: string;
  status: TournamentStatus;
  overallSettlementStatus?: "NOT_STARTED" | "PROCESSING" | "PARTIALLY_SETTLED" | "SETTLED" | "SETTLEMENT_FAILED";
  prizePool: number;
  grossPool: number;
  platformShare?: number;
  totalPrizesCount: number;
  completedCount: number;
  pendingCount: number;
  failedCount: number;
  totalPaidAmount: number;
  totalUnpaidAmount: number;
  settledAt?: string | null;
  settlements: TournamentSettlementRecord[];
}

export type TournamentRefundStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "PROCESSING"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "FAILED";

export type TournamentCancellationReason =
  | "MINIMUM_PLAYERS_NOT_REACHED"
  | "ADMIN_MANUAL_CANCELLATION"
  | "SYSTEM_MAINTENANCE"
  | "TECHNICAL_ISSUE";

export interface TournamentCancellationPreview {
  tournamentId: string;
  title: string;
  status: TournamentStatus;
  registeredPlayers: number;
  minPlayers: number;
  maxPlayers: number;
  entryFee: number;
  prizePool: number;
  totalEntryCollection: number;
  totalRefundableAmount: number;
  canCancel: boolean;
  blockingReason?: string;
}

export interface TournamentRefundRecord {
  id: string;
  userId: string;
  playerId?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
  entryFee: number;
  refundAmount: number;
  status: "PENDING" | "PROCESSING" | "REFUNDED" | "FAILED";
  originalTransactionId: string | null;
  refundTransactionId: string | null;
  failureReason?: string | null;
  createdAt: string;
  refundedAt?: string | null;
}

export interface TournamentRefundSummary {
  tournamentId: string;
  tournamentTitle: string;
  status: TournamentStatus;
  cancellationReason?: string | null;
  overallRefundStatus: TournamentRefundStatus;
  totalRefundableAmount: number;
  totalRefundedAmount: number;
  totalPlayersCount: number;
  completedCount: number;
  pendingCount: number;
  failedCount: number;
  refunds: TournamentRefundRecord[];
}

export function isSupportedTournamentFormat(format: TournamentFormat): boolean {
  return format === "SINGLE_ELIMINATION";
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

export interface TournamentBracketSlot {
  id: string;
  roundNumber: number;
  matchNumber: number;
  status: BracketSlotStatus;
  isBye: boolean;
  playerAId: string | null;
  playerBId: string | null;
  winnerId: string | null;
  matchId: string | null;
  playerAScore: number;
  playerBScore: number;
  nextSlotId: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
}

export interface TournamentBracket {
  tournamentId: string;
  format: TournamentFormat;
  totalRounds: number;
  rounds: {
    roundNumber: number;
    slots: TournamentBracketSlot[];
  }[];
}

export interface TournamentPlayerStatus {
  isRegistered: boolean;
  seed: number | null;
  eliminated: boolean;
  eliminatedInRound: number | null;
  finalRank: number | null;
  currentRoundId: string | null;
  currentMatchId: string | null;
  currentRound: number | null;
  opponent: { id: string; username: string; displayName: string; avatarUrl: string | null } | null;
  matchStatus: BracketSlotStatus | null;
}

export interface TournamentMatchMetadata {
  tournamentId: string;
  tournamentRoundId: string;
  tournamentMatchNumber: number;
  tournamentEntryHandled: true;
}

export interface TournamentCurrentMatchResponse {
  tournamentId: string;
  roundId: string;
  matchId: string;
  opponent: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
  status: BracketSlotStatus;
  roundNumber: number;
  matchNumber: number;
}

// ---------------------------------------------------------------------------
// Player history, stats, leaderboard
// ---------------------------------------------------------------------------

export interface TournamentHistoryEntry {
  tournamentId: string;
  title: string;
  gameId: string;
  format: TournamentFormat;
  status: TournamentStatus;
  entryFee: number;
  prizePool: number;
  registeredAt: string;
  finalRank: number | null;
  eliminated: boolean;
  eliminatedInRound: number | null;
  prizeWon: number;
  startTime: string;
}

export interface TournamentPlayerStats {
  tournamentsPlayed: number;
  tournamentsWon: number;
  finalsReached: number;
  topThreeFinishes: number;
  totalEntryFees: number;
  totalPrizesWon: number;
  bestRank: number | null;
}

export interface TournamentLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  wins: number;
  finalsReached: number;
  tournamentsPlayed: number;
  totalPrizeWon: number;
}

// ---------------------------------------------------------------------------
// Tournament Standings & Live Leaderboard Types
// ---------------------------------------------------------------------------

export type TournamentPlayerLiveStatus =
  | "REGISTERED"
  | "WAITING"
  | "LIVE"
  | "ADVANCED"
  | "ELIMINATED"
  | "CHAMPION";

export interface TournamentStandingsEntry {
  rank: number;
  userId: string;
  playerId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  matchesPlayed: number;
  wins: number;
  losses: number;
  points: number;
  scoreFor: number;
  scoreAgainst: number;
  scoreDiff: number;
  status: TournamentPlayerLiveStatus;
  currentRound: number;
  eliminatedInRound: number | null;
  finalRank: number | null;
  prizeAmount?: number;
  prizeStatus?: string;
  seed?: number | null;
}

export interface TournamentRoundProgressItem {
  roundNumber: number;
  name: string;
  playerCount: number;
  status: "COMPLETED" | "IN_PROGRESS" | "UPCOMING";
}

export interface TournamentLeaderboardResponse {
  tournamentId: string;
  tournamentTitle: string;
  gameId: string;
  status: TournamentStatus;
  totalPlayers: number;
  currentRound: number;
  totalRounds: number;
  roundProgress: TournamentRoundProgressItem[];
  myRank: {
    rank: number;
    wins: number;
    losses: number;
    points: number;
    status: TournamentPlayerLiveStatus;
    currentRound: number;
  } | null;
  page: number;
  pageSize: number;
  total: number;
  standings: TournamentStandingsEntry[];
}

export interface GameTournamentRankingEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  gameId: string;
  tournamentsWon: number;
  tournamentsPlayed: number;
  winRate: number;
  totalPrizesWon: number;
  totalMatchesWon: number;
  totalMatchesPlayed: number;
}

export interface TournamentTierBreakdownStat {
  tierCode: "mini" | "basic" | "standard" | "premium" | "pro";
  tierName: string;
  tournamentsPlayed: number;
  tournamentsWon: number;
  topFourFinishes: number;
  totalPrizesWon: number;
  winRate: number;
}

export interface GameTournamentBreakdownStat {
  gameId: string;
  tournamentsPlayed: number;
  tournamentsWon: number;
  topFourFinishes: number;
  matchWins: number;
  matchLosses: number;
  winRate: number;
  totalPrizesWon: number;
}

export interface PlayerTournamentCareerStats {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  tournamentWins: number;
  tournamentsPlayed: number;
  tournamentAppearances: number;
  finalsReached: number;
  topThreeFinishes: number;
  topFourFinishes: number;
  totalTournamentEntries: number;
  totalTournamentPrizes: number;
  currentRanking: number | null;
  rankingScore: number;
  winRate: number;
  totalMatchesPlayed: number;
  totalMatchesWon: number;
  totalPrizesWon: number;
  bestRank: number | null;
  tierBreakdown: TournamentTierBreakdownStat[];
  gameBreakdown: GameTournamentBreakdownStat[];
}

export interface GlobalTournamentLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  gameId?: string;
  tier?: string;
  tournamentsWon: number;
  tournamentsPlayed: number;
  topFourFinishes: number;
  matchWins: number;
  matchLosses: number;
  winRate: number;
  points: number;
  totalPrizesWon: number;
}

export interface GlobalTournamentLeaderboardResponse {
  scope: "overall" | "game" | "tier";
  gameId?: string;
  tier?: string;
  period: "all" | "month" | "week";
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  myRank: {
    rank: number;
    points: number;
    tournamentsWon: number;
    tournamentsPlayed: number;
    matchWins: number;
    matchLosses: number;
  } | null;
  items: GlobalTournamentLeaderboardEntry[];
}


// ---------------------------------------------------------------------------
// Tournament Result Verification & Dispute Management
// ---------------------------------------------------------------------------

export const DEFAULT_DISPUTE_WINDOW_MINUTES = 10;
export const DEFAULT_DISPUTE_WINDOW_MS = DEFAULT_DISPUTE_WINDOW_MINUTES * 60 * 1000;

export type TournamentDisputeReason =
  | "WRONG_RESULT"
  | "INCORRECT_SCORE"
  | "CONNECTION_ISSUE"
  | "GAME_STATE_ISSUE"
  | "SUSPECTED_CHEATING"
  | "OTHER";

export type TournamentDisputeStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "RESOLVED"
  | "REJECTED"
  | "CLOSED";

export type TournamentDisputePriority =
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "CRITICAL";

export type TournamentDisputeResolutionAction =
  | "CONFIRM_RESULT"
  | "REJECT_DISPUTE"
  | "REQUEST_REVIEW"
  | "ESCALATE"
  | "OVERRIDE_RESULT"
  | "FINANCIAL_CORRECTION";

export interface TournamentDisputeSummary {
  id: string;
  disputeId: string;
  tournamentId: string;
  tournamentTitle?: string;
  gameId?: string;
  matchId: string;
  userId: string;
  userName?: string;
  userDisplayName?: string;
  roundNumber: number;
  reason: TournamentDisputeReason;
  description: string;
  evidenceUrls: string[];
  priority: TournamentDisputePriority;
  status: TournamentDisputeStatus;
  resolutionAction: TournamentDisputeResolutionAction | null;
  adminNotes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TournamentResultSnapshotData {
  id: string;
  matchId: string;
  tournamentId: string;
  roundNumber: number;
  matchNumber: number;
  playerAId: string;
  playerBId: string;
  playerAName?: string;
  playerBName?: string;
  winnerId: string | null;
  loserId: string | null;
  playerAScore: number;
  playerBScore: number;
  resultReason: string;
  integrityHash: string;
  eventsCount: number;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  stateVersion: number;
  isVerified: boolean;
  reviewStatus: "VERIFIED" | "RESULT_REVIEW_REQUIRED" | "OVERRIDDEN";
  createdAt: string;
}

export interface TournamentDisputeDetail extends TournamentDisputeSummary {
  tournament: {
    id: string;
    title: string;
    gameId: string;
    status: TournamentStatus;
    prizePool: number;
    currentRound: number;
  };
  match: {
    id: string;
    gameId: string;
    status: string;
    startedAt: string | null;
    endedAt: string | null;
    winnerIds: string[];
    resultReason: string;
    playerA: { id: string; username: string; displayName: string; avatarUrl: string | null; score: number };
    playerB: { id: string; username: string; displayName: string; avatarUrl: string | null; score: number };
    replayAvailable: boolean;
    replayId?: string;
  };
  snapshot?: TournamentResultSnapshotData | null;
  authoritativeEventsSummary?: {
    totalEvents: number;
    movesCount: number;
    disconnectsCount: number;
    timeoutsCount: number;
  };
}

export interface CreateDisputePayload {
  matchId: string;
  reason: TournamentDisputeReason;
  description: string;
  evidenceUrls?: string[];
}

export interface ResolveDisputePayload {
  action: TournamentDisputeResolutionAction;
  adminNotes?: string;
  newWinnerId?: string;
  newScoreA?: number;
  newScoreB?: number;
  justificationReason?: string;
}

// ---------------------------------------------------------------------------
// Tournament Tiers — admin-managed config templates for hourly tournaments
// ---------------------------------------------------------------------------

export interface TournamentTierConfig {
  id: string;
  name: string;
  code: string;
  description: string | null;
  entryFee: number;
  minPlayers?: number;
  maxPlayers: number;
  prizePool: number;
  prizeDistribution: PrizeDistributionEntry[];
  gameId: string | null;
  format: TournamentFormat;
  enableThirdPlace: boolean;
  autoStartWhenFull: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 4 prize positions: 1st 50% / 2nd 25% / 3rd 15% / 4th 10% */
export const DEFAULT_TIER_PRIZE_DISTRIBUTION: PrizeDistributionEntry[] = [
  { rank: 1, percentage: 50 },
  { rank: 2, percentage: 25 },
  { rank: 3, percentage: 15 },
  { rank: 4, percentage: 10 },
];

/**
 * Canonical default configuration for the 5 standard tiers.
 * Used by seeding and admin seed endpoint; NOT hard-coded in business logic.
 */
export const DEFAULT_TOURNAMENT_TIERS: Array<
  Omit<TournamentTierConfig, "id" | "createdAt" | "updatedAt">
> = [
  {
    name: "Mini",
    code: "mini",
    description: "Entry-level hourly tournament",
    entryFee: 5,
    minPlayers: 8,
    maxPlayers: 100,
    prizePool: 400,
    prizeDistribution: DEFAULT_TIER_PRIZE_DISTRIBUTION,
    gameId: null,
    format: "SINGLE_ELIMINATION",
    enableThirdPlace: true,
    autoStartWhenFull: false,
    isActive: true,
    sortOrder: 1,
  },
  {
    name: "Basic",
    code: "basic",
    description: "Beginner hourly tournament",
    entryFee: 10,
    minPlayers: 16,
    maxPlayers: 200,
    prizePool: 1600,
    prizeDistribution: DEFAULT_TIER_PRIZE_DISTRIBUTION,
    gameId: null,
    format: "SINGLE_ELIMINATION",
    enableThirdPlace: true,
    autoStartWhenFull: false,
    isActive: true,
    sortOrder: 2,
  },
  {
    name: "Standard",
    code: "standard",
    description: "Standard hourly tournament",
    entryFee: 25,
    minPlayers: 32,
    maxPlayers: 500,
    prizePool: 10000,
    prizeDistribution: DEFAULT_TIER_PRIZE_DISTRIBUTION,
    gameId: null,
    format: "SINGLE_ELIMINATION",
    enableThirdPlace: true,
    autoStartWhenFull: false,
    isActive: true,
    sortOrder: 3,
  },
  {
    name: "Premium",
    code: "premium",
    description: "Premium hourly tournament",
    entryFee: 50,
    minPlayers: 32,
    maxPlayers: 500,
    prizePool: 22500,
    prizeDistribution: DEFAULT_TIER_PRIZE_DISTRIBUTION,
    gameId: null,
    format: "SINGLE_ELIMINATION",
    enableThirdPlace: true,
    autoStartWhenFull: false,
    isActive: true,
    sortOrder: 4,
  },
  {
    name: "Pro",
    code: "pro",
    description: "Professional hourly tournament",
    entryFee: 100,
    minPlayers: 64,
    maxPlayers: 1000,
    prizePool: 90000,
    prizeDistribution: DEFAULT_TIER_PRIZE_DISTRIBUTION,
    gameId: null,
    format: "SINGLE_ELIMINATION",
    enableThirdPlace: true,
    autoStartWhenFull: false,
    isActive: true,
    sortOrder: 5,
  },
];

export type TournamentTierCode = "mini" | "basic" | "standard" | "premium" | "pro";

export interface TierVisualInfo {
  code: TournamentTierCode;
  name: string;
  badgeEmoji: string;
  colorHex: string;
  gradientClass: string;
  badgeBgClass: string;
  borderClass: string;
  textClass: string;
}

export const TOURNAMENT_TIER_VISUALS: Record<string, TierVisualInfo> = {
  mini: {
    code: "mini",
    name: "Mini",
    badgeEmoji: "🟢",
    colorHex: "#10b981",
    gradientClass: "from-emerald-500/20 via-emerald-600/10 to-transparent",
    badgeBgClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    borderClass: "border-emerald-500/40",
    textClass: "text-emerald-400",
  },
  basic: {
    code: "basic",
    name: "Basic",
    badgeEmoji: "🔵",
    colorHex: "#3b82f6",
    gradientClass: "from-blue-500/20 via-blue-600/10 to-transparent",
    badgeBgClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    borderClass: "border-blue-500/40",
    textClass: "text-blue-400",
  },
  standard: {
    code: "standard",
    name: "Standard",
    badgeEmoji: "🟣",
    colorHex: "#a855f7",
    gradientClass: "from-purple-500/20 via-purple-600/10 to-transparent",
    badgeBgClass: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    borderClass: "border-purple-500/40",
    textClass: "text-purple-400",
  },
  premium: {
    code: "premium",
    name: "Premium",
    badgeEmoji: "🟠",
    colorHex: "#f97316",
    gradientClass: "from-orange-500/20 via-orange-600/10 to-transparent",
    badgeBgClass: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    borderClass: "border-orange-500/40",
    textClass: "text-orange-400",
  },
  pro: {
    code: "pro",
    name: "Pro",
    badgeEmoji: "🔴",
    colorHex: "#ef4444",
    gradientClass: "from-red-500/20 via-red-600/10 to-transparent",
    badgeBgClass: "bg-red-500/15 text-red-400 border-red-500/30",
    borderClass: "border-red-500/40",
    textClass: "text-red-400",
  },
};

// ---------------------------------------------------------------------------
// Admin Management & Scheduler Types
// ---------------------------------------------------------------------------

export type GameTierAvailability = Record<string, Record<TournamentTierCode, boolean>>;

export interface SchedulerPreviewSlot {
  scheduledTime: string;
  gameId: string;
  gameName: string;
  tierCode: TournamentTierCode;
  tierName: string;
  entryFee: number;
  prizePool: number;
  maxPlayers: number;
}

export interface TournamentSchedulerInfo {
  isPaused: boolean;
  intervalMinutes: number;
  nextRunAt: string | null;
  activeTiersCount: number;
  enabledGamesCount: number;
}

export interface TournamentFinancialSummary {
  tournamentId: string;
  entryFee: number;
  registeredPlayers: number;
  totalCollected: number;
  configuredPrizePool: number;
  platformShare: number;
  distributedPrize: number;
  pendingSettlementCount: number;
  failedSettlementCount: number;
  status: TournamentStatus;
}

export interface TournamentOperationalExport {
  tournamentId: string;
  title: string;
  gameId: string;
  tier: string;
  status: string;
  startTime: string;
  entryFee: number;
  prizePool: number;
  totalCollected: number;
  totalDistributed: number;
  participantCount: number;
  winnerDisplayName?: string | null;
}

// ---------------------------------------------------------------------------
// Tournament Analytics & Reporting System Types
// ---------------------------------------------------------------------------

export type TournamentAnalyticsTimeFilter =
  | "today"
  | "yesterday"
  | "last7days"
  | "last30days"
  | "thismonth"
  | "custom";

export interface TournamentPrizeDistributionBreakdown {
  firstPrizeDistributed: number;
  secondPrizeDistributed: number;
  thirdPrizeDistributed: number;
  fourthPrizeDistributed: number;
  totalDistributed: number;
}

export interface TournamentRefundAnalyticsSummary {
  refundRequestsCount: number;
  successfulRefundsCount: number;
  pendingRefundsCount: number;
  failedRefundsCount: number;
  totalRefundedCoins: number;
}

export interface TournamentSettlementAnalyticsSummary {
  totalSettlements: number;
  creditedCount: number;
  pendingCount: number;
  failedCount: number;
  partiallySettledCount: number;
  totalPrizePaidOut: number;
}

export interface TournamentAnalyticsOverview {
  totalTournaments: number;
  liveTournaments: number;
  upcomingTournaments: number;
  completedTournaments: number;
  cancelledTournaments: number;
  totalRegistrations: number;
  averageRegistrationsPerTournament: number;
  fillRatePercent: number;
  fullTournamentsCount: number;
  underfilledTournamentsCount: number;
  cancelledDueToMinPlayersCount: number;
  completionRatePercent: number;
  cancellationRatePercent: number;
  totalEntryCollection: number;
  configuredPrizePool: number;
  actualPrizeDistributed: number;
  totalRefunds: number;
  platformOperatingAmount: number;
  prizesBreakdown: TournamentPrizeDistributionBreakdown;
  refundsSummary: TournamentRefundAnalyticsSummary;
  settlementsSummary: TournamentSettlementAnalyticsSummary;
}

export interface GameAnalyticsStat {
  gameId: string;
  gameName: string;
  tournamentsCount: number;
  playersCount: number;
  completedCount: number;
  cancelledCount: number;
  entryCollection: number;
  prizesDistributed: number;
  refunds: number;
  completionRatePercent: number;
  winRatePercent: number;
}

export interface TierAnalyticsStat {
  tierCode: TournamentTierCode;
  tierName: string;
  entryFee: number;
  tournamentsCount: number;
  registrationsCount: number;
  averageRegistrations: number;
  entryFeesCollected: number;
  configuredPrizePool: number;
  prizesDistributed: number;
  refunds: number;
  completionRatePercent: number;
  fillRatePercent: number;
}

export interface HourlyPerformanceStat {
  hour: number;
  hourLabel: string;
  tournamentsCount: number;
  registrationsCount: number;
  completionRatePercent: number;
  isPeakHour: boolean;
  isLowParticipationHour: boolean;
}

export interface PlayerCohortAnalyticsStat {
  activeTournamentPlayers: number;
  newTournamentPlayers: number;
  returningTournamentPlayers: number;
  averageTournamentsPerPlayer: number;
}

export type StuckTournamentState =
  | "BRACKET_GENERATING"
  | "ROUND_READY"
  | "IN_PROGRESS"
  | "SETTLEMENT_PROCESSING";

export interface StuckTournamentItem {
  tournamentId: string;
  title: string;
  gameId: string;
  tierCode: TournamentTierCode;
  currentState: StuckTournamentState;
  currentRound: string;
  timeSpentInStateMinutes: number;
  thresholdMinutes: number;
  lastActivityTime: string;
  status: string;
  reviewStatus: "NEEDS_REVIEW";
  reason: string;
  createdAt: string;
}

export type StuckMatchOperationalStatus = "READY" | "LIVE" | "PROCESSING";

export interface StuckMatchItem {
  matchId: string;
  tournamentId: string;
  tournamentTitle: string;
  gameId: string;
  tierCode: TournamentTierCode;
  roundNumber: number;
  matchNumber: number;
  matchStatus: StuckMatchOperationalStatus;
  playerAId?: string | null;
  playerBId?: string | null;
  playerAName?: string;
  playerBName?: string;
  startedAt: string | null;
  elapsedMinutes: number;
  thresholdMinutes: number;
  reviewStatus: "NEEDS_REVIEW";
  reason: string;
  status: string;
  scheduledAt?: string | null;
}

export type TournamentSchedulerStatus = "RUNNING" | "STOPPED" | "ERROR";

export interface TournamentSchedulerHealthSummary {
  status: TournamentSchedulerStatus;
  isRunning: boolean;
  isPaused: boolean;
  lastSuccessfulRunAt: string | null;
  nextScheduledRunAt: string | null;
  tournamentsCreatedInLastRun: number;
  createdTournamentsToday: number;
  failedJobsToday: number;
  retryCount: number;
  intervalMinutes: number;
  isMissedRunDetected: boolean;
  reviewStatus: "HEALTHY" | "NEEDS_REVIEW";
  reviewReason?: string | null;
  lastExecutionAt: string | null;
  nextScheduledExecutionAt: string | null;
}

export interface TournamentNotificationAnalyticsSummary {
  emailsSent: number;
  emailsFailed: number;
  emailsPending: number;
  inAppNotificationsSent: number;
  pendingNotifications: number;
}

export interface TournamentReviewItem {
  id: string;
  tournamentId: string;
  title: string;
  gameId: string;
  tierCode: TournamentTierCode;
  status: string;
  severity: "HEALTHY" | "ATTENTION" | "CRITICAL";
  elapsedMinutes: number;
  reviewReason: string;
  badgeLabel: string;
  failedMatchCreationCount: number;
  failedSettlementsCount: number;
  failedNotificationsCount: number;
  updatedAt: string;
}

export interface TournamentHealthSummary {
  overallStatus: "HEALTHY" | "ATTENTION" | "CRITICAL";
  healthyTournamentsCount: number;
  attentionTournamentsCount: number;
  criticalTournamentsCount: number;
  stuckTournamentsCount: number;
  stuckMatchesCount: number;
  failedMatchCreationCount: number;
  failedSettlementsCount: number;
  failedNotificationsCount: number;
  schedulerFailuresCount: number;
  stuckTournaments: StuckTournamentItem[];
  stuckMatches: StuckMatchItem[];
  reviewItems: TournamentReviewItem[];
  schedulerHealth: TournamentSchedulerHealthSummary;
  checkedAt: string;
}

export interface TournamentTrendPoint {
  date: string;
  label: string;
  tournamentVolume: number;
  registrations: number;
  completionRate: number;
  entryCollection: number;
  prizeDistribution: number;
}

export interface GameTierMatrixCell {
  gameId: string;
  tierCode: TournamentTierCode;
  tournamentsCount: number;
  registrationsCount: number;
  fillRatePercent: number;
  completedCount: number;
}

export interface PrizeDistributionItem {
  totalConfiguredPool: number;
  totalDistributed: number;
  firstPlaceAmount: number;
  firstPlaceCount: number;
  secondPlaceAmount: number;
  secondPlaceCount: number;
  thirdPlaceAmount: number;
  thirdPlaceCount: number;
  fourthPlaceAmount: number;
  fourthPlaceCount: number;
  pendingSettlementsAmount: number;
  pendingSettlementsCount: number;
  failedSettlementsAmount: number;
  failedSettlementsCount: number;
}

export interface PrizeDistributionByGameItem extends PrizeDistributionItem {
  gameId: string;
  gameName: string;
  tournamentsCount: number;
}

export interface PrizeDistributionByTierItem extends PrizeDistributionItem {
  tierCode: TournamentTierCode;
  tierName: string;
  entryFee: number;
  tournamentsCount: number;
}

export interface PrizeDistributionByDateItem extends PrizeDistributionItem {
  date: string;
  label: string;
  tournamentsCount: number;
}

export interface PrizeDistributionAnalyticsSection {
  summary: PrizeDistributionItem;
  byGame: PrizeDistributionByGameItem[];
  byTier: PrizeDistributionByTierItem[];
  byDate: PrizeDistributionByDateItem[];
}

export interface TournamentRefundAnalyticsItem {
  totalRefundRequests: number;
  successfulRefundsCount: number;
  pendingRefundsCount: number;
  failedRefundsCount: number;
  totalRefundedCoins: number;
}

export interface RefundByGameItem {
  gameId: string;
  gameName: string;
  refundRequestsCount: number;
  successfulRefundsCount: number;
  pendingRefundsCount: number;
  failedRefundsCount: number;
  totalRefundedCoins: number;
}

export interface RefundByTierItem {
  tierCode: TournamentTierCode;
  tierName: string;
  entryFee: number;
  refundRequestsCount: number;
  successfulRefundsCount: number;
  pendingRefundsCount: number;
  failedRefundsCount: number;
  totalRefundedCoins: number;
}

export interface RefundByDateItem {
  date: string;
  label: string;
  refundRequestsCount: number;
  successfulRefundsCount: number;
  pendingRefundsCount: number;
  failedRefundsCount: number;
  totalRefundedCoins: number;
}

export interface TournamentRefundRecordItem {
  id: string;
  tournamentId: string;
  tournamentTitle: string;
  gameId: string;
  tierCode: TournamentTierCode;
  userId: string;
  username: string;
  amount: number;
  status: "SUCCESS" | "PENDING" | "FAILED";
  reason: string;
  createdAt: string;
  processedAt: string | null;
}

export interface RefundAnalyticsSection {
  summary: TournamentRefundAnalyticsItem;
  byGame: RefundByGameItem[];
  byTier: RefundByTierItem[];
  byDate: RefundByDateItem[];
  records: TournamentRefundRecordItem[];
}

export interface TournamentSettlementAnalyticsItem {
  totalSettlements: number;
  creditedSettlements: number;
  pendingSettlements: number;
  failedSettlements: number;
  partiallySettledTournaments: number;
  totalSettledAmount: number;
  totalPendingAmount: number;
  totalFailedAmount: number;
}

export interface SettlementByGameItem {
  gameId: string;
  gameName: string;
  totalSettlements: number;
  creditedSettlements: number;
  pendingSettlements: number;
  failedSettlements: number;
  partiallySettledTournaments: number;
  totalSettledAmount: number;
}

export interface SettlementByTierItem {
  tierCode: TournamentTierCode;
  tierName: string;
  entryFee: number;
  totalSettlements: number;
  creditedSettlements: number;
  pendingSettlements: number;
  failedSettlements: number;
  partiallySettledTournaments: number;
  totalSettledAmount: number;
}

export interface SettlementByDateItem {
  date: string;
  label: string;
  totalSettlements: number;
  creditedSettlements: number;
  pendingSettlements: number;
  failedSettlements: number;
  totalSettledAmount: number;
}

export interface TournamentSettlementRecordItem {
  id: string;
  tournamentId: string;
  tournamentTitle: string;
  gameId: string;
  tierCode: TournamentTierCode;
  userId: string;
  username: string;
  rank: number;
  amount: number;
  status: "PAID" | "PENDING" | "FAILED";
  transactionId: string | null;
  paidAt: string | null;
  error: string | null;
  requiresAdminAttention: boolean;
  createdAt: string;
}

export interface SettlementAnalyticsSection {
  summary: TournamentSettlementAnalyticsItem;
  byGame: SettlementByGameItem[];
  byTier: SettlementByTierItem[];
  byDate: SettlementByDateItem[];
  records: TournamentSettlementRecordItem[];
  failedRecords: TournamentSettlementRecordItem[];
}

export type NotificationChannelType = "EMAIL" | "IN_APP" | "SOCKET";
export type NotificationDeliveryStatus = "SENT" | "PENDING" | "FAILED";

export interface NotificationAnalyticsItem {
  id: string;
  tournamentId: string;
  tournamentTitle: string;
  gameId: string;
  tierCode: TournamentTierCode;
  channel: NotificationChannelType;
  eventType: string;
  recipientMasked: string;
  status: NotificationDeliveryStatus;
  sentAt: string | null;
  createdAt: string;
  errorReason?: string | null;
}

export interface NotificationAnalyticsSummaryItem {
  emailsSent: number;
  emailsFailed: number;
  inAppNotificationsSent: number;
  socketNotificationsSent: number;
  pendingNotifications: number;
  totalNotifications: number;
}

export interface NotificationByGameItem {
  gameId: string;
  gameName: string;
  emailsSent: number;
  emailsFailed: number;
  inAppSent: number;
  socketSent: number;
  pending: number;
  total: number;
}

export interface NotificationByTierItem {
  tierCode: TournamentTierCode;
  tierName: string;
  emailsSent: number;
  emailsFailed: number;
  inAppSent: number;
  socketSent: number;
  pending: number;
  total: number;
}

export interface NotificationByDateItem {
  date: string;
  label: string;
  emailsSent: number;
  emailsFailed: number;
  inAppSent: number;
  socketSent: number;
  pending: number;
  total: number;
}

export interface NotificationAnalyticsSection {
  summary: NotificationAnalyticsSummaryItem;
  byChannel: Record<NotificationChannelType, { sent: number; pending: number; failed: number; total: number }>;
  byGame: NotificationByGameItem[];
  byTier: NotificationByTierItem[];
  byDate: NotificationByDateItem[];
  records: NotificationAnalyticsItem[];
}

export interface PlayerAnalyticsSummary {
  activeTournamentPlayers: number;
  newTournamentPlayers: number;
  returningTournamentPlayers: number;
  averageTournamentsPerPlayer: number;
  totalRegistrations: number;
}

export interface PlayerAnalyticsByGameItem {
  gameId: string;
  gameName: string;
  activePlayers: number;
  newPlayers: number;
  returningPlayers: number;
  totalRegistrations: number;
  averageTournamentsPerPlayer: number;
}

export interface PlayerAnalyticsByTierItem {
  tierCode: TournamentTierCode;
  tierName: string;
  entryFee: number;
  activePlayers: number;
  newPlayers: number;
  returningPlayers: number;
  totalRegistrations: number;
  averageTournamentsPerPlayer: number;
}

export interface PlayerAnalyticsByDateItem {
  date: string;
  label: string;
  activePlayers: number;
  newPlayers: number;
  returningPlayers: number;
  totalRegistrations: number;
  averageTournamentsPerPlayer: number;
}

export interface AnonymizedPlayerItem {
  maskedId: string;
  tournamentsJoined: number;
  gamesPlayedCount: number;
  topRank: number;
  totalPoints: number;
  firstJoinedAt: string;
  lastActiveAt: string;
}

export interface PlayerAnalyticsSection {
  summary: PlayerAnalyticsSummary;
  byGame: PlayerAnalyticsByGameItem[];
  byTier: PlayerAnalyticsByTierItem[];
  byDate: PlayerAnalyticsByDateItem[];
  cohorts: AnonymizedPlayerItem[];
}

export interface TopParticipationGameItem {
  rank: number;
  gameId: string;
  gameName: string;
  tournamentsCount: number;
  totalRegistrations: number;
  fillRatePercent: number;
}

export interface TopParticipationTierItem {
  rank: number;
  tierCode: TournamentTierCode;
  tierName: string;
  entryFee: number;
  tournamentsCount: number;
  totalRegistrations: number;
  fillRatePercent: number;
}

export interface TopParticipationPeriodItem {
  rank: number;
  hour: number;
  hourLabel: string;
  tournamentsCount: number;
  totalRegistrations: number;
  isPeakHour: boolean;
}

export interface TopParticipationSummary {
  topGame: TopParticipationGameItem | null;
  topTier: TopParticipationTierItem | null;
  topPeriod: TopParticipationPeriodItem | null;
  totalRegistrations: number;
}

export interface TopParticipationSection {
  summary: TopParticipationSummary;
  games: TopParticipationGameItem[];
  tiers: TopParticipationTierItem[];
  periods: TopParticipationPeriodItem[];
}

export interface PlayerPerformanceSummary {
  tournamentWins: number;
  top4Finishes: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  winRatePercent: number;
}

export interface PlayerPerformanceByGameItem {
  gameId: string;
  gameName: string;
  tournamentsCount: number;
  tournamentWins: number;
  top4Finishes: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  winRatePercent: number;
}

export interface PlayerPerformanceByTierItem {
  tierCode: TournamentTierCode;
  tierName: string;
  entryFee: number;
  tournamentsCount: number;
  tournamentWins: number;
  top4Finishes: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  winRatePercent: number;
}

export interface PlayerPerformanceByDateItem {
  date: string;
  label: string;
  tournamentWins: number;
  top4Finishes: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  winRatePercent: number;
}

export interface AnonymizedPerformerItem {
  maskedId: string;
  tournamentsCount: number;
  tournamentWins: number;
  top4Finishes: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  winRatePercent: number;
  totalPoints: number;
  favoriteGame: string;
  lastActiveAt: string;
}

export interface PlayerPerformanceSection {
  summary: PlayerPerformanceSummary;
  byGame: PlayerPerformanceByGameItem[];
  byTier: PlayerPerformanceByTierItem[];
  byDate: PlayerPerformanceByDateItem[];
  topPerformers: AnonymizedPerformerItem[];
}

export interface WinRateSummary {
  overallWinRate: number;
  totalCompletedMatches: number;
  totalMatchesWon: number;
  totalMatchesLost: number;
  totalMatchesDrawn: number;
  decisiveMatches: number;
}

export interface WinRateByGameItem {
  gameId: string;
  gameName: string;
  tournamentsCount: number;
  completedMatches: number;
  matchesWon: number;
  matchesLost: number;
  matchesDrawn: number;
  winRatePercent: number;
}

export interface WinRateByTierItem {
  tierCode: TournamentTierCode;
  tierName: string;
  entryFee: number;
  tournamentsCount: number;
  completedMatches: number;
  matchesWon: number;
  matchesLost: number;
  matchesDrawn: number;
  winRatePercent: number;
}

export interface WinRateByDateItem {
  date: string;
  label: string;
  completedMatches: number;
  matchesWon: number;
  matchesLost: number;
  matchesDrawn: number;
  winRatePercent: number;
}

export interface WinRateAnalyticsSection {
  summary: WinRateSummary;
  byGame: WinRateByGameItem[];
  byTier: WinRateByTierItem[];
  byDate: WinRateByDateItem[];
}

export interface GameSpecificPerformanceItem {
  gameId: string;
  gameName: string;
  icon: string;
  category: string;
  mode: string;
  scoreUnit: string;
  resultFormat: string;
  tournamentsCount: number;
  completedMatches: number;
  matchesWon: number;
  matchesLost: number;
  matchesDrawn: number;
  winRatePercent: number;
  totalPointsScored: number;
  avgScorePerMatch: number;
  highestMatchScore: number;
}

export interface GameSpecificPerformanceSection {
  games: GameSpecificPerformanceItem[];
}

export interface TierTrendDataPoint {
  date: string;
  label: string;
  tierCode: TournamentTierCode;
  tournamentsCount: number;
  registrationsCount: number;
  averageRegistrations: number;
  fillRatePercent: number;
  completionRatePercent: number;
}

export interface TierPerformanceTrendsSection {
  tiers: TierAnalyticsStat[];
  timeline: TierTrendDataPoint[];
}

export interface TournamentAnalyticsResponse {
  timeFilter: TournamentAnalyticsTimeFilter;
  startDate: string;
  endDate: string;
  overview: TournamentAnalyticsOverview;
  prizeDistribution: PrizeDistributionAnalyticsSection;
  refundAnalytics: RefundAnalyticsSection;
  settlementAnalytics: SettlementAnalyticsSection;
  notificationAnalytics: NotificationAnalyticsSection;
  playerAnalytics: PlayerAnalyticsSection;
  topParticipation: TopParticipationSection;
  playerPerformance: PlayerPerformanceSection;
  winRateAnalytics: WinRateAnalyticsSection;
  gameSpecificPerformance: GameSpecificPerformanceSection;
  tierPerformanceTrends: TierPerformanceTrendsSection;
  games: GameAnalyticsStat[];
  tiers: TierAnalyticsStat[];
  hourlyPerformance: HourlyPerformanceStat[];
  playerCohort: PlayerCohortAnalyticsStat[];
  notifications: TournamentNotificationAnalyticsSummary;
  health: TournamentHealthSummary;
  trends: TournamentTrendPoint[];
  gameTierMatrix: Record<string, Record<TournamentTierCode, { count: number; fillRate: number }>>;
}

export type TournamentReportType =
  | "TOURNAMENT"
  | "FINANCIAL"
  | "PLAYER_PARTICIPATION"
  | "SETTLEMENT"
  | "NOTIFICATION";

export interface TournamentReportRequest {
  reportType: TournamentReportType;
  timeFilter: TournamentAnalyticsTimeFilter;
  fromDate?: string;
  toDate?: string;
  gameId?: string;
  tier?: string;
  status?: string;
}

export interface TournamentReportResult {
  reportType: TournamentReportType;
  generatedAt: string;
  adminId: string;
  filters: Record<string, unknown>;
  totalRecords: number;
  headers: string[];
  rows: Array<Record<string, any>>;
}


