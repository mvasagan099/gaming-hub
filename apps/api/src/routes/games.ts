import type { FastifyInstance } from "fastify";
import { isGameId, type GameId } from "@gaming-hub/shared";
import { GameConfigService } from "../services/gameConfigService";
import { AppError } from "@gaming-hub/shared";
import { routeParams } from "../lib/http";

export async function gamesRoutes(app: FastifyInstance) {
  /**
   * GET /api/games
   * Returns available games with current configuration for the frontend game list.
   */
  app.get("/api/games", async () => {
    return GameConfigService.getAvailableGamesForUser();
  });

  /**
   * GET /api/games/:gameId/config
   * Returns current configuration and allowed entry fees for a specific game.
   */
  app.get("/api/games/:gameId/config", async (request) => {
    const { gameId } = routeParams(request);
    if (!isGameId(gameId as GameId)) {
      throw new AppError("NOT_FOUND", `Game '${gameId}' not found`, 404);
    }
    return GameConfigService.getGameConfig(gameId as GameId);
  });
}
