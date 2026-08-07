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

// Types
export * from "./types";

// Client
export { MultiplayerClient } from "./client/MultiplayerClient";
export type {
  MultiplayerClientConfig,
  ConnectionState,
  GameStateListener,
  RoomUpdateListener,
  GameOverListener,
} from "./client/MultiplayerClient";

// Utils
export { EventEmitter } from "./utils/EventEmitter";
export { StateValidator } from "./utils/StateValidator";
export { PacketSequencer } from "./utils/PacketSequencer";
export { LatencyCompensator } from "./utils/LatencyCompensator";
