/**
 * Shared Multiplayer Framework
 * 
 * This is the core framework that provides enterprise-grade multiplayer
 * functionality for all games in the Gaming Hub platform.
 * 
 * Architecture:
 * - Server-authoritative state management
 * - Instant state synchronization
 * - Automatic reconnection with state restoration
 * - Spectator mode support
 * - Replay system
 * - Anti-cheat validation
 * - Comprehensive timer management
 */

import type { Server } from "socket.io";
import { RoomManager } from "./managers/RoomManager";
import { MatchManager } from "./managers/MatchManager";
import { PlayerManager } from "./managers/PlayerManager";
import { SpectatorManager } from "./managers/SpectatorManager";
import { ReplayManager } from "./managers/ReplayManager";
import { TimerManager } from "./managers/TimerManager";
import { SyncManager } from "./managers/SyncManager";
import { AntiCheatManager } from "./managers/AntiCheatManager";
import { MatchmakingManager } from "./managers/MatchmakingManager";
import { GameStateManager } from "./gameplay/GameStateManager";
import { TurnManager } from "./gameplay/TurnManager";
import { ActionValidator } from "./gameplay/ActionValidator";
import { EventDispatcher } from "./gameplay/EventDispatcher";
import { WinnerCalculator } from "./gameplay/WinnerCalculator";
import { StatisticsCollector } from "./gameplay/StatisticsCollector";
import { DisconnectHandler } from "./gameplay/DisconnectHandler";
import { ReconnectHandler } from "./gameplay/ReconnectHandler";

export interface MultiplayerFrameworkConfig {
  /** Socket.IO server instance */
  io: Server;
  
  /** Reconnection grace period in milliseconds (default: 90 seconds) */
  reconnectGracePeriodMs?: number;
  
  /** AFK timeout in milliseconds (default: 60 seconds) */
  afkTimeoutMs?: number;
  
  /** Room expiration time in milliseconds (default: 30 minutes) */
  roomExpirationMs?: number;
  
  /** How long a finished/aborted room lingers for rematch before it is closed (default: 2 minutes) */
  endedRoomLingerMs?: number;
  
  /** Maximum spectators per room (default: 10) */
  maxSpectators?: number;
  
  /** Enable anti-cheat validation (default: true) */
  enableAntiCheat?: boolean;
  
  /** Enable replay recording (default: true) */
  enableReplay?: boolean;
  
  /** Enable detailed logging (default: false) */
  debug?: boolean;
}

/**
 * Main Multiplayer Framework class that coordinates all managers
 * and provides a unified interface for multiplayer functionality.
 */
export class MultiplayerFramework {
  private static instance: MultiplayerFramework | null = null;
  
  readonly io: Server;
  readonly roomManager: RoomManager;
  readonly matchManager: MatchManager;
  readonly playerManager: PlayerManager;
  readonly spectatorManager: SpectatorManager;
  readonly replayManager: ReplayManager;
  readonly timerManager: TimerManager;
  readonly syncManager: SyncManager;
  readonly antiCheatManager: AntiCheatManager;
  readonly matchmakingManager: MatchmakingManager;
  readonly gameStateManager: GameStateManager;
  readonly turnManager: TurnManager;
  readonly actionValidator: ActionValidator;
  readonly eventDispatcher: EventDispatcher;
  readonly winnerCalculator: WinnerCalculator;
  readonly statisticsCollector: StatisticsCollector;
  readonly disconnectHandler: DisconnectHandler;
  readonly reconnectHandler: ReconnectHandler;
  
  readonly config: Required<MultiplayerFrameworkConfig>;
  
  private initialized = false;
  
  private constructor(config: MultiplayerFrameworkConfig) {
    this.io = config.io;
    this.config = {
      io: config.io,
      reconnectGracePeriodMs: config.reconnectGracePeriodMs ?? 90_000,
      afkTimeoutMs: config.afkTimeoutMs ?? 60_000,
      roomExpirationMs: config.roomExpirationMs ?? 30 * 60 * 1000,
      endedRoomLingerMs: config.endedRoomLingerMs ?? 120_000,
      maxSpectators: config.maxSpectators ?? 10,
      enableAntiCheat: config.enableAntiCheat ?? true,
      enableReplay: config.enableReplay ?? true,
      debug: config.debug ?? false,
    };
    
    // Initialize managers (lazy initialization)
    this.roomManager = new RoomManager(this);
    this.matchManager = new MatchManager(this);
    this.playerManager = new PlayerManager(this);
    this.spectatorManager = new SpectatorManager(this);
    this.replayManager = new ReplayManager(this);
    this.timerManager = new TimerManager(this);
    this.syncManager = new SyncManager(this);
    this.antiCheatManager = new AntiCheatManager(this);
    this.matchmakingManager = new MatchmakingManager(this);
    this.gameStateManager = new GameStateManager(this);
    this.turnManager = new TurnManager(this);
    this.actionValidator = new ActionValidator(this);
    this.eventDispatcher = new EventDispatcher(this);
    this.winnerCalculator = new WinnerCalculator(this);
    this.statisticsCollector = new StatisticsCollector(this);
    this.disconnectHandler = new DisconnectHandler(this);
    this.reconnectHandler = new ReconnectHandler(this);
  }
  
  /**
   * Get or create the singleton instance of the MultiplayerFramework.
   * This ensures only one framework instance exists per application.
   */
  static getInstance(config: MultiplayerFrameworkConfig): MultiplayerFramework {
    if (!MultiplayerFramework.instance) {
      MultiplayerFramework.instance = new MultiplayerFramework(config);
    }
    return MultiplayerFramework.instance;
  }
  
  /**
   * Reset the singleton instance. Use with caution, mainly for testing.
   */
  static resetInstance(): void {
    MultiplayerFramework.instance = null;
  }
  
  /**
   * Initialize the framework and all managers.
   * Must be called before using any framework functionality.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.log("Framework already initialized");
      return;
    }
    
    this.log("Initializing Multiplayer Framework...");
    
    // Initialize all managers in dependency order
    await this.timerManager.initialize();
    await this.playerManager.initialize();
    await this.roomManager.initialize();
    await this.matchManager.initialize();
    await this.spectatorManager.initialize();
    await this.replayManager.initialize();
    await this.syncManager.initialize();
    await this.antiCheatManager.initialize();
    await this.matchmakingManager.initialize();
    await this.gameStateManager.initialize();
    await this.turnManager.initialize();
    await this.actionValidator.initialize();
    await this.eventDispatcher.initialize();
    await this.winnerCalculator.initialize();
    await this.statisticsCollector.initialize();
    await this.disconnectHandler.initialize();
    await this.reconnectHandler.initialize();
    
    this.initialized = true;
    this.log("Multiplayer Framework initialized successfully");
  }
  
  /**
   * Gracefully shutdown the framework and all managers.
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;
    
    this.log("Shutting down Multiplayer Framework...");
    
    // Shutdown in reverse order of initialization
    await this.reconnectHandler.shutdown();
    await this.disconnectHandler.shutdown();
    await this.statisticsCollector.shutdown();
    await this.winnerCalculator.shutdown();
    await this.eventDispatcher.shutdown();
    await this.actionValidator.shutdown();
    await this.turnManager.shutdown();
    await this.gameStateManager.shutdown();
    await this.matchmakingManager.shutdown();
    await this.antiCheatManager.shutdown();
    await this.syncManager.shutdown();
    await this.replayManager.shutdown();
    await this.spectatorManager.shutdown();
    await this.matchManager.shutdown();
    await this.roomManager.shutdown();
    await this.playerManager.shutdown();
    await this.timerManager.shutdown();
    
    this.initialized = false;
    this.log("Multiplayer Framework shutdown complete");
  }
  
  /**
   * Check if the framework is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Log a message if debug mode is enabled.
   */
  log(message: string, data?: unknown): void {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[MultiplayerFramework ${timestamp}] ${message}`, data ?? "");
    }
  }
  
  /**
   * Log an error message.
   */
  error(message: string, error?: unknown): void {
    const timestamp = new Date().toISOString();
    console.error(`[MultiplayerFramework ${timestamp}] ERROR: ${message}`, error ?? "");
  }
  
  /**
   * Get framework health and statistics.
   */
  getHealth() {
    return {
      initialized: this.initialized,
      rooms: this.roomManager.getRoomCount(),
      activeMatches: this.matchManager.getActiveMatchCount(),
      connectedPlayers: this.playerManager.getConnectedPlayerCount(),
      spectators: this.spectatorManager.getSpectatorCount(),
      matchmakingQueue: this.matchmakingManager.getQueueLength(),
    };
  }
}

// Re-export all types
export * from "./types";

// Re-export all managers
export { RoomManager } from "./managers/RoomManager";
export { MatchManager } from "./managers/MatchManager";
export { PlayerManager } from "./managers/PlayerManager";
export { SpectatorManager } from "./managers/SpectatorManager";
export { ReplayManager } from "./managers/ReplayManager";
export { TimerManager } from "./managers/TimerManager";
export { SyncManager } from "./managers/SyncManager";
export { AntiCheatManager } from "./managers/AntiCheatManager";
export { MatchmakingManager } from "./managers/MatchmakingManager";

// Re-export Phase 11 gameplay framework
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

// Re-export utilities
export { EventEmitter } from "./utils/EventEmitter";
export { StateValidator } from "./utils/StateValidator";
export { PacketSequencer } from "./utils/PacketSequencer";
export { LatencyCompensator } from "./utils/LatencyCompensator";
