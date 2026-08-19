import { create } from 'zustand';
import { createTypedSocket, type TypedSocket } from '@gaming-hub/socket';
import { useAuthStore } from './authStore';

function getSocketUrl(): string {
  const envUrl = (import.meta.env.VITE_SOCKET_URL as string | undefined) || 'http://localhost:4001';
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return envUrl.replace('localhost', window.location.hostname).replace('127.0.0.1', window.location.hostname);
  }
  return envUrl;
}

function getSocketToken(): string | undefined {
  return useAuthStore.getState().session?.access_token;
}

interface AdminTournamentState {
  socket: TypedSocket | null;
  stateVersion: number;
  events: TournamentEvent[];
  connected: boolean;

  connect: (tournamentId: string) => void;
  disconnect: () => void;
  handleStateVersion: (version: number) => boolean;
  addEvent: (event: TournamentEvent) => void;
}

export interface TournamentEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

let eventCounter = 0;

export const useAdminTournamentStore = create<AdminTournamentState>((set, get) => ({
  socket: null,
  stateVersion: 0,
  events: [],
  connected: false,

  connect: (tournamentId: string) => {
    const existing = get().socket;
    if (existing) {
      existing.disconnect();
    }

    const token = getSocketToken();
    if (!token) return;

    const socket = createTypedSocket(getSocketUrl(), {
      auth: { token },
    });

    socket.on('connect', () => {
      set({ connected: true });
      socket.emit('tournament:subscribe', { tournamentId });
    });

    socket.on('disconnect', () => {
      set({ connected: false });
    });

    socket.on('tournament:updated', (data: { tournamentId: string; stateVersion: number }) => {
      if (data.tournamentId !== tournamentId) return;
      set({ stateVersion: data.stateVersion });
      get().addEvent({
        id: `evt_${++eventCounter}`,
        type: 'tournament:updated',
        message: 'Tournament state updated',
        timestamp: new Date().toISOString(),
        meta: data,
      });
    });

    socket.on('tournament:match-created', (data: { tournamentId: string; matchId: string; roundNumber: number }) => {
      if (data.tournamentId !== tournamentId) return;
      get().addEvent({
        id: `evt_${++eventCounter}`,
        type: 'tournament:match-created',
        message: `Round ${data.roundNumber} match created`,
        timestamp: new Date().toISOString(),
        meta: data,
      });
    });

    socket.on('tournament:match-started', (data: { tournamentId: string; matchId: string }) => {
      if (data.tournamentId !== tournamentId) return;
      get().addEvent({
        id: `evt_${++eventCounter}`,
        type: 'tournament:match-started',
        message: 'Match started',
        timestamp: new Date().toISOString(),
        meta: data,
      });
    });

    socket.on('tournament:match-completed', (data: { tournamentId: string; matchId: string }) => {
      if (data.tournamentId !== tournamentId) return;
      get().addEvent({
        id: `evt_${++eventCounter}`,
        type: 'tournament:match-completed',
        message: 'Match completed',
        timestamp: new Date().toISOString(),
        meta: data,
      });
    });

    socket.on('tournament:player-advanced', (data: { tournamentId: string; playerId: string }) => {
      if (data.tournamentId !== tournamentId) return;
      get().addEvent({
        id: `evt_${++eventCounter}`,
        type: 'tournament:player-advanced',
        message: 'Player advanced',
        timestamp: new Date().toISOString(),
        meta: data,
      });
    });

    socket.on('tournament:player-eliminated', (data: { tournamentId: string; playerId: string }) => {
      if (data.tournamentId !== tournamentId) return;
      get().addEvent({
        id: `evt_${++eventCounter}`,
        type: 'tournament:player-eliminated',
        message: 'Player eliminated',
        timestamp: new Date().toISOString(),
        meta: data,
      });
    });

    socket.on('tournament:completed', (data: { tournamentId: string }) => {
      if (data.tournamentId !== tournamentId) return;
      get().addEvent({
        id: `evt_${++eventCounter}`,
        type: 'tournament:completed',
        message: 'Tournament completed',
        timestamp: new Date().toISOString(),
        meta: data,
      });
    });

    socket.on('tournament:settlement-completed', (data: { tournamentId: string }) => {
      if (data.tournamentId !== tournamentId) return;
      get().addEvent({
        id: `evt_${++eventCounter}`,
        type: 'tournament:settlement-completed',
        message: 'Settlement completed',
        timestamp: new Date().toISOString(),
        meta: data,
      });
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false });
    }
  },

  handleStateVersion: (version: number) => {
    const current = get().stateVersion;
    if (version <= current) return false;
    set({ stateVersion: version });
    return true;
  },

  addEvent: (event: TournamentEvent) => {
    set((state) => ({
      events: [event, ...state.events].slice(0, 100),
    }));
  },
}));
