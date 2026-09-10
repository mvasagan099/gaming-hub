import { create } from "zustand";
import { apiClient } from "../services/api/client";
import { notifyWalletChanged } from "../services/api/practiceReward";

export interface WalletState {
  balance: number;
  bonusBalance: number;
  lockedBalance: number;
  rewardBalance: number;
  cashbackBalance: number;
  isLoading: boolean;
  isStale: boolean;
  lastUpdated: string | null;
  error: string | null;

  fetchWallet: () => Promise<void>;
  setAuthoritativeBalance: (payload: {
    balance: number;
    bonusBalance?: number;
    lockedBalance?: number;
    rewardBalance?: number;
    cashbackBalance?: number;
  }) => void;
  resetWallet: () => void;
}

const WALLET_SYNC_CHANNEL = "gaming_hub_wallet_sync";
let broadcastChannel: BroadcastChannel | null = null;

if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    broadcastChannel = new BroadcastChannel(WALLET_SYNC_CHANNEL);
  } catch (err) {
    console.warn("BroadcastChannel not supported/available", err);
  }
}

export const useWalletStore = create<WalletState>((set, get) => {
  // Listen for cross-tab sync messages
  if (broadcastChannel) {
    broadcastChannel.onmessage = (event) => {
      if (event.data?.type === "WALLET_UPDATED" && typeof event.data.balance === "number") {
        set({
          balance: event.data.balance,
          bonusBalance: event.data.bonusBalance ?? get().bonusBalance,
          lockedBalance: event.data.lockedBalance ?? get().lockedBalance,
          rewardBalance: event.data.rewardBalance ?? get().rewardBalance,
          cashbackBalance: event.data.cashbackBalance ?? get().cashbackBalance,
          lastUpdated: new Date().toISOString(),
          isStale: false,
        });
        notifyWalletChanged();
      }
    };
  }

  return {
    balance: 0,
    bonusBalance: 0,
    lockedBalance: 0,
    rewardBalance: 0,
    cashbackBalance: 0,
    isLoading: false,
    isStale: true,
    lastUpdated: null,
    error: null,

    fetchWallet: async () => {
      set({ isLoading: true, error: null });
      try {
        const wallet = await apiClient.get<{
          balance: number;
          bonusBalance: number;
          lockedBalance: number;
          rewardBalance: number;
          cashbackBalance: number;
        }>("/wallet");

        set({
          balance: wallet.balance,
          bonusBalance: wallet.bonusBalance ?? 0,
          lockedBalance: wallet.lockedBalance ?? 0,
          rewardBalance: wallet.rewardBalance ?? 0,
          cashbackBalance: wallet.cashbackBalance ?? 0,
          isLoading: false,
          isStale: false,
          lastUpdated: new Date().toISOString(),
        });

        // Broadcast to other tabs
        if (broadcastChannel) {
          broadcastChannel.postMessage({
            type: "WALLET_UPDATED",
            balance: wallet.balance,
            bonusBalance: wallet.bonusBalance,
            lockedBalance: wallet.lockedBalance,
          });
        }
        notifyWalletChanged();
      } catch (err: any) {
        set({
          isLoading: false,
          error: err?.message || "Failed to load wallet",
          isStale: true,
        });
      }
    },

    setAuthoritativeBalance: (payload) => {
      set({
        balance: payload.balance,
        bonusBalance: payload.bonusBalance ?? get().bonusBalance,
        lockedBalance: payload.lockedBalance ?? get().lockedBalance,
        rewardBalance: payload.rewardBalance ?? get().rewardBalance,
        cashbackBalance: payload.cashbackBalance ?? get().cashbackBalance,
        isStale: false,
        lastUpdated: new Date().toISOString(),
      });

      if (broadcastChannel) {
        broadcastChannel.postMessage({
          type: "WALLET_UPDATED",
          ...payload,
        });
      }
      notifyWalletChanged();
    },

    resetWallet: () => {
      set({
        balance: 0,
        bonusBalance: 0,
        lockedBalance: 0,
        rewardBalance: 0,
        cashbackBalance: 0,
        isLoading: false,
        isStale: true,
        lastUpdated: null,
        error: null,
      });
    },
  };
});
