// Main index file for the multiplayer package

// Core Framework
export { MultiplayerFramework } from "./framework";
export type { MultiplayerFrameworkConfig } from "./framework";

// Managers
export { RoomManager } from "./managers/RoomManager";
export { MatchManager } from "./managers/MatchManager";
export { PlayerManager } from "./managers/PlayerManager";
export { SpectatorManager } from "./managers/SpectatorManager";
export { ReplayManager } from "./managers/ReplayManager";
export { TimerManager } from "./managers/TimerManager";
export { SyncManager } from "./managers/SyncManager";
export { AntiCheatManager } from "./managers/AntiCheatManager";
export { MatchmakingManager } from "./managers/MatchmakingManager";

// Phase 11 gameplay framework
export {
  GameStateManager,
  TurnManager,
  ActionValidator,
  EventDispatcher,
  WinnerCalculator,
  StatisticsCollector,
  DisconnectHandler,
  ReconnectHandler,
  GAME_PLAY_CONFIGS,
  getGamePlayConfig,
  hasCompleteGameConfigs,
} from "./gameplay";
export type {
  GamePlayConfig,
  PlayerOutcome,
  PlayerMatchResult,
  MatchResult,
  PlayerMatchStats,
} from "./gameplay";

// Types
export * from "./types";

// Utils
export { EventEmitter } from "./utils/EventEmitter";
export { StateValidator } from "./utils/StateValidator";
export { PacketSequencer } from "./utils/PacketSequencer";
export { LatencyCompensator } from "./utils/LatencyCompensator";
