import type { RandomSource } from "./types";

/**
 * CSPRNG-backed source matching the engine's `RandomSource` contract.
 *
 * Uses the Web Crypto API (`globalThis.crypto`), which is available in
 * Node.js 19+ and every evergreen browser, so this module is safe to run
 * on both the server and in worker/unit-test environments without a
 * Node-specific `crypto` import.
 */
export function secureRandomSource(): RandomSource {
  return () => {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0] / 4294967296;
  };
}

/**
 * Deterministic RNG source for tests and replays. Seeds a simple
 * xorshift32 generator so test suites can reproduce exact game states.
 */
export function seededRandomSource(seed: number): RandomSource {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}
