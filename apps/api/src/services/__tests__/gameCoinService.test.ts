import { describe, expect, it, beforeEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { GameCoinService } from "../gameCoinService";

describe("GameCoinService", () => {
  it("provides centralized configuration for all online games", () => {
    const carromConfig = GameCoinService.getGameConfig("carrom");
    expect(carromConfig.gameId).toBe("carrom");
    expect(carromConfig.defaultEntryFee).toBe(100);
    expect(carromConfig.currency).toBe("COINS");
    expect(carromConfig.minPlayers).toBe(2);

    const ttConfig = GameCoinService.getGameConfig("table-tennis");
    expect(ttConfig.gameId).toBe("table-tennis");
    expect(ttConfig.defaultEntryFee).toBe(100);

    const ludoConfig = GameCoinService.getGameConfig("ludo");
    expect(ludoConfig.gameId).toBe("ludo");
  });

  describe("checkPlayerBalance", () => {
    it("accepts 0 entry fee (offline/practice) without error", async () => {
      const res = await GameCoinService.checkPlayerBalance("any-player", 0);
      expect(res.ok).toBe(true);
    });

    it("rejects when player does not exist", async () => {
      await expect(
        GameCoinService.checkPlayerBalance("non-existent-user-12345", 100),
      ).rejects.toThrow();
    });
  });
});
