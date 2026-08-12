/**
 * Canonical game registry shared by the web client, API and socket server.
 * Every game that supports online play is described here exactly once.
 */

export const GAME_IDS = [
  "snake-ladder",
  "ludo",
  "chess",
  "carrom",
  "fruit-ninja",
  "bubble-shooter",
  "table-tennis",
  "snake-vs-worms",
  "cricket",
] as const;

export type GameId = (typeof GAME_IDS)[number];

export type GameMode = "turn-based" | "realtime" | "score-battle" | "score-race";

export interface GameDefinition {
  id: GameId;
  name: string;
  slug: GameId;
  icon: string;
  category: "Board" | "Arcade" | "Sports";
  mode: GameMode;
  /** Inclusive seat range supported online. */
  minPlayers: number;
  maxPlayers: number;
  /** Default stake tiers offered by the client UI. */
  defaultStake: number;
  /** Whether the server owns authoritative game state. */
  serverAuthoritative: boolean;
  online: boolean;
  featured: boolean;
  description: string;
}

export const GAME_DEFINITIONS: readonly GameDefinition[] = [
  {
    id: "snake-ladder",
    name: "Snake & Ladder",
    slug: "snake-ladder",
    icon: "🐍",
    category: "Board",
    mode: "turn-based",
    minPlayers: 2,
    maxPlayers: 2,
    defaultStake: 100,
    serverAuthoritative: true,
    online: true,
    featured: true,
    description: "Classic board game",
  },
  {
    id: "ludo",
    name: "Ludo",
    slug: "ludo",
    icon: "🎲",
    category: "Board",
    mode: "turn-based",
    minPlayers: 2,
    maxPlayers: 2,
    defaultStake: 100,
    serverAuthoritative: true,
    online: true,
    featured: true,
    description: "Play with friends",
  },
  {
    id: "chess",
    name: "Chess",
    slug: "chess",
    icon: "♟️",
    category: "Board",
    mode: "turn-based",
    minPlayers: 2,
    maxPlayers: 2,
    defaultStake: 100,
    serverAuthoritative: true,
    online: true,
    featured: true,
    description: "Challenge your strategy",
  },
  {
    id: "carrom",
    name: "Carrom",
    slug: "carrom",
    icon: "🎯",
    category: "Board",
    mode: "turn-based",
    minPlayers: 2,
    maxPlayers: 4,
    defaultStake: 100,
    serverAuthoritative: true,
    online: true,
    featured: false,
    description: "Pocket the coins",
  },
  {
    id: "fruit-ninja",
    name: "Fruit Ninja",
    slug: "fruit-ninja",
    icon: "🍉",
    category: "Arcade",
    mode: "score-battle",
    minPlayers: 2,
    maxPlayers: 2,
    defaultStake: 100,
    serverAuthoritative: true,
    online: true,
    featured: true,
    description: "Slice the fruits",
  },
  {
    id: "bubble-shooter",
    name: "Bubble Shooter",
    slug: "bubble-shooter",
    icon: "🫧",
    category: "Arcade",
    mode: "score-race",
    minPlayers: 2,
    maxPlayers: 8,
    defaultStake: 100,
    serverAuthoritative: true,
    online: true,
    featured: false,
    description: "Match and pop bubbles",
  },
  {
    id: "table-tennis",
    name: "Table Tennis",
    slug: "table-tennis",
    icon: "🏓",
    category: "Sports",
    mode: "realtime",
    minPlayers: 2,
    maxPlayers: 2,
    defaultStake: 100,
    serverAuthoritative: true,
    online: true,
    featured: false,
    description: "Fast-paced rally",
  },
  {
    id: "snake-vs-worms",
    name: "Snake vs Worms",
    slug: "snake-vs-worms",
    icon: "🐛",
    category: "Arcade",
    mode: "realtime",
    minPlayers: 2,
    maxPlayers: 8,
    defaultStake: 100,
    serverAuthoritative: true,
    online: true,
    featured: false,
    description: "Grow the longest snake",
  },
  {
    id: "cricket",
    name: "Cricket",
    slug: "cricket",
    icon: "🏏",
    category: "Sports",
    mode: "turn-based",
    minPlayers: 2,
    maxPlayers: 2,
    defaultStake: 100,
    serverAuthoritative: true,
    online: true,
    featured: true,
    description: "Quick cricket matches",
  },
] as const;

export const GAME_BY_ID: ReadonlyMap<GameId, GameDefinition> = new Map(
  GAME_DEFINITIONS.map((g) => [g.id, g]),
);

export function isGameId(value: string): value is GameId {
  return GAME_IDS.includes(value as GameId);
}

export function getGameDefinition(id: string): GameDefinition {
  const def = GAME_BY_ID.get(id as GameId);
  if (!def) throw new Error(`Unknown game id: ${id}`);
  return def;
}
