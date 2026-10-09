import type { JsonObject } from './json';

type Piece = { id: string; x: number; y: number; pocketed: boolean; pocketIndex: number | null };
type Frame = { frame: number; pieces: Piece[] };
export type PackedCarromTrajectory = {
  version: 1;
  ids: string[];
  frames: { frame: number; pieces: [number, number, number, boolean, number | null][] }[];
};

/** Lossless wire representation: dictionary IDs and tuples; no quantization or dropped frames. */
export function packCarromTrajectory(frames: Frame[]): PackedCarromTrajectory {
  const ids: string[] = [], indices = new Map<string, number>();
  return { version: 1, ids, frames: frames.map(frame => ({ frame: frame.frame, pieces: frame.pieces.map(piece => {
    let index = indices.get(piece.id);
    if (index === undefined) { index = ids.length; ids.push(piece.id); indices.set(piece.id, index); }
    return [index, piece.x, piece.y, piece.pocketed, piece.pocketIndex];
  }) })) };
}

/** Decode at the client boundary; old/unpacked recovery snapshots pass through unchanged. */
export function unpackCarromState(state: JsonObject): JsonObject {
  const packed = state.packedCarromTrajectory as unknown as PackedCarromTrajectory | undefined;
  if (!packed || packed.version !== 1) return state;
  const { packedCarromTrajectory: _, ...rest } = state;
  return { ...rest, lastTrajectory: packed.frames.map(frame => ({ frame: frame.frame,
    pieces: frame.pieces.map(([index, x, y, pocketed, pocketIndex]) => ({ id: packed.ids[index]!, x, y, pocketed, pocketIndex })) })) };
}
