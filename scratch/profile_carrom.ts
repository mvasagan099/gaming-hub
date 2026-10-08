import { createEngine } from '@gaming-hub/game-engine';
import { calculateStateHash } from '@gaming-hub/shared';
import { calculateStateHashFast } from './fastHash.js';

const realLog = console.log;
console.log = () => {};

function profile() {
  const engine = createEngine('carrom', [
    { userId: 'p1', seat: 0 },
    { userId: 'p2', seat: 1 }
  ], () => 0.5, {});
  
  // 1. Simulate physics
  const physicsStart = performance.now();
  let successCount = 0;
  for (let i = 0; i < 100; i++) {
    const seat = engine.currentSeat;
    
    if (!engine.state.striker.placed) {
      engine.apply({ type: 'place-striker', x: 300 }, seat);
    }
    
    const result = engine.apply({
      type: 'strike',
      angle: Math.PI / 4 + (Math.random() * 0.1),
      power: 0.8
    }, seat);
    
    if (result.ok) successCount++;
    if (result.finished) break;
  }
  const physicsTime = performance.now() - physicsStart;
  
  // 2. State cloning
  const state = engine.state;
  const cloneStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    structuredClone(state);
  }
  const cloneTime = performance.now() - cloneStart;
  
  const jsonCloneStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    JSON.parse(JSON.stringify(state));
  }
  const jsonCloneTime = performance.now() - jsonCloneStart;
  
  // 3. JSON serialization
  const serializeStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    JSON.stringify(state);
  }
  const serializeTime = performance.now() - serializeStart;
  
  // 4. Hashing
  const hashStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    calculateStateHash(state);
  }
  const hashTime = performance.now() - hashStart;

  const hashFastStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    calculateStateHashFast(state);
  }
  const hashFastTime = performance.now() - hashFastStart;

  realLog(`Physics (${successCount} successful shots): ${physicsTime.toFixed(2)}ms (Avg: ${(physicsTime / Math.max(1, successCount)).toFixed(2)}ms/shot)`);
  realLog(`Cloning structuredClone (1k times): ${cloneTime.toFixed(2)}ms`);
  realLog(`Cloning JSON parse (1k times): ${jsonCloneTime.toFixed(2)}ms`);
  realLog(`Serialization (1k times): ${serializeTime.toFixed(2)}ms`);
  realLog(`Hashing (1k times): ${hashTime.toFixed(2)}ms`);
  realLog(`Fast Hashing (1k times): ${hashFastTime.toFixed(2)}ms`);
}

profile();
