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
 * Practice matches are 100% free with no coins deducted and no coins rewarded.
 */
export async function claimPracticeReward(_gameId: string): Promise<PracticeRewardResult | null> {
  return {
    claimed: false,
    amount: 0,
    balance: 0,
    remainingToday: 0,
  };
}
