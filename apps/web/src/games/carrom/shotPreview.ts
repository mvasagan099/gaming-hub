import { BASE_LINE_Y, CARROM_BOARD_HEIGHT, CARROM_MAX_SHOT_SPEED, simulatePhysics, type CarromState } from '@gaming-hub/game-engine';

/** Predict movement only; the server still decides scores, fouls, turns and winners. */
export function predictCarromShot(
  state: Pick<CarromState, 'coins' | 'striker'>, seat: number, action: { angle: number; power: number; x: number },
) {
  const coins = structuredClone(state.coins);
  const striker = structuredClone(state.striker);
  striker.x = action.x;
  striker.y = seat === 0 ? BASE_LINE_Y : CARROM_BOARD_HEIGHT - BASE_LINE_Y;
  striker.placed = true;
  striker.vx = Math.cos(action.angle) * action.power * CARROM_MAX_SHOT_SPEED;
  striker.vy = Math.sin(action.angle) * action.power * CARROM_MAX_SHOT_SPEED;
  return simulatePhysics(coins, striker, 1 / 60, 600).keyframes;
}

export function shotAnimationDuration(keyframes: { frame: number }[]) {
  return Math.max(400, Math.min(keyframes[keyframes.length - 1].frame * 16.67, 3000));
}
