export interface BoardEffect {
  from: number;
  to: number;
  type: "snake" | "ladder" | "portal";
}

import { snakes } from "../data/snakes";
import { ladders } from "../data/ladders";

export class BoardEffectManager {
  private effects = new Map<number, BoardEffect>();

  constructor() {
    snakes.forEach((s) => {
      this.effects.set(s.head, { from: s.head, to: s.tail, type: "snake" });
    });

    ladders.forEach((l) => {
      this.effects.set(l.start, { from: l.start, to: l.end, type: "ladder" });
    });
  }

  getEffect(tile: number): BoardEffect | undefined {
    return this.effects.get(tile);
  }

  hasEffect(tile: number): boolean {
    return this.effects.has(tile);
  }

  getDestination(tile: number): number {
    const effect = this.effects.get(tile);
    return effect ? effect.to : tile;
  }
}
