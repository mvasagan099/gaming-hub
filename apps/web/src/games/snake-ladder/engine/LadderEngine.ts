import { ladderMap } from '../data/board';

export class LadderEngine {
  static checkLadder(position: number): { isLadder: boolean; target: number } {
    if (ladderMap.has(position)) {
      return { isLadder: true, target: ladderMap.get(position)! };
    }
    return { isLadder: false, target: position };
  }
}
