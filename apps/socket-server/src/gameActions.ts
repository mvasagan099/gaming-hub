import type { MultiplayerFramework } from "@gaming-hub/multiplayer";
import type { JsonObject } from "@gaming-hub/shared";
import { AppError } from "@gaming-hub/shared";

export function applySocketGameAction(
  framework: MultiplayerFramework,
  playerId: string,
  payload: { roomId: string; matchId: string; action: { type: string } & JsonObject },
) {
  if (!payload || typeof payload.matchId !== "string" || !payload.matchId.trim()) {
    throw new AppError("VALIDATION_ERROR", "Current match identity is required", 400);
  }
  return framework.matchManager.applyAction({ roomId: payload.roomId, matchId: payload.matchId, playerId, action: payload.action }).then(result => {
    if (framework.roomManager.getRoom(payload.roomId)?.config.gameId !== "carrom") return result;

    // The authoritative broadcast/reconnect snapshot owns animation data. ACKs
    // are delivery receipts, including when proxied through Redis's bounded RPC.
    // Copy the presentation response; never mutate engine or replay-cache state.
    return {
      ...result,
      state: { ...result.state, lastTrajectory: null },
      events: result.events.map(event => {
        const { keyframes: _keyframes, ...receipt } = event;
        return receipt;
      }),
    };
  });
}
