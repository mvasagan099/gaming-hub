/**
 * Spectator System Manager
 * 
 * Implements comprehensive spectator controls with:
 * - Live match spectating with delay
 * - Spectator permissions and access control
 * - Spectator chat and interactions
 * - Camera and follow controls
 * - Replay system integration
 */

import type { MultiplayerFramework } from "../framework";
import type { RoomRuntime, PlayerRuntime } from "../types";
import type { Socket } from "socket.io";
import { prisma } from "@gaming-hub/db";

export interface SpectatorConfig {
  maxSpectators: number;
  delaySeconds: number;
  allowChat: boolean;
  allowFollowPlayer: boolean;
  showAllHands: boolean;
  canSeePrivateCards: boolean;
}

export interface SpectatorState {
  spectatorId: string;
  roomId: string;
  socket: Socket;
  joinedAt: number;
  followPlayer: string | null;
  freeCamera: boolean;
  seeAllCards: boolean;
  delayOffset: number;
}

export interface SpectatorPermissions {
  canChat: boolean;
  canFollowPlayers: boolean;
  canSeePrivateInfo: boolean;
  canAccessReplay: boolean;
  canDownloadReplay: boolean;
  maxDelaySeconds: number;
}

export const DEFAULT_SPECTATOR_CONFIG: SpectatorConfig = {
  maxSpectators: 50,
  delaySeconds: 0,
  allowChat: true,
  allowFollowPlayer: true,
  showAllHands: false,
  canSeePrivateCards: false,
};

export const TOURNAMENT_SPECTATOR_CONFIG: SpectatorConfig = {
  maxSpectators: 100,
  delaySeconds: 15,
  allowChat: false,
  allowFollowPlayer: true,
  showAllHands: false,
  canSeePrivateCards: false,
};

export const PRIVATE_SPECTATOR_CONFIG: SpectatorConfig = {
  maxSpectators: 10,
  delaySeconds: 0,
  allowChat: true,
  allowFollowPlayer: true,
  showAllHands: true,
  canSeePrivateCards: false,
};

export class SpectatorManager {
  private readonly framework: MultiplayerFramework;
  private readonly spectators = new Map<string, SpectatorState>();
  private readonly delayBuffers = new Map<string, any[]>();
  private readonly spectatorConfigs = new Map<string, SpectatorConfig>();

  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }

  async initialize(): Promise<void> {
    this.framework.log("[SpectatorManager] Initialized");
  }

  async shutdown(): Promise<void> {
    this.spectators.clear();
    this.delayBuffers.clear();
    this.spectatorConfigs.clear();
  }

  async joinAsSpectator(
    roomId: string,
    spectatorId: string,
    socket: Socket,
    config?: Partial<SpectatorConfig>
  ): Promise<{ success: boolean; error?: string }> {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) {
      return { success: false, error: "Room not found" };
    }

    const spectatorConfig = { ...DEFAULT_SPECTATOR_CONFIG, ...config };
    
    const currentSpectators = this.getSpectatorCount(roomId);
    if (currentSpectators >= spectatorConfig.maxSpectators) {
      return { success: false, error: "Spectator limit reached" };
    }

    const spectatorState: SpectatorState = {
      spectatorId,
      roomId,
      socket,
      joinedAt: Date.now(),
      followPlayer: null,
      freeCamera: true,
      seeAllCards: spectatorConfig.showAllHands,
      delayOffset: spectatorConfig.delaySeconds * 1000,
    };

    this.spectators.set(`${roomId}:${spectatorId}`, spectatorState);
    this.spectatorConfigs.set(roomId, spectatorConfig);

    socket.join(`spectator:${roomId}`);
    
    await this.sendSpectatorJoined(roomId, spectatorId);
    await this.syncSpectatorState(roomId, spectatorId);

    this.framework.log(`[SpectatorManager] Spectator ${spectatorId} joined room ${roomId}`);

    return { success: true };
  }

  async leaveSpectator(roomId: string, spectatorId: string): Promise<void> {
    const key = `${roomId}:${spectatorId}`;
    const spectatorState = this.spectators.get(key);

    if (!spectatorState) return;

    spectatorState.socket.leave(`spectator:${roomId}`);
    this.spectators.delete(key);

    await this.sendSpectatorLeft(roomId, spectatorId);

    this.framework.log(`[SpectatorManager] Spectator ${spectatorId} left room ${roomId}`);
  }

  async setFollowPlayer(
    roomId: string,
    spectatorId: string,
    playerId: string | null
  ): Promise<void> {
    const key = `${roomId}:${spectatorId}`;
    const spectatorState = this.spectators.get(key);

    if (!spectatorState) return;

    const config = this.spectatorConfigs.get(roomId);
    if (!config?.allowFollowPlayer) {
      throw new Error("Following players is not allowed");
    }

    spectatorState.followPlayer = playerId;
    spectatorState.freeCamera = playerId === null;

    await this.sendSpectatorUpdate(roomId, spectatorId, {
      following: playerId,
      freeCamera: spectatorState.freeCamera,
    });
  }

  async setFreeCamera(roomId: string, spectatorId: string, enabled: boolean): Promise<void> {
    const key = `${roomId}:${spectatorId}`;
    const spectatorState = this.spectators.get(key);

    if (!spectatorState) return;

    spectatorState.freeCamera = enabled;
    if (enabled) {
      spectatorState.followPlayer = null;
    }

    await this.sendSpectatorUpdate(roomId, spectatorId, {
      freeCamera: enabled,
      following: null,
    });
  }

  async updateSpectatorPermissions(
    roomId: string,
    permissions: Partial<SpectatorPermissions>
  ): Promise<void> {
    const config = this.spectatorConfigs.get(roomId);
    if (!config) return;

    this.spectatorConfigs.set(roomId, {
      ...config,
      allowChat: permissions.canChat ?? config.allowChat,
      allowFollowPlayer: permissions.canFollowPlayers ?? config.allowFollowPlayer,
      showAllHands: permissions.canSeePrivateInfo ?? config.showAllHands,
      delaySeconds: permissions.maxDelaySeconds ?? config.delaySeconds,
    });

    await this.broadcastConfigUpdate(roomId);
  }

  async broadcastToSpectators(roomId: string, event: string, payload: any): Promise<void> {
    const config = this.spectatorConfigs.get(roomId);
    const delay = config?.delaySeconds ?? 0;

    if (delay > 0) {
      this.bufferEvent(roomId, event, payload, delay);
    } else {
      this.framework.io.to(`spectator:${roomId}`).emit(event, payload);
    }
  }

  async sendSpectatorChat(
    roomId: string,
    spectatorId: string,
    message: string
  ): Promise<void> {
    const config = this.spectatorConfigs.get(roomId);
    if (!config?.allowChat) {
      throw new Error("Spectator chat is disabled");
    }

    const spectatorState = this.spectators.get(`${roomId}:${spectatorId}`);
    if (!spectatorState) return;

    const chatMessage = {
      id: `${Date.now()}_${spectatorId}`,
      roomId,
      userId: spectatorId,
      senderName: `Spectator ${spectatorState.spectatorId.slice(0, 6)}`,
      body: message.trim().slice(0, 200),
      isSystem: false,
      isSpectator: true,
      createdAt: new Date().toISOString(),
    };

    this.framework.io.to(`spectator:${roomId}`).emit("spectator:chat", chatMessage);
  }

  getSpectatorCount(roomId?: string): number {
    if (roomId) {
      let count = 0;
      for (const key of this.spectators.keys()) {
        if (key.startsWith(`${roomId}:`)) {
          count++;
        }
      }
      return count;
    }
    return this.spectators.size;
  }

  getSpectators(roomId: string): SpectatorState[] {
    const spectators: SpectatorState[] = [];
    for (const [key, state] of this.spectators.entries()) {
      if (key.startsWith(`${roomId}:`)) {
        spectators.push(state);
      }
    }
    return spectators;
  }

  private bufferEvent(roomId: string, event: string, payload: any, delaySeconds: number): void {
    if (!this.delayBuffers.has(roomId)) {
      this.delayBuffers.set(roomId, []);
    }

    const buffer = this.delayBuffers.get(roomId)!;
    buffer.push({
      event,
      payload,
      timestamp: Date.now(),
      delay: delaySeconds * 1000,
    });

    setTimeout(() => {
      this.flushBuffer(roomId);
    }, delaySeconds * 1000);
  }

  private flushBuffer(roomId: string): void {
    const buffer = this.delayBuffers.get(roomId);
    if (!buffer || buffer.length === 0) return;

    const now = Date.now();
    const readyEvents = buffer.filter((item: any) => now >= item.timestamp + item.delay);

    for (const item of readyEvents) {
      this.framework.io.to(`spectator:${roomId}`).emit(item.event, item.payload);
    }

    const remainingEvents = buffer.filter((item: any) => now < item.timestamp + item.delay);
    this.delayBuffers.set(roomId, remainingEvents);
  }

  private async sendSpectatorJoined(roomId: string, spectatorId: string): Promise<void> {
    this.framework.io.to(`room:${roomId}`).emit("spectator:joined", {
      roomId,
      spectatorId,
      spectatorCount: this.getSpectatorCount(roomId),
    });
  }

  private async sendSpectatorLeft(roomId: string, spectatorId: string): Promise<void> {
    this.framework.io.to(`room:${roomId}`).emit("spectator:left", {
      roomId,
      spectatorId,
      spectatorCount: this.getSpectatorCount(roomId),
    });
  }

  private async syncSpectatorState(roomId: string, spectatorId: string): Promise<void> {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room || !room.match) return;

    const spectatorState = this.spectators.get(`${roomId}:${spectatorId}`);
    if (!spectatorState) return;

    spectatorState.socket.emit("spectator:sync", {
      roomId,
      matchState: (room.match.engine as { serialize(): unknown }).serialize(),
      spectators: this.getSpectators(roomId).map((s) => ({
        id: s.spectatorId,
        joinedAt: s.joinedAt,
        following: s.followPlayer,
      })),
      config: this.spectatorConfigs.get(roomId),
    });
  }

  private async sendSpectatorUpdate(
    roomId: string,
    spectatorId: string,
    update: any
  ): Promise<void> {
    this.framework.io.to(`spectator:${roomId}`).emit("spectator:updated", {
      spectatorId,
      ...update,
    });
  }

  private async broadcastConfigUpdate(roomId: string): Promise<void> {
    const config = this.spectatorConfigs.get(roomId);
    this.framework.io.to(`spectator:${roomId}`).emit("spectator:config", {
      roomId,
      config,
    });
  }
}
