import { describe, expect, it } from 'vitest';
import { checkPocketCollision, createInitialCoins, createInitialStriker, simulatePhysics } from '../src/carrom/physics';
import { POCKETS } from '../src/carrom/types';

describe('Authoritative Carrom pocket capture', () => {
  for (const [index, pocket] of POCKETS.entries()) {
    it.each([0, 0.3, 5, 27])(`captures a coin over pocket ${index} at speed %s exactly once`, speed => {
      const coin = createInitialCoins().find(c => c.type === 'white')!;
      const sx = pocket.x < 300 ? 1 : -1;
      const sy = pocket.y < 300 ? 1 : -1;
      Object.assign(coin, { x: pocket.x + sx * 12, y: pocket.y + sy * 12, vx: -sx * speed, vy: -sy * speed });
      const striker = createInitialStriker(0);
      striker.pocketed = true;
      const result = simulatePhysics([coin], striker);
      expect(coin.pocketed).toBe(true);
      expect(result.pocketedCoins).toHaveLength(1);
      expect(result.events.filter(event => event.type === 'coin-pocketed')).toHaveLength(1);
      expect(result.events[0].pocketIndex).toBe(index);
      expect(simulatePhysics([coin], striker).events).toHaveLength(0);
    });
  }

  it('does not capture a coin merely touching the outside of the hole', () => {
    expect(checkPocketCollision(525, 75, 0, 0)).toBeNull();
  });

  it('still identifies a striker entering the pocket as a foul event', () => {
    const striker = createInitialStriker(0);
    Object.assign(striker, { x: 543, y: 57, vx: 0, vy: 0 });
    const result = simulatePhysics([], striker);
    expect(result.pocketedStriker).toBe(true);
    expect(result.pocketedCoins).toHaveLength(0);
    expect(result.events.filter(event => event.type === 'striker-pocketed')).toHaveLength(1);
  });
});
