import { useAuthStore } from "../../store/authStore";
import { apiClient, ApiError } from "./client";

export const WALLET_CHANGED_EVENT = "gaming-hub:wallet-changed";

export interface PracticeRewardResult {
  claimed: boolean;
  amount: number;
  balance: number;
  remainingToday: number;
}

export function notifyWalletChanged(): void {
  window.dispatchEvent(new CustomEvent(WALLET_CHANGED_EVENT));
}

const rewardCooldowns = new Map<string, number>();
const REWARD_COOLDOWN_MS = 2000;

/**
 * Claims the 50-coin practice reward for beating the AI in `gameId`.
 * Returns null when unauthenticated or the call failed (e.g. rate-limited).
 * Dispatches WALLET_CHANGED_EVENT on success so the UI balance can refresh.
 */
export async function claimPracticeReward(gameId: string): Promise<PracticeRewardResult | null> {
  const now = Date.now();
  const cooldownUntil = rewardCooldowns.get(gameId) ?? 0;
  if (now < cooldownUntil) return null;

  if (!useAuthStore.getState().session) return null;

  rewardCooldowns.set(gameId, now + REWARD_COOLDOWN_MS);

  try {
    const result = await apiClient.post<PracticeRewardResult>("/wallet/practice-reward", { gameId });
    if (result.claimed) {
      notifyWalletChanged();
    }
    return result;
  } catch (err) {
    rewardCooldowns.delete(gameId);
    if (err instanceof ApiError && err.status === 401) {
      return null;
    }
    if (!(err instanceof ApiError && err.status === 429)) {
      console.error(`Failed to claim practice reward for ${gameId}:`, err);
    }
    return null;
  }
}
