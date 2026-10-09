import { describe, expect, it, vi } from 'vitest';
const membership = vi.hoisted(() => ({ leaveRoom: vi.fn() }));
vi.mock('phaser', () => ({ default: {} }));
vi.mock('../../store/multiplayerStore', () => ({ useMultiplayerStore: { getState: () => membership } }));
import MultiplayerDriver from './phaser/managers/MultiplayerDriver';
import WinnerPopup from './phaser/ui/WinnerPopup';

describe('Snake & Ladder result-screen Exit', () => {
  it.each(['practice', 'multiplayer'] as const)('%s asks the route to confirm before leaving', mode => {
    membership.leaveRoom.mockClear();
    const requestExit = vi.fn();
    const scene = { registry: { get: vi.fn(() => requestExit) } } as any;
    const view = mode === 'practice' ? new WinnerPopup(scene)
      : new MultiplayerDriver(scene, {} as any, {} as any, {} as any, {} as any,
        {} as any, {} as any, {} as any, {} as any, 0);
    if (mode === 'practice') (view as any).onClose();
    else (view as any).close();
    expect(scene.registry.get).toHaveBeenCalledWith('onExit');
    expect(requestExit).toHaveBeenCalledOnce();
    expect(membership.leaveRoom).not.toHaveBeenCalled();
  });
});
