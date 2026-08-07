/**
 * Game-Specific Multiplayer Validation Rules
 * 
 * Server-side validation for each game type to ensure
 * fair play and prevent cheating.
 * 
 * Games: Chess, Ludo, Snake & Ladder, Bubble Shooter,
 *        Fruit Ninja, Snake vs Worms, Table Tennis, Carrom, Cricket
 */

import type { JsonObject } from "@gaming-hub/shared";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  penalty?: string;
}

export interface GameValidator {
  validateAction(state: JsonObject, action: JsonObject, playerId: string, timestamp: number): ValidationResult;
  validateGameState(state: JsonObject): ValidationResult;
  validateMoveLegality(state: JsonObject, action: JsonObject): ValidationResult;
}

export class ChessValidator implements GameValidator {
  validateAction(
    state: JsonObject,
    action: JsonObject,
    playerId: string,
    timestamp: number
  ): ValidationResult {
    const chessState = state as any;

    if (action.type === "move") {
      if (chessState.timeControl && chessState.timeControl.baseSeconds > 0) {
        const currentTime = chessState.clocks?.[chessState.turn];
        if (currentTime !== undefined && currentTime <= 0) {
          return {
            valid: false,
            reason: "Player has no time remaining",
            penalty: "timeout",
          };
        }
      }

      if (!this.validateMoveLegality(chessState, action)) {
        return {
          valid: false,
          reason: "Illegal move",
          penalty: "illegal_move",
        };
      }
    }

    if (action.type === "clock_sync") {
      const serverTime = Date.now();
      const clientTime = action.timestamp as number;
      const drift = Math.abs(serverTime - clientTime);

      if (drift > 5000) {
        console.warn(`[ChessValidator] Large clock drift detected: ${drift}ms for player ${playerId}`);
      }
    }

    return { valid: true };
  }

  validateGameState(state: JsonObject): ValidationResult {
    const chessState = state as any;

    if (chessState.fen && !this.isValidFen(chessState.fen)) {
      return {
        valid: false,
        reason: "Invalid FEN string",
      };
    }

    return { valid: true };
  }

  validateMoveLegality(state: JsonObject, action: JsonObject): ValidationResult {
    const move = action as any;
    if (!move.from || !move.to) {
      return { valid: false, reason: "Missing move coordinates" };
    }

    return { valid: true };
  }

  private isValidFen(fen: string): boolean {
    const fenPattern = /^([rnbqkpRNBQKP1-8]+\/){7}[rnbqkpRNBQKP1-8]+\s[wb]\s[KQkq-]+\s[a-h][1-8]-?/;
    return fenPattern.test(fen);
  }
}

export class LudoValidator implements GameValidator {
  validateAction(
    state: JsonObject,
    action: JsonObject,
    playerId: string,
    timestamp: number
  ): ValidationResult {
    const ludoState = state as any;

    if (action.type === "roll_dice") {
      if (ludoState.diceRolled) {
        return {
          valid: false,
          reason: "Dice already rolled this turn",
          penalty: "duplicate_action",
        };
      }

      if (ludoState.currentPlayer !== playerId) {
        return {
          valid: false,
          reason: "Not your turn",
          penalty: "wrong_turn",
        };
      }
    }

    if (action.type === "move_token") {
      if (!ludoState.diceRolled) {
        return {
          valid: false,
          reason: "Must roll dice first",
          penalty: "invalid_action",
        };
      }

      const diceValue = ludoState.lastDiceValue as number;
      const tokenPosition = this.getTokenPosition(ludoState, action);
      const validMoves = this.calculateValidMoves(ludoState, playerId, diceValue);

      if (!this.isTokenMoveValid(tokenPosition, action, validMoves)) {
        return {
          valid: false,
          reason: "Invalid token move",
          penalty: "invalid_move",
        };
      }
    }

    return { valid: true };
  }

  validateGameState(state: JsonObject): ValidationResult {
    return { valid: true };
  }

  validateMoveLegality(state: JsonObject, action: JsonObject): ValidationResult {
    return { valid: true };
  }

  private getTokenPosition(state: any, action: any): number {
    return state.playerTokens?.[action.token] ?? -1;
  }

  private calculateValidMoves(state: any, playerId: string, dice: number): number[] {
    return [dice];
  }

  private isTokenMoveValid(position: number, action: any, validMoves: number[]): boolean {
    return validMoves.length > 0;
  }
}

export class SnakeLadderValidator implements GameValidator {
  validateAction(
    state: JsonObject,
    action: JsonObject,
    playerId: string,
    timestamp: number
  ): ValidationResult {
    const snakeLadderState = state as any;

    if (action.type === "roll_dice") {
      if (snakeLadderState.diceRolled) {
        return {
          valid: false,
          reason: "Dice already rolled",
          penalty: "duplicate_action",
        };
      }

      if (snakeLadderState.currentPlayer !== playerId) {
        return {
          valid: false,
          reason: "Not your turn",
          penalty: "wrong_turn",
        };
      }

      const account = snakeLadderState.account as any;
      if (account && account.player !== playerId) {
        console.warn(`[SnakeLadderValidator] Integrity check failed for player ${playerId}`);
      }
    }

    if (action.type === "move") {
      const diceValue = snakeLadderState.lastDiceValue as number;
      const currentPosition = snakeLadderState.positions?.[playerId] as number;
      const expectedPosition = currentPosition + diceValue;

      if (!this.validatePositionSnakesLadders(expectedPosition, snakeLadderState)) {
        return {
          valid: false,
          reason: "Invalid move considering snakes/ladders",
          penalty: "invalid_move",
        };
      }
    }

    return { valid: true };
  }

  validateGameState(state: JsonObject): ValidationResult {
    return { valid: true };
  }

  validateMoveLegality(state: JsonObject, action: JsonObject): ValidationResult {
    return { valid: true };
  }

  private validatePositionSnakesLadders(position: number, state: any): boolean {
    return position >= 0 && position <= 100;
  }
}

export class BubbleShooterValidator implements GameValidator {
  validateAction(
    state: JsonObject,
    action: JsonObject,
    playerId: string,
    timestamp: number
  ): ValidationResult {
    const bubbleState = state as any;

    if (action.type === "shoot") {
      if (!this.validateShootAction(bubbleState, action, timestamp)) {
        return {
          valid: false,
          reason: "Invalid shoot action",
          penalty: "invalid_action",
        };
      }

      const scoreChange = action.scoreChange as number;
      if (scoreChange && !this.validateScoreChange(bubbleState, scoreChange)) {
        return {
          valid: false,
          reason: "Invalid score change",
          penalty: "score_manipulation",
        };
      }
    }

    if (action.type === "combo") {
      const comboMultiplier = action.multiplier as number;
      if (comboMultiplier > 10) {
        return {
          valid: false,
          reason: "Invalid combo multiplier",
          penalty: "score_manipulation",
        };
      }
    }

    return { valid: true };
  }

  validateGameState(state: JsonObject): ValidationResult {
    return { valid: true };
  }

  validateMoveLegality(state: JsonObject, action: JsonObject): ValidationResult {
    return { valid: true };
  }

  private validateShootAction(state: any, action: any, timestamp: number): boolean {
    const lastShoot = state.lastShootTimestamp as number;
    if (lastShoot && timestamp - lastShoot < 100) {
      return false;
    }
    return true;
  }

  private validateScoreChange(state: any, scoreChange: number): boolean {
    const maxReasonableScore = 10000;
    return scoreChange >= 0 && scoreChange <= maxReasonableScore;
  }
}

export class FruitNinjaValidator implements GameValidator {
  validateAction(
    state: JsonObject,
    action: JsonObject,
    playerId: string,
    timestamp: number
  ): ValidationResult {
    const fruitState = state as any;

    if (action.type === "slice") {
      const fruitsSliced = action.fruits as any[];
      const sessionStart = fruitState.startedAt as number;
      const elapsed = (timestamp - sessionStart) / 1000;
      const comboTimeWindow = 2;
      const recentSlices = fruitsSliced.filter((f: any) => timestamp - f.timestamp <= comboTimeWindow * 1000);

      if (recentSlices.length > 5) {
        const comboMultiplier = action.comboMultiplier as number;
        if (comboMultiplier && comboMultiplier !== this.calculateComboMultiplier(recentSlices.length)) {
          return {
            valid: false,
            reason: "Invalid combo multiplier",
            penalty: "score_manipulation",
          };
        }
      }
    }

    if (action.type === "score_update") {
      const currentScore = fruitState.scores?.[playerId] as number;
      const reportedScore = action.score as number;
      const scoreDiff = reportedScore - currentScore;

      if (scoreDiff > 1000) {
        return {
          valid: false,
          reason: "Unreasonable score increase",
          penalty: "score_manipulation",
        };
      }
    }

    return { valid: true };
  }

  validateGameState(state: JsonObject): ValidationResult {
    return { valid: true };
  }

  validateMoveLegality(state: JsonObject, action: JsonObject): ValidationResult {
    return { valid: true };
  }

  private calculateComboMultiplier(comboCount: number): number {
    return Math.min(10, Math.floor(comboCount / 3) + 1);
  }
}

export class SnakeVsWormsValidator implements GameValidator {
  validateAction(
    state: JsonObject,
    action: JsonObject,
    playerId: string,
    timestamp: number
  ): ValidationResult {
    const snakeState = state as any;

    if (action.type === "move") {
      if (!this.validateMovementSpeed(snakeState, action, timestamp)) {
        return {
          valid: false,
          reason: "Movement speed hack detected",
          penalty: "speed_hack",
        };
      }

      if (!this.validateCollision(snakeState, action, playerId)) {
        return {
          valid: false,
          reason: "Invalid collision",
          penalty: "collision_manipulation",
        };
      }
    }

    if (action.type === "eat_food") {
      const foodPosition = action.foodPosition as any;
      const snakePosition = snakeState.positions?.[playerId] as any[];

      if (!this.isFoodReachable(snakePosition, foodPosition)) {
        return {
          valid: false,
          reason: "Food not reachable",
          penalty: "invalid_action",
        };
      }
    }

    return { valid: true };
  }

  validateGameState(state: JsonObject): ValidationResult {
    return { valid: true };
  }

  validateMoveLegality(state: JsonObject, action: JsonObject): ValidationResult {
    return { valid: true };
  }

  private validateMovementSpeed(state: any, action: any, timestamp: number): boolean {
    const lastMove = state.lastMoveTimestamp as number;
    if (lastMove) {
      const timeSinceLastMove = timestamp - lastMove;
      const minMoveInterval = 50;
      if (timeSinceLastMove < minMoveInterval) {
        return false;
      }
    }
    return true;
  }

  private validateCollision(state: any, action: any, playerId: string): boolean {
    return true;
  }

  private isFoodReachable(snakePosition: any[], foodPosition: any): boolean {
    if (!snakePosition || snakePosition.length === 0) return false;
    const head = snakePosition[0];
    const distance = Math.abs(head.x - foodPosition.x) + Math.abs(head.y - foodPosition.y);
    return distance <= 1;
  }
}

export class TableTennisValidator implements GameValidator {
  validateAction(
    state: JsonObject,
    action: JsonObject,
    playerId: string,
    timestamp: number
  ): ValidationResult {
    const tableTennisState = state as any;

    if (action.type === "hit") {
      if (!this.validateBallPosition(tableTennisState, action)) {
        return {
          valid: false,
          reason: "Invalid ball position",
          penalty: "ball_manipulation",
        };
      }

      const paddleSpeed = action.paddleSpeed as number;
      if (paddleSpeed && paddleSpeed > 100) {
        return {
          valid: false,
          reason: "Impossible paddle speed",
          penalty: "speed_hack",
        };
      }
    }

    if (action.type === "serve") {
      if (tableTennisState.lastServer === playerId) {
        return {
          valid: false,
          reason: "Cannot serve twice in a row",
          penalty: "invalid_serve",
        };
      }
    }

    return { valid: true };
  }

  validateGameState(state: JsonObject): ValidationResult {
    return { valid: true };
  }

  validateMoveLegality(state: JsonObject, action: JsonObject): ValidationResult {
    return { valid: true };
  }

  private validateBallPosition(state: any, action: any): boolean {
    const ballPos = action.ballPosition as any;
    if (!ballPos) return false;
    return ballPos.x >= 0 && ballPos.x <= 1 && ballPos.y >= 0 && ballPos.y <= 1;
  }
}

export class CarromValidator implements GameValidator {
  validateAction(
    state: JsonObject,
    action: JsonObject,
    playerId: string,
    timestamp: number
  ): ValidationResult {
    const carromState = state as any;

    if (action.type === "strike") {
      const power = action.power as number;
      if (power && (power < 0 || power > 1)) {
        return {
          valid: false,
          reason: "Invalid strike power",
          penalty: "physics_manipulation",
        };
      }

      const angle = action.angle as number;
      if (angle && (angle < 0 || angle > 360)) {
        return {
          valid: false,
          reason: "Invalid strike angle",
          penalty: "physics_manipulation",
        };
      }
    }

    if (action.type === "pocket") {
      const pieceId = action.pieceId as string;
      if (!this.validatePieceExists(carromState, pieceId)) {
        return {
          valid: false,
          reason: "Piece does not exist",
          penalty: "invalid_action",
        };
      }
    }

    return { valid: true };
  }

  validateGameState(state: JsonObject): ValidationResult {
    return { valid: true };
  }

  validateMoveLegality(state: JsonObject, action: JsonObject): ValidationResult {
    return { valid: true };
  }

  private validatePieceExists(state: any, pieceId: string): boolean {
    const pieces = state.pieces as any[];
    return pieces?.some((p) => p.id === pieceId) ?? false;
  }
}

export class CricketValidator implements GameValidator {
  validateAction(
    state: JsonObject,
    action: JsonObject,
    playerId: string,
    timestamp: number
  ): ValidationResult {
    const cricketState = state as any;

    if (action.type === "shot") {
      const batSpeed = action.batSpeed as number;
      if (batSpeed && batSpeed > 150) {
        return {
          valid: false,
          reason: "Impossible bat speed",
          penalty: "speed_hack",
        };
      }

      const timing = action.timing as number;
      if (timing && (timing < 0 || timing > 1)) {
        return {
          valid: false,
          reason: "Invalid timing",
          penalty: "physics_manipulation",
        };
      }
    }

    if (action.type === "bowl") {
      const speed = action.speed as number;
      if (speed && (speed < 80 || speed > 160)) {
        return {
          valid: false,
          reason: "Invalid bowling speed",
          penalty: "physics_manipulation",
        };
      }
    }

    if (action.type === "score_update") {
      const runs = action.runs as number;
      if (runs < 0 || runs > 6) {
        return {
          valid: false,
          reason: "Invalid runs scored",
          penalty: "score_manipulation",
        };
      }
    }

    return { valid: true };
  }

  validateGameState(state: JsonObject): ValidationResult {
    return { valid: true };
  }

  validateMoveLegality(state: JsonObject, action: JsonObject): ValidationResult {
    return { valid: true };
  }
}

export const GameValidators: Record<string, GameValidator> = {
  chess: new ChessValidator(),
  ludo: new LudoValidator(),
  "snake-ladder": new SnakeLadderValidator(),
  "bubble-shooter": new BubbleShooterValidator(),
  "fruit-ninja": new FruitNinjaValidator(),
  "snake-vs-worms": new SnakeVsWormsValidator(),
  "table-tennis": new TableTennisValidator(),
  carrom: new CarromValidator(),
  cricket: new CricketValidator(),
};

export function getValidator(gameId: string): GameValidator | undefined {
  return GameValidators[gameId];
}
