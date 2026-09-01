// packages/anti-cheat/src/ActionValidator.ts
// packages/anti-cheat/src/ActionValidator.ts
import { logger } from './logger';
import { ActionStore } from './ActionStore';
import { RateLimiter } from './rateLimiter';
import { logEvent } from './logging';
import { v4 as uuidv4 } from 'uuid';

export interface ActionPayload {
  [key: string]: any;
}

export interface Action {
  matchId: string;
  playerId: string;
  actionId: string;
  actionType: string;
  clientTimestamp: number;
  payload: ActionPayload;
}

export interface ValidationContext {
  matchState: any; // generic, can be typed per game
  playerId: string;
  isAuthenticated: (playerId: string) => boolean;
  // Optional per‑game validator, returns validity and optional result payload
  gameValidator?: (action: Action, state: any) => Promise<{ valid: boolean; reason?: string; result?: any }>;
}

export class ActionValidator {
  private store: ActionStore;
  private limiter: RateLimiter;

  constructor() {
    this.store = new ActionStore();
    this.limiter = new RateLimiter();
  }

  async validate(action: Action, ctx: ValidationContext) {
    // 1. Basic schema validation
    if (!action.matchId || !action.playerId || !action.actionId || !action.actionType) {
      logEvent('ACTION_REJECTED', action, 'INVALID_SCHEMA');
      return { accepted: false, errorCode: 'INVALID_SCHEMA' };
    }

    // 2. Idempotency – duplicate actions
    if (this.store.hasProcessed(action.actionId)) {
      logEvent('ACTION_DUPLICATE', action, 'DUPLICATE_ACTION');
      const previous = this.store.getResult(action.actionId);
      return { accepted: true, ...previous };
    }

    // 3. Authentication & match membership (basic placeholder)
    if (!ctx.isAuthenticated(action.playerId)) {
      logEvent('ACTION_REJECTED', action, 'UNAUTHENTICATED');
      return { accepted: false, errorCode: 'UNAUTHENTICATED' };
    }
    // TODO: Verify player belongs to match, match is active, not forfeited, etc.

    // 4. Turn validation (generic)
    const currentPlayerId = ctx.matchState?.currentPlayerId;
    if (currentPlayerId && action.playerId !== currentPlayerId) {
      logEvent('ACTION_REJECTED', action, 'NOT_YOUR_TURN');
      return { accepted: false, errorCode: 'NOT_YOUR_TURN' };
    }

    // 5. Timer validation (generic)
    const now = Date.now();
    if (ctx.matchState?.turnExpiresAt && now > ctx.matchState.turnExpiresAt) {
      logEvent('ACTION_REJECTED', action, 'TURN_TIMEOUT');
      return { accepted: false, errorCode: 'TURN_TIMEOUT' };
    }

    // 6. Rate limiting per player / action type
    if (!this.limiter.allow(action.playerId, action.actionType)) {
      logEvent('ACTION_REJECTED', action, 'RATE_LIMITED');
      return { accepted: false, errorCode: 'RATE_LIMITED' };
    }

    // 7. Game‑specific validation, if supplied
    if (ctx.gameValidator) {
      const gameCheck = await ctx.gameValidator(action, ctx.matchState);
      if (!gameCheck.valid) {
        logEvent('ACTION_REJECTED', action, gameCheck.reason || 'GAME_VALIDATION_FAILED');
        return { accepted: false, errorCode: 'GAME_VALIDATION_FAILED', reason: gameCheck.reason };
      }
      // Result payload may contain updated game state fragment
      const resultPayload = gameCheck.result ?? {};
      const stateVersion = (ctx.matchState?.stateVersion ?? 0) + 1;
      const actionSequence = (ctx.matchState?.actionSequence ?? 0) + 1;
      const result = { stateVersion, actionSequence, payload: resultPayload };
      this.store.recordAction(action.actionId, result);
      logEvent('ACTION_ACCEPTED', action, 'OK');
      return { accepted: true, ...result };
    }

    // No game‑specific validator – accept as generic action
    const genericResult = { stateVersion: (ctx.matchState?.stateVersion ?? 0) + 1, actionSequence: (ctx.matchState?.actionSequence ?? 0) + 1, payload: {} };
    this.store.recordAction(action.actionId, genericResult);
    logEvent('ACTION_ACCEPTED', action, 'OK');
    return { accepted: true, ...genericResult };
  }
}

export const actionValidator = new ActionValidator();
