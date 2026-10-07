import type { JsonObject } from "@gaming-hub/shared";

// ── Full-size Snooker Table Dimensions (Canonical 960 x 480) ──────────────────
export const SNOOKER_TABLE_WIDTH = 960;
export const SNOOKER_TABLE_HEIGHT = 480;
export const SNOOKER_BALL_RADIUS = 8.5;

// Snooker pocket geometries with tight, rounded corner jaws
export const SNOOKER_CORNER_POCKET_RADIUS = 20;
export const SNOOKER_SIDE_POCKET_RADIUS = 22;

export const SNOOKER_POCKETS = [
  { id: "tl", x: 26, y: 26, radius: SNOOKER_CORNER_POCKET_RADIUS },
  { id: "tm", x: SNOOKER_TABLE_WIDTH / 2, y: 18, radius: SNOOKER_SIDE_POCKET_RADIUS },
  { id: "tr", x: SNOOKER_TABLE_WIDTH - 26, y: 26, radius: SNOOKER_CORNER_POCKET_RADIUS },
  { id: "bl", x: 26, y: SNOOKER_TABLE_HEIGHT - 26, radius: SNOOKER_CORNER_POCKET_RADIUS },
  { id: "bm", x: SNOOKER_TABLE_WIDTH / 2, y: SNOOKER_TABLE_HEIGHT - 18, radius: SNOOKER_SIDE_POCKET_RADIUS },
  { id: "br", x: SNOOKER_TABLE_WIDTH - 26, y: SNOOKER_TABLE_HEIGHT - 26, radius: SNOOKER_CORNER_POCKET_RADIUS },
];

export const SNOOKER_CUSHION_MARGIN = 30;
export const SNOOKER_PLAYABLE_LEFT = SNOOKER_CUSHION_MARGIN + SNOOKER_BALL_RADIUS;
export const SNOOKER_PLAYABLE_RIGHT = SNOOKER_TABLE_WIDTH - SNOOKER_CUSHION_MARGIN - SNOOKER_BALL_RADIUS;
export const SNOOKER_PLAYABLE_TOP = SNOOKER_CUSHION_MARGIN + SNOOKER_BALL_RADIUS;
export const SNOOKER_PLAYABLE_BOTTOM = SNOOKER_TABLE_HEIGHT - SNOOKER_CUSHION_MARGIN - SNOOKER_BALL_RADIUS;

// Baulk line and "D" Dimensions
export const SNOOKER_BAULK_X = 192; // 1/5th table length
export const SNOOKER_D_RADIUS = 75; // Semicircle in baulk
export const SNOOKER_TABLE_CENTER_Y = SNOOKER_TABLE_HEIGHT / 2; // 240

// Standard Snooker Spot Coordinates
export const SNOOKER_SPOTS = {
  brown: { x: SNOOKER_BAULK_X, y: SNOOKER_TABLE_CENTER_Y },
  yellow: { x: SNOOKER_BAULK_X, y: SNOOKER_TABLE_CENTER_Y + SNOOKER_D_RADIUS }, // 315
  green: { x: SNOOKER_BAULK_X, y: SNOOKER_TABLE_CENTER_Y - SNOOKER_D_RADIUS }, // 165
  blue: { x: SNOOKER_TABLE_WIDTH / 2, y: SNOOKER_TABLE_CENTER_Y }, // (480, 240)
  pink: { x: 680, y: SNOOKER_TABLE_CENTER_Y }, // Pyramid spot
  black: { x: 840, y: SNOOKER_TABLE_CENTER_Y }, // Top spot (1/11th from top rail)
} as const;

// Standard Snooker Ball Point Values
export const SNOOKER_BALL_VALUES: Record<string, number> = {
  red: 1,
  yellow: 2,
  green: 3,
  brown: 4,
  blue: 5,
  pink: 6,
  black: 7,
  cue: 0,
};

export type SnookerBallType =
  | "cue"
  | "red"
  | "yellow"
  | "green"
  | "brown"
  | "blue"
  | "pink"
  | "black";

export type SnookerTarget =
  | "RED"
  | "COLOR"
  | "YELLOW"
  | "GREEN"
  | "BROWN"
  | "BLUE"
  | "PINK"
  | "BLACK"
  | "FREE_BALL";

export type SnookerFrameStatus =
  | "WAITING"
  | "BREAK"
  | "RED_PHASE"
  | "COLOR_PHASE"
  | "FREE_BALL"
  | "COLOR_CLEARANCE"
  | "FRAME_END"
  | "MATCH_END";

export type SnookerMatchStatus = "IN_PROGRESS" | "FINISHED";

export const COLOR_CLEARANCE_ORDER: SnookerBallType[] = [
  "yellow",
  "green",
  "brown",
  "blue",
  "pink",
  "black",
];

export interface SnookerBall extends JsonObject {
  id: string;
  type: SnookerBallType;
  color: string;
  points: number;
  homeSpot: { x: number; y: number } | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spinX: number;
  spinY: number;
  pocketed: boolean;
  pocketIndex: number | null;
  pocketedAtTurn: number | null;
}

export interface SnookerPlayer extends JsonObject {
  seat: number;
  userId: string;
  score: number;
  framesWon: number;
  currentBreak: number;
  highestBreak: number;
  fouls: number;
}

export interface SnookerPieceKeyframe extends JsonObject {
  id: string;
  x: number;
  y: number;
  pocketed: boolean;
  pocketIndex: number | null;
}

export interface SnookerTrajectoryKeyframe extends JsonObject {
  frame: number;
  pieces: SnookerPieceKeyframe[];
}

export interface SnookerFrameHistoryItem extends JsonObject {
  frameNumber: number;
  player1Score: number;
  player2Score: number;
  winnerSeat: number | null;
  highestBreak: number;
  durationSeconds: number;
  completedAt: string;
}

export interface SnookerShotRecord extends JsonObject {
  shotId: string;
  shooterSeat: number;
  angle: number;
  power: number;
  pointsEarned: number;
  foulReason: string | null;
  foulPenalty: number;
}

export type SnookerAction =
  | {
      type: "strike";
      shotId?: string;
      expectedStateVersion?: number;
      angle: number;
      power: number;
      spinX?: number;
      spinY?: number;
    }
  | { type: "place-cue-ball"; x: number; y: number; expectedStateVersion?: number }
  | { type: "nominate-color"; color: SnookerBallType; expectedStateVersion?: number }
  | { type: "aim"; angle: number; power?: number; expectedStateVersion?: number }
  | { type: "next-frame"; expectedStateVersion?: number }
  | { type: "concede"; expectedStateVersion?: number }
  | { type: "resign"; expectedStateVersion?: number }
  | { type: "timeout"; expectedStateVersion?: number };

export interface SnookerState extends JsonObject {
  gameId: "snooker";
  matchId: string;
  frameNumber: number;
  totalFrames: number;
  currentPlayer: number;
  currentSeat: number;
  currentTurnPlayerId: string;
  frameStatus: SnookerFrameStatus;
  matchStatus: SnookerMatchStatus;

  player1Score: number;
  player2Score: number;
  player1Break: number;
  player2Break: number;
  player1FramesWon: number;
  player2FramesWon: number;
  player1HighestBreak: number;
  player2HighestBreak: number;

  redsRemaining: number;
  targetBall: SnookerTarget;
  freeBallAvailable: boolean;
  freeBallTarget: SnookerTarget | null;
  isRespottedBlack: boolean;
  isColorAfterFinalRed: boolean;
  nominatedBall: SnookerBallType | null;

  balls: SnookerBall[];
  players: SnookerPlayer[];
  lastShot: SnookerShotRecord | null;
  lastFoul: string | null;
  foulPoints: number;

  cueBallInHand: boolean;
  inBaulkOnly: boolean;

  frameHistory: SnookerFrameHistoryItem[];
  stateVersion: number;
  lastProcessedShotId: string | null;

  finished: boolean;
  winnerSeats: number[];
  winnerIds: string[];
  frameWinnerSeats: number[];

  turnNumber: number;
  shotNumber: number;
  lastActionAtMs: number;
  turnStartedAtMs: number;
  keyframes: SnookerTrajectoryKeyframe[];
  shotPlaybackEndsAtMs: number;
  serverTimestamp: number;
  turnDeadlineMs: number | null;
  turnDurationMs: number;
  paused: boolean;
  pausedAtMs: number | null;
}
