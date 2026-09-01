import { randomBytes } from "node:crypto";

/** CSPRNG-backed source matching the engine's RandomSource contract. */
export function secureRandomSource(): () => number {
  return () => {
    const bytes = randomBytes(4);
    return bytes.readUInt32LE(0) / 4294967296;
  };
}
