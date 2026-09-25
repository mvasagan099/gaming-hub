import type { GameId } from "@gaming-hub/shared";
import type { IGameResultAdapter } from "./IGameResultAdapter";
import { ChessResultAdapter } from "./ChessResultAdapter";
import { CarromResultAdapter } from "./CarromResultAdapter";
import { SnookerResultAdapter } from "./SnookerResultAdapter";
import { LudoResultAdapter } from "./LudoResultAdapter";
import { SnakeLadderResultAdapter } from "./SnakeLadderResultAdapter";
import { FruitNinjaResultAdapter } from "./FruitNinjaResultAdapter";
import { BubbleShooterResultAdapter } from "./BubbleShooterResultAdapter";
import { TableTennisResultAdapter } from "./TableTennisResultAdapter";
import { SnakeVsWormsResultAdapter } from "./SnakeVsWormsResultAdapter";

export class GameResultAdapterRegistry {
  private static readonly adapters = new Map<GameId, IGameResultAdapter>();
  private static initialized = false;

  public static initialize(): void {
    if (this.initialized) return;

    this.register(new ChessResultAdapter());
    this.register(new CarromResultAdapter());
    this.register(new SnookerResultAdapter());
    this.register(new LudoResultAdapter());
    this.register(new SnakeLadderResultAdapter());
    this.register(new FruitNinjaResultAdapter());
    this.register(new BubbleShooterResultAdapter());
    this.register(new TableTennisResultAdapter());
    this.register(new SnakeVsWormsResultAdapter());

    this.initialized = true;
  }

  public static register(adapter: IGameResultAdapter): void {
    this.adapters.set(adapter.gameId, adapter);
  }

  public static getAdapter(gameId: GameId): IGameResultAdapter {
    if (!this.initialized) {
      this.initialize();
    }
    const adapter = this.adapters.get(gameId);
    if (!adapter) {
      throw new Error(`[GameResultAdapterRegistry] No result adapter registered for gameId: ${gameId}`);
    }
    return adapter;
  }

  public static hasAdapter(gameId: string): boolean {
    if (!this.initialized) {
      this.initialize();
    }
    return this.adapters.has(gameId as GameId);
  }

  public static getAllAdapters(): Map<GameId, IGameResultAdapter> {
    if (!this.initialized) {
      this.initialize();
    }
    return new Map(this.adapters);
  }
}
