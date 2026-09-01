// packages/anti-cheat/src/ActionStore.ts

/** Simple in‑memory store for processed actions. */
export class ActionStore {
  private processed = new Map<string, any>(); // actionId -> result

  hasProcessed(actionId: string): boolean {
    return this.processed.has(actionId);
  }

  getResult(actionId: string): any {
    return this.processed.get(actionId);
  }

  recordAction(actionId: string, result: any): void {
    this.processed.set(actionId, result);
  }
}
