import { createEngine } from '../packages/game-engine/dist/index.js';
import { calculateStateHash } from '../packages/shared/dist/index.js';

function profile() {
  const engine = createEngine('carrom', [
    { userId: 'p1', seat: 0 },
    { userId: 'p2', seat: 1 }
  ], () => 0.5, {});
  
  // 1. Simulate physics
  const physicsStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    engine.processAction({
      actionId: `act_${i}`,
      type: 'carrom:shot-start',
      playerId: 'p1',
      seat: 0,
      timestamp: Date.now(),
      payload: { x: 0, angle: Math.PI / 4, power: 0.8 }
    });
  }
  const physicsTime = performance.now() - physicsStart;
  
  // 2. State cloning
  const state = engine.state;
  const cloneStart = performance.now();
  for (let i = 0; i < 10000; i++) {
    structuredClone(state);
  }
  const cloneTime = performance.now() - cloneStart;
  
  // 3. JSON serialization
  const serializeStart = performance.now();
  for (let i = 0; i < 10000; i++) {
    JSON.stringify(state);
  }
  const serializeTime = performance.now() - serializeStart;
  
  // 4. Hashing
  const hashStart = performance.now();
  for (let i = 0; i < 10000; i++) {
    calculateStateHash(state);
  }
  const hashTime = performance.now() - hashStart;

  console.log(`Physics (1k shots): ${physicsTime.toFixed(2)}ms`);
  console.log(`Cloning (10k times): ${cloneTime.toFixed(2)}ms`);
  console.log(`Serialization (10k times): ${serializeTime.toFixed(2)}ms`);
  console.log(`Hashing (10k times): ${hashTime.toFixed(2)}ms`);
}

profile();
