import { z } from "zod";
import type { GameId } from "./games";

export const PRIZE_MODES = [
  "WINNER_TAKES_POT",
  "WINNER_PERCENTAGE",
  "FIXED_PRIZE",
  "DRAW_REFUND",
] as const;
export type PrizeMode = (typeof PRIZE_MODES)[number];

export const DRAW_POLICIES = [
  "REFUND_ENTRY",
  "SPLIT_POT",
  "NO_PRIZE",
] as const;
export type DrawPolicy = (typeof DRAW_POLICIES)[number];

export const MAX_MATCH_DURATION_SECONDS = 600; // 10 minutes maximum global safety limit
export const MIN_MATCH_DURATION_SECONDS = 30;

export const TIMEOUT_RESOLUTIONS = [
  "CURRENT_POSITION",
  "CURRENT_PROGRESS",
  "CONFIGURED_CHESS_RESOLUTION",
  "CURRENT_SCORE",
  "CURRENT_SCORE_PROGRESS",
  "CURRENT_MATCH_SCORE",
  "CURRENT_RUNS",
  "CURRENT_POINTS",
  "CURRENT_FRAME_SCORE",
  "GAME_SPECIFIC",
  "DRAW",
] as const;
export type TimeoutResolution = (typeof TIMEOUT_RESOLUTIONS)[number];

export const gameConfigSchema = z.object({
  gameId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
  onlineEnabled: z.boolean().default(true),
  minPlayers: z.number().int().min(1).max(10).default(2),
  maxPlayers: z.number().int().min(1).max(10).default(2),
  entryFees: z.array(z.number().int().min(0).max(1_000_000)).min(1).default([50, 100, 500, 1000]),
  defaultEntryFee: z.number().int().min(0).max(1_000_000).default(100),
  minEntryFee: z.number().int().min(0).max(1_000_000).optional(),
  maxEntryFee: z.number().int().min(0).max(1_000_000).optional(),
  reconnectWindowSeconds: z.number().int().min(5).max(300).default(30),
  turnTimerSeconds: z.number().int().min(0).max(600).default(30),
  matchDurationSeconds: z.number().int().min(30).max(MAX_MATCH_DURATION_SECONDS).default(MAX_MATCH_DURATION_SECONDS),
  timeoutResolution: z.enum(TIMEOUT_RESOLUTIONS).default("GAME_SPECIFIC"),
  allowDraw: z.boolean().default(true),
  prizeMode: z.enum(PRIZE_MODES).default("WINNER_PERCENTAGE"),
  winnerPercentage: z.number().min(0).max(100).default(90),
  fixedPrizeAmount: z.number().int().min(0).optional(),
  drawPolicy: z.enum(DRAW_POLICIES).default("REFUND_ENTRY"),
  maxConcurrentMatches: z.number().int().min(1).max(100_000).default(1000),
  configVersion: z.number().int().min(1).default(1),
  gameSpecificSettings: z.record(z.string(), z.unknown()).default({}),
  updatedAt: z.string().optional(),
  updatedBy: z.string().optional(),
}).refine((data) => data.maxPlayers >= data.minPlayers, {
  message: "maxPlayers must be greater than or equal to minPlayers",
  path: ["maxPlayers"],
}).refine((data) => data.entryFees.includes(data.defaultEntryFee), {
  message: "defaultEntryFee must be one of the configured entryFees",
  path: ["defaultEntryFee"],
});

export type GameConfig = z.infer<typeof gameConfigSchema>;

export const globalMatchSettingsSchema = z.object({
  maxMatchDurationSeconds: z.number().int().min(30).max(MAX_MATCH_DURATION_SECONDS).default(MAX_MATCH_DURATION_SECONDS),
  warningTimesSeconds: z.array(z.number().int().min(1).max(MAX_MATCH_DURATION_SECONDS)).default([300, 120, 60, 30, 10]),
  defaultTurnTimeoutSeconds: z.number().int().min(5).max(120).default(30),
  version: z.number().int().min(1).default(1),
  updatedAt: z.string().optional(),
  updatedBy: z.string().optional(),
});
export type GlobalMatchSettingsConfig = z.infer<typeof globalMatchSettingsSchema>;

export const DEFAULT_GLOBAL_MATCH_SETTINGS: GlobalMatchSettingsConfig = {
  maxMatchDurationSeconds: 600,
  warningTimesSeconds: [300, 120, 60, 30, 10],
  defaultTurnTimeoutSeconds: 30,
  version: 1,
};

export interface MatchConfigSnapshot {
  gameId: GameId;
  name: string;
  entryFee: number;
  minPlayers: number;
  maxPlayers: number;
  turnTimerSeconds: number;
  reconnectWindowSeconds: number;
  matchDurationSeconds: number;
  timeoutResolution: TimeoutResolution;
  allowDraw: boolean;
  prizeMode: PrizeMode;
  winnerPercentage: number;
  fixedPrizeAmount?: number;
  drawPolicy: DrawPolicy;
  configVersion: number;
  gameSpecificSettings: Record<string, unknown>;
  snapshotAt: number;
}

export interface PublicGameInfo {
  gameId: GameId;
  name: string;
  category: "Board" | "Arcade" | "Sports";
  icon: string;
  enabled: boolean;
  onlineEnabled: boolean;
  minPlayers: number;
  maxPlayers: number;
  entryFees: number[];
  defaultEntryFee: number;
  turnTimerSeconds: number;
  reconnectWindowSeconds: number;
  matchDurationSeconds: number;
  prizeMode: PrizeMode;
  winnerPercentage: number;
  timeoutResolution?: TimeoutResolution;
  allowDraw?: boolean;
}

export const DEFAULT_GAME_CONFIGS: Record<GameId, GameConfig> = {
  chess: {
    gameId: "chess",
    name: "Chess",
    enabled: true,
    onlineEnabled: true,
    minPlayers: 2,
    maxPlayers: 2,
    entryFees: [50, 100, 500, 1000],
    defaultEntryFee: 100,
    reconnectWindowSeconds: 30,
    turnTimerSeconds: 60,
    matchDurationSeconds: 600,
    timeoutResolution: "CONFIGURED_CHESS_RESOLUTION",
    allowDraw: true,
    prizeMode: "WINNER_PERCENTAGE",
    winnerPercentage: 90,
    drawPolicy: "REFUND_ENTRY",
    maxConcurrentMatches: 1000,
    configVersion: 1,
    gameSpecificSettings: {
      timeControl: "rapid",
      incrementSeconds: 0,
      drawOfferAllowed: true,
      resignationAllowed: true,
    },
  },
  carrom: {
    gameId: "carrom",
    name: "Carrom",
    enabled: true,
    onlineEnabled: true,
    minPlayers: 2,
    maxPlayers: 4,
    entryFees: [50, 100, 500, 1000],
    defaultEntryFee: 100,
    reconnectWindowSeconds: 30,
    turnTimerSeconds: 25,
    matchDurationSeconds: 600,
    timeoutResolution: "CURRENT_POINTS",
    allowDraw: true,
    prizeMode: "WINNER_PERCENTAGE",
    winnerPercentage: 90,
    drawPolicy: "REFUND_ENTRY",
    maxConcurrentMatches: 1000,
    configVersion: 1,
    gameSpecificSettings: {
      queenRules: "standard",
      foulPenalty: 1,
      pocketMultiplier: 1,
    },
  },
  ludo: {
    gameId: "ludo",
    name: "Ludo",
    enabled: true,
    onlineEnabled: true,
    minPlayers: 2,
    maxPlayers: 4,
    entryFees: [50, 100, 500, 1000],
    defaultEntryFee: 100,
    reconnectWindowSeconds: 30,
    turnTimerSeconds: 30,
    matchDurationSeconds: 600,
    timeoutResolution: "CURRENT_PROGRESS",
    allowDraw: true,
    prizeMode: "WINNER_PERCENTAGE",
    winnerPercentage: 90,
    drawPolicy: "REFUND_ENTRY",
    maxConcurrentMatches: 1000,
    configVersion: 1,
    gameSpecificSettings: {
      diceRules: "single-six-entry",
      safeZones: true,
      autoRollAllowed: true,
    },
  },
  "snake-ladder": {
    gameId: "snake-ladder",
    name: "Snake & Ladder",
    enabled: true,
    onlineEnabled: true,
    minPlayers: 2,
    maxPlayers: 2,
    entryFees: [50, 100, 500, 1000],
    defaultEntryFee: 100,
    reconnectWindowSeconds: 30,
    turnTimerSeconds: 25,
    matchDurationSeconds: 600,
    timeoutResolution: "CURRENT_POSITION",
    allowDraw: true,
    prizeMode: "WINNER_PERCENTAGE",
    winnerPercentage: 90,
    drawPolicy: "REFUND_ENTRY",
    maxConcurrentMatches: 1000,
    configVersion: 1,
    gameSpecificSettings: {
      boardRules: "standard-100",
      exactLastRoll: true,
    },
  },
  "table-tennis": {
    gameId: "table-tennis",
    name: "Table Tennis",
    enabled: true,
    onlineEnabled: true,
    minPlayers: 2,
    maxPlayers: 2,
    entryFees: [50, 100, 500, 1000],
    defaultEntryFee: 100,
    reconnectWindowSeconds: 30,
    turnTimerSeconds: 0,
    matchDurationSeconds: 600,
    timeoutResolution: "CURRENT_MATCH_SCORE",
    allowDraw: true,
    prizeMode: "WINNER_PERCENTAGE",
    winnerPercentage: 90,
    drawPolicy: "REFUND_ENTRY",
    maxConcurrentMatches: 1000,
    configVersion: 1,
    gameSpecificSettings: {
      winningScore: 7,
      matchTimer: 180,
      paddleSpeed: 1.0,
    },
  },
  cricket: {
    gameId: "cricket",
    name: "Cricket",
    enabled: true,
    onlineEnabled: true,
    minPlayers: 2,
    maxPlayers: 2,
    entryFees: [50, 100, 500, 1000],
    defaultEntryFee: 100,
    reconnectWindowSeconds: 30,
    turnTimerSeconds: 20,
    matchDurationSeconds: 600,
    timeoutResolution: "CURRENT_RUNS",
    allowDraw: true,
    prizeMode: "WINNER_PERCENTAGE",
    winnerPercentage: 90,
    drawPolicy: "REFUND_ENTRY",
    maxConcurrentMatches: 1000,
    configVersion: 1,
    gameSpecificSettings: {
      innings: 2,
      overs: 2,
      ballTimeout: 10,
    },
  },
  "fruit-ninja": {
    gameId: "fruit-ninja",
    name: "Fruit Ninja",
    enabled: true,
    onlineEnabled: true,
    minPlayers: 2,
    maxPlayers: 2,
    entryFees: [50, 100, 500, 1000],
    defaultEntryFee: 100,
    reconnectWindowSeconds: 30,
    turnTimerSeconds: 0,
    matchDurationSeconds: 600,
    timeoutResolution: "CURRENT_SCORE",
    allowDraw: true,
    prizeMode: "WINNER_PERCENTAGE",
    winnerPercentage: 90,
    drawPolicy: "REFUND_ENTRY",
    maxConcurrentMatches: 1000,
    configVersion: 1,
    gameSpecificSettings: {
      matchDuration: 60,
      lives: 3,
      bombPenalty: 10,
    },
  },
  "snake-vs-worms": {
    gameId: "snake-vs-worms",
    name: "Snake vs Worms",
    enabled: true,
    onlineEnabled: true,
    minPlayers: 2,
    maxPlayers: 2,
    entryFees: [50, 100, 500, 1000],
    defaultEntryFee: 100,
    reconnectWindowSeconds: 30,
    turnTimerSeconds: 0,
    matchDurationSeconds: 600,
    timeoutResolution: "CURRENT_SCORE",
    allowDraw: true,
    prizeMode: "WINNER_PERCENTAGE",
    winnerPercentage: 90,
    drawPolicy: "REFUND_ENTRY",
    maxConcurrentMatches: 1000,
    configVersion: 1,
    gameSpecificSettings: {
      speed: 1.0,
      collisionRules: "standard",
    },
  },
  "bubble-shooter": {
    gameId: "bubble-shooter",
    name: "Bubble Shooter",
    enabled: true,
    onlineEnabled: true,
    minPlayers: 2,
    maxPlayers: 8,
    entryFees: [50, 100, 500, 1000],
    defaultEntryFee: 100,
    reconnectWindowSeconds: 30,
    turnTimerSeconds: 15,
    matchDurationSeconds: 600,
    timeoutResolution: "CURRENT_SCORE_PROGRESS",
    allowDraw: true,
    prizeMode: "WINNER_PERCENTAGE",
    winnerPercentage: 90,
    drawPolicy: "REFUND_ENTRY",
    maxConcurrentMatches: 1000,
    configVersion: 1,
    gameSpecificSettings: {
      turnTimer: 15,
      scoreRules: "color-match",
    },
  },
  snooker: {
    gameId: "snooker",
    name: "Snooker",
    enabled: true,
    onlineEnabled: true,
    minPlayers: 2,
    maxPlayers: 2,
    entryFees: [50, 100, 500, 1000],
    defaultEntryFee: 100,
    reconnectWindowSeconds: 30,
    turnTimerSeconds: 30,
    matchDurationSeconds: 600,
    timeoutResolution: "CURRENT_FRAME_SCORE",
    allowDraw: true,
    prizeMode: "WINNER_PERCENTAGE",
    winnerPercentage: 90,
    drawPolicy: "REFUND_ENTRY",
    maxConcurrentMatches: 1000,
    configVersion: 1,
    gameSpecificSettings: {
      ballCount: 22,
      redCount: 15,
      minFoulPoints: 4,
      respotColors: true,
      freeBallRule: true,
      defaultMatchFormat: "best-of-1",
      supportedFormats: ["best-of-1", "best-of-3", "best-of-5", "best-of-7"],
    },
  },
};
