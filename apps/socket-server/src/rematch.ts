import type { MultiplayerFramework } from "@gaming-hub/multiplayer";
import { authenticateToken } from "./auth";
import { assertFeatureEnabled, assertGameEnabled } from "./settings";

/** Socket entry point shared by current and legacy rematch events. */
export async function requestSocketRematch(
  framework: MultiplayerFramework,
  roomId: string,
  connectionUserId: string,
  token: string | undefined,
) {
  const room = await authenticateRematchParticipant(framework, roomId, connectionUserId, token);
  await assertFeatureEnabled("games.enabled", "Games");
  await assertFeatureEnabled(room.config.stake > 0 ? "games.realMoney" : "games.practice", room.config.stake > 0 ? "Real-money play" : "Practice mode");
  await assertGameEnabled(room.config.gameId, room.config.stake);
  return framework.matchManager.requestRematch(roomId, connectionUserId);
}

export async function declineSocketRematch(
  framework: MultiplayerFramework, roomId: string, connectionUserId: string, token: string | undefined,
) {
  await authenticateRematchParticipant(framework, roomId, connectionUserId, token);
  return framework.matchManager.declineRematch(roomId, connectionUserId);
}

async function authenticateRematchParticipant(
  framework: MultiplayerFramework, roomId: string, connectionUserId: string, token: string | undefined,
) {
  // A connection may outlive its JWT, session or account eligibility.
  if (!token) throw new Error("UNAUTHORIZED");
  const authenticated = await authenticateToken(token);
  if (authenticated.userId !== connectionUserId) throw new Error("UNAUTHORIZED");
  const room = framework.roomManager.getRoom(roomId);
  const participant = room?.players.get(authenticated.userId);
  if (!room || !participant || participant.isSpectator) throw new Error("UNAUTHORIZED");
  return room;
}
