import { snakeMap } from '../data/board';

export class SnakeEngine {
  static checkSnake(position: number): { isSnake: boolean; target: number } {
    if (snakeMap.has(position)) {
      return { isSnake: true, target: snakeMap.get(position)! };
    }
    return { isSnake: false, target: position };
  }
}
