import { SnakeEngine } from './SnakeEngine';
import { LadderEngine } from './LadderEngine';
import { WinEngine } from './WinEngine';
import type { GameState, PlayerState } from '../types/game';

export class MovementEngine {
  static calculateMove(
    currentPos: number,
    diceVal: number
  ): { targetPos: number; isSnake: boolean; isLadder: boolean } {
    let targetPos = currentPos + diceVal;
    if (targetPos > 100) {
      targetPos = currentPos; // Exact landing rule
    }

    const snakeCheck = SnakeEngine.checkSnake(targetPos);
    if (snakeCheck.isSnake) {
      return { targetPos: snakeCheck.target, isSnake: true, isLadder: false };
    }

    const ladderCheck = LadderEngine.checkLadder(targetPos);
    if (ladderCheck.isLadder) {
      return { targetPos: ladderCheck.target, isSnake: false, isLadder: true };
    }

    return { targetPos, isSnake: false, isLadder: false };
  }
}
