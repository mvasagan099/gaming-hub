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
  prizePool: number;
  grossPool: number;
  prizeDistribution: PrizeDistributionEntry[];
  calculatedPrizes: { rank: number; amount: number }[];
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
  | "FAILED";

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
  prizePool: number;
  grossPool: number;
  totalPrizesCount: number;
  completedCount: number;
  pendingCount: number;
  failedCount: number;
  totalPaidAmount: number;
  totalUnpaidAmount: number;
  settledAt?: string | null;
  settlements: TournamentSettlementRecord[];
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

export interface PlayerTournamentCareerStats {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  tournamentWins: number;
  tournamentAppearances: number;
  finalsReached: number;
  topThreeFinishes: number;
  winRate: number;
  totalMatchesPlayed: number;
  totalMatchesWon: number;
  totalPrizesWon: number;
  bestRank: number | null;
  gameBreakdown: {
    gameId: string;
    tournamentWins: number;
    tournamentAppearances: number;
    winRate: number;
    totalPrizesWon: number;
  }[];
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

