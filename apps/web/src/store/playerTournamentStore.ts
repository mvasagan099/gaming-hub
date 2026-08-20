import { create } from 'zustand';
import { createTypedSocket, type TypedSocket } from '@gaming-hub/socket';
import {
  isStaleStateVersion,
  isStateVersionGap,
  type TournamentDetail,
  type TournamentBracket,
  type TournamentPlayerStatus,
  type TournamentCurrentMatchResponse,
} from '@gaming-hub/shared';
import { useAuthStore } from './authStore';
import { tournamentsApi } from '../services/api/enterprise';
import { walletApi } from '../services/api/enterprise';

function getSocketUrl(): string {
  const envUrl = (import.meta.env.VITE_SOCKET_URL as string | undefined) || 'http://localhost:4001';
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return envUrl.replace('localhost', window.location.hostname).replace('127.0.0.1', window.location.hostname);
  }
  return envUrl;
}

export interface PlayerTournamentEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

interface PlayerTournamentState {
  socket: TypedSocket | null;
  connected: boolean;
  stateVersion: number;

  detail: TournamentDetail | null;
  bracket: TournamentBracket | null;
  myStatus: TournamentPlayerStatus | null;
  currentMatch: TournamentCurrentMatchResponse | null;
  walletBalance: number | null;
  events: PlayerTournamentEvent[];
  isLoading: boolean;
  error: string | null;

  subscribe: (tournamentId: string) => void;
  unsubscribe: () => void;
  fetchAll: (tournamentId: string) => Promise<void>;
  refreshDetail: (tournamentId: string) => Promise<void>;
  refreshBracket: (tournamentId: string) => Promise<void>;
  refreshMyStatus: (tournamentId: string) => Promise<void>;
  refreshCurrentMatch: (tournamentId: string) => Promise<void>;
  fetchWallet: () => Promise<void>;
  handleStateVersion: (version: number, tournamentId: string) => Promise<boolean>;
  addEvent: (event: PlayerTournamentEvent) => void;
  clearError: () => void;
  setLoading: (v: boolean) => void;
  reset: () => void;
}

let eventCounter = 0;

export const usePlayerTournamentStore = create<PlayerTournamentState>((set, get) => ({
  socket: null,
  connected: false,
  stateVersion: 0,

  detail: null,
  bracket: null,
  myStatus: null,
  currentMatch: null,
  walletBalance: null,
  events: [],
  isLoading: false,
  error: null,

  subscribe: (tournamentId: string) => {
    const existing = get().socket;
    if (existing) existing.disconnect();

    const socket = createTypedSocket({
      url: getSocketUrl(),
      token: () => useAuthStore.getState().session?.access_token ?? null,
    });

    socket.on('connect', () => {
      set({ connected: true });
      socket.emit('tournament:subscribe', { tournamentId });
    });

    socket.on('disconnect', () => set({ connected: false }));

    const handleTournamentEvent = (type: string, data: Record<string, unknown>) => {
      if ((data as { tournamentId?: string }).tournamentId !== tournamentId) return;
      const evtType = data.eventType as string | undefined;
      const msg = data.message as string | undefined;
      get().addEvent({
        id: `evt_${++eventCounter}`,
        type: evtType ?? type,
        message: msg ?? type,
        timestamp: new Date().toISOString(),
        meta: data,
      });
    };

    socket.on('tournament:updated', (data: Record<string, unknown>) => {
      handleTournamentEvent('tournament:updated', data);
      const version = data.stateVersion as number | undefined;
      if (version != null) {
        get().handleStateVersion(version, tournamentId);
      }
    });

    socket.on('tournament:match-created', (data: Record<string, unknown>) => {
      handleTournamentEvent('tournament:match-created', data);
      get().refreshBracket(tournamentId);
      get().refreshMyStatus(tournamentId);
      get().refreshCurrentMatch(tournamentId);
    });

    socket.on('tournament:match-started', (data: Record<string, unknown>) => {
      handleTournamentEvent('tournament:match-started', data);
      get().refreshBracket(tournamentId);
      get().refreshCurrentMatch(tournamentId);
    });

    socket.on('tournament:match-completed', (data: Record<string, unknown>) => {
      handleTournamentEvent('tournament:match-completed', data);
      get().refreshBracket(tournamentId);
      get().refreshMyStatus(tournamentId);
      get().refreshCurrentMatch(tournamentId);
    });

    socket.on('tournament:player-advanced', (data: Record<string, unknown>) => {
      handleTournamentEvent('tournament:player-advanced', data);
      get().refreshMyStatus(tournamentId);
      get().refreshBracket(tournamentId);
      get().refreshCurrentMatch(tournamentId);
    });

    socket.on('tournament:player-eliminated', (data: Record<string, unknown>) => {
      handleTournamentEvent('tournament:player-eliminated', data);
      get().refreshMyStatus(tournamentId);
      get().refreshBracket(tournamentId);
    });

    socket.on('tournament:final-started', (data: Record<string, unknown>) => {
      handleTournamentEvent('tournament:final-started', data);
      get().refreshBracket(tournamentId);
      get().refreshCurrentMatch(tournamentId);
    });

    socket.on('tournament:completed', (data: Record<string, unknown>) => {
      handleTournamentEvent('tournament:completed', data);
      get().refreshDetail(tournamentId);
      get().refreshMyStatus(tournamentId);
    });

    socket.on('tournament:settlement-completed', (data: Record<string, unknown>) => {
      handleTournamentEvent('tournament:settlement-completed', data);
      get().refreshDetail(tournamentId);
      get().refreshMyStatus(tournamentId);
      get().fetchWallet();
    });

    set({ socket });
  },

  unsubscribe: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false });
    }
  },

  fetchAll: async (tournamentId: string) => {
    set({ isLoading: true, error: null });
    try {
      const [state, currentMatch, wallet] = await Promise.allSettled([
        tournamentsApi.state(tournamentId),
        tournamentsApi.currentMatch(tournamentId).catch(() => null),
        walletApi.summary(),
      ]);

      if (state.status === 'fulfilled') {
        const { detail, bracket, myStatus } = state.value;
        set({
          detail,
          bracket,
          myStatus,
          stateVersion: detail.stateVersion ?? 0,
        });
      }

      if (currentMatch.status === 'fulfilled' && currentMatch.value) {
        set({ currentMatch: currentMatch.value });
      }

      if (wallet.status === 'fulfilled') {
        set({ walletBalance: wallet.value.balance });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load tournament' });
    } finally {
      set({ isLoading: false });
    }
  },

  refreshDetail: async (tournamentId: string) => {
    try {
      const detail = await tournamentsApi.detail(tournamentId);
      set({ detail, stateVersion: detail.stateVersion ?? get().stateVersion });
    } catch { /* swallow */ }
  },

  refreshBracket: async (tournamentId: string) => {
    try {
      const bracket = await tournamentsApi.bracket(tournamentId);
      set({ bracket });
    } catch { /* bracket may not exist yet */ }
  },

  refreshMyStatus: async (tournamentId: string) => {
    try {
      const myStatus = await tournamentsApi.myStatus(tournamentId);
      set({ myStatus });
    } catch { /* swallow */ }
  },

  refreshCurrentMatch: async (tournamentId: string) => {
    try {
      const currentMatch = await tournamentsApi.currentMatch(tournamentId);
      set({ currentMatch });
    } catch {
      set({ currentMatch: null });
    }
  },

  fetchWallet: async () => {
    try {
      const wallet = await walletApi.summary();
      set({ walletBalance: wallet.balance });
    } catch { /* swallow */ }
  },

  handleStateVersion: async (version: number, tournamentId: string) => {
    const current = get().stateVersion;
    if (isStaleStateVersion(version, current)) return false;
    if (isStateVersionGap(version, current)) {
      await get().fetchAll(tournamentId);
      return false;
    }
    set({ stateVersion: version });
    return true;
  },

  addEvent: (event: PlayerTournamentEvent) => {
    set((state) => ({
      events: [event, ...state.events].slice(0, 50),
    }));
  },

  clearError: () => set({ error: null }),

  setLoading: (v: boolean) => set({ isLoading: v }),

  reset: () => {
    get().unsubscribe();
    set({
      detail: null,
      bracket: null,
      myStatus: null,
      currentMatch: null,
      walletBalance: null,
      events: [],
      stateVersion: 0,
      error: null,
    });
  },
}));
