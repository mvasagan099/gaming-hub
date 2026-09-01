import type { PlayerState } from '../types/game';

export class WinEngine {
  static checkWin(player: PlayerState): boolean {
    return player.position === 100;
  }
}
