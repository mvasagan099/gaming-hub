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

export function calculatePrizes(
  grossPool: number,
  distribution: PrizeDistributionEntry[],
): { rank: number; amount: number }[] {
  return distribution.map((d) => ({
    rank: d.rank,
    amount: Math.floor((grossPool * d.percentage) / 100),
  }));
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
