import { afterEach, describe, expect, it, vi } from 'vitest';

// This membership test must not initialize live authentication/realtime clients.
vi.mock('./authStore', () => ({ useAuthStore: { getState: () => ({ session: null, user: null }) } }));
vi.mock('./walletStore', () => ({ useWalletStore: { getState: () => ({ fetchWallet: vi.fn() }) } }));
vi.mock('../services/api/practiceReward', () => ({ notifyWalletChanged: vi.fn() }));
import { useMultiplayerStore } from './multiplayerStore';

describe('leaving a multiplayer game', () => {
  afterEach(() => {
    useMultiplayerStore.setState({ room: null, socket: null });
  });

  it('clears local membership immediately and sends one leave for repeated requests', async () => {
    let finishLeave: (value: { ok: true; data: undefined }) => void = () => {};
    const acknowledgement = new Promise<{ ok: true; data: undefined }>((resolve) => {
      finishLeave = resolve;
    });
    const emitWithAck = vi.fn(() => acknowledgement);
    useMultiplayerStore.setState({
      room: { id: 'room-1' } as never,
      socket: { emitWithAck } as never,
    });

    const firstLeave = useMultiplayerStore.getState().leaveRoom();
    expect(useMultiplayerStore.getState().room).toBeNull();

    const repeatedLeave = useMultiplayerStore.getState().leaveRoom();
    expect(emitWithAck).toHaveBeenCalledExactlyOnceWith('room:leave', { roomId: 'room-1' });

    finishLeave({ ok: true, data: undefined });
    await Promise.all([firstLeave, repeatedLeave]);
    expect(useMultiplayerStore.getState().room).toBeNull();
  });
});
