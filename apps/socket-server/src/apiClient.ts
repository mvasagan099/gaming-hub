import { env } from "./env";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function internalRequest<T>(
  method: "POST",
  path: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(`${env.API_URL}${path}`, {
    method,
    headers: {
      "x-internal-key": env.INTERNAL_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10_000),
  });

  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>;

  if (!response.ok || !body.ok) {
    const message = body.error?.message ?? `Internal API error ${response.status}`;
    throw new Error(message);
  }

  return body.data as T;
}

/** Debits every participant's entry stake and marks the match ACTIVE. */
export function holdWagers(matchId: string) {
  return internalRequest<{ ok: true; status: string }>(
    "POST",
    `/internal/matches/${matchId}/hold-wagers`,
  );
}

/** Credits winners, updates stats/achievements and marks the match FINISHED. */
export function settleMatch(
  matchId: string,
  options: {
    winnerIds?: string[];
    scores?: Record<string, number>;
    resultType?: "WIN" | "LOSS" | "DRAW" | "FORFEIT";
    rated?: boolean;
    reason?: string;
  } = {},
) {
  return internalRequest<{
    ok: true;
    result: {
      matchId: string;
      winners: string[];
      pot: number;
      payouts: { userId: string; amount: number }[];
      newlyUnlocked: { code: string; title: string; icon: string }[];
    };
  }>("POST", `/internal/matches/${matchId}/settle`, options);
}

/** Cancels a match and refunds entry wagers safely. */
export function cancelMatch(matchId: string, reason?: string) {
  return internalRequest<{ ok: true; status: string }>(
    "POST",
    `/internal/matches/${matchId}/cancel`,
    { reason },
  );
}

/**
 * Reports the result of a tournament match to the API, which drives
 * automatic bracket advancement, round completion, and settlement.
 * Fire-and-forget: failures are logged but do not break the game flow.
 */
export function reportTournamentMatchResult(params: {
  matchId: string;
  tournamentId: string;
  roundId: string;
  winnerId: string;
  loserId?: string;
  scores?: Record<string, number>;
}) {
  return internalRequest<{ ok: true }>(
    "POST",
    "/internal/tournament/match-result",
    params as Record<string, unknown>,
  );
}

