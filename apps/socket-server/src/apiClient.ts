import { env } from "./env";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function internalRequest<T>(
  method: "POST",
  path: string,
): Promise<T> {
  const response = await fetch(`${env.API_URL}${path}`, {
    method,
    headers: {
      "x-internal-key": env.INTERNAL_API_KEY,
      "content-type": "application/json",
    },
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
export function settleMatch(matchId: string) {
  return internalRequest<{
    ok: true;
    result: {
      matchId: string;
      winners: string[];
      payouts: { userId: string; amount: number }[];
      newlyUnlocked: { code: string; title: string; icon: string }[];
    };
  }>("POST", `/internal/matches/${matchId}/settle`);
}
