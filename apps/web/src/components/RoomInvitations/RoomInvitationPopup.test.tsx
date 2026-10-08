import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ states: [] as any[], refs: [] as any[], stateIndex: 0, refIndex: 0,
  effects: [] as Array<() => void | (() => void)>, pathname: '/', room: null as any, status: 'connected',
  navigate: vi.fn(), connect: vi.fn(), joinRoom: vi.fn(), pending: vi.fn(), resolve: vi.fn(), respond: vi.fn(), socket: { on: vi.fn(), off: vi.fn() } }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return { ...actual, useCallback: (callback: any) => callback,
    useEffect: (effect: any) => fixture.effects.push(effect),
    useRef: (value: any) => fixture.refs[fixture.refIndex++] ??= { current: value },
    useState: (value: any) => { const index = fixture.stateIndex++; if (!(index in fixture.states)) fixture.states[index] = value;
      return [fixture.states[index], (next: any) => { fixture.states[index] = typeof next === 'function' ? next(fixture.states[index]) : next; }]; },
  };
});
vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: fixture.pathname }), useNavigate: () => fixture.navigate }));
vi.mock('../ui/Modal', () => ({ Modal: () => null }));
vi.mock('../../store/authStore', () => ({ useAuthStore: (selector: any) => selector({ session: {} }) }));
vi.mock('../../store/multiplayerStore', () => ({ useMultiplayerStore: Object.assign((selector: any) => selector({ socket: fixture.socket,
  status: fixture.status, room: fixture.room, connect: fixture.connect }), { getState: () => ({ joinRoom: fixture.joinRoom, room: fixture.room, status: fixture.status }) }) }));
vi.mock('../../services/api/roomInvitations', () => ({ roomInvitationsApi: { pending: fixture.pending, resolve: fixture.resolve, respond: fixture.respond } }));
import { RoomInvitationPopup } from './RoomInvitationPopup';
const invitation = { id: 'invite-1', roomId: 'room-1', code: 'ABC123', gameId: 'carrom', stake: 100, senderName: 'Friend', expiresAt: new Date(Date.now()+300000).toISOString() };
function render() { fixture.stateIndex = fixture.refIndex = 0; return RoomInvitationPopup() as React.ReactElement<any>; }
function buttons(node: any): any[] { if (Array.isArray(node)) return node.flatMap(buttons); if (!node?.props) return []; return node.type === 'button' ? [node] : buttons(node.props.children); }
const accept = (page = render()) => buttons(page)[1].props;
const decline = (page = render()) => buttons(page)[0].props;
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
beforeEach(() => {
  vi.clearAllMocks(); fixture.states = [[invitation]]; fixture.refs = []; fixture.effects = [];
  fixture.pathname = '/'; fixture.room = null; fixture.status = 'connected';
  fixture.pending.mockResolvedValue({ items: [invitation] }); fixture.resolve.mockResolvedValue(invitation);
  fixture.respond.mockResolvedValue({ responded: true }); fixture.joinRoom.mockResolvedValue({ id: 'room-1' });
  vi.stubGlobal('window', { setInterval: vi.fn(() => 1), clearInterval: vi.fn() });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
describe('private room join request popup', () => {
  it('shows the invited game and stake before accepting', () => {
    const page = render(); expect(JSON.stringify(page.props.children)).toContain('100');
    expect(accept(page).disabled).toBe(false); expect(fixture.joinRoom).not.toHaveBeenCalled();
  });
  it('accepts once using authoritative join, then opens the correct lobby', async () => {
    const action = accept().onClick;
    action(); action(); await flush();
    expect(fixture.resolve).toHaveBeenCalledExactlyOnceWith('invite-1');
    expect(fixture.joinRoom).toHaveBeenCalledExactlyOnceWith({ roomId: 'room-1' });
    expect(fixture.respond).toHaveBeenCalledExactlyOnceWith('invite-1', true);
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/lobby/carrom');
    expect(fixture.states[0]).toEqual([]);
  });
  it('declines without joining or navigating', async () => {
    decline().onClick(); await flush();
    expect(fixture.respond).toHaveBeenCalledExactlyOnceWith('invite-1', false);
    expect(fixture.joinRoom).not.toHaveBeenCalled(); expect(fixture.navigate).not.toHaveBeenCalled();
  });
  it.each(['playing', 'room', 'disconnected'])('does not interrupt an existing game or join before connecting: %s', condition => {
    if (condition === 'playing') fixture.pathname = '/games/chess';
    if (condition === 'room') fixture.room = { id: 'other-room' };
    if (condition === 'disconnected') fixture.status = 'connecting';
    const props = accept(); expect(props.disabled).toBe(true); props.onClick();
    expect(fixture.resolve).not.toHaveBeenCalled(); expect(fixture.joinRoom).not.toHaveBeenCalled();
  });
  it('shows stale/full-room errors and never records acceptance after a failed join', async () => {
    fixture.joinRoom.mockRejectedValue(new Error('Room is full'));
    accept().onClick(); await flush();
    expect(fixture.states[1]).toBe('Room is full'); expect(fixture.respond).not.toHaveBeenCalled();
    expect(fixture.navigate).not.toHaveBeenCalled();
  });
  it('still opens the joined room when notification acknowledgement fails', async () => {
    fixture.respond.mockRejectedValue(new Error('Temporary outage'));
    accept().onClick(); await flush();
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/lobby/carrom');
  });
  it('listens for immediate invitations and cleans up listeners and polling', async () => {
    render(); const cleanup = fixture.effects[0]() as () => void;
    const socketCleanup = fixture.effects[1]() as () => void; await flush();
    expect(fixture.connect).toHaveBeenCalledOnce();
    expect(fixture.socket.on).toHaveBeenCalledWith('room:invitation', expect.any(Function));
    const event = fixture.socket.on.mock.calls.find(call => call[0] === 'room:invitation')![1]; event(); await flush();
    expect(fixture.pending).toHaveBeenCalledTimes(2);
    cleanup(); socketCleanup();
    expect(window.clearInterval).toHaveBeenCalledWith(1);
    expect(fixture.socket.off).toHaveBeenCalledWith('room:invitation', event);
  });
});

it('joins without waiting for a slow notification acknowledgement', async () => {
  fixture.respond.mockImplementation(() => new Promise(() => {}));
  accept().onClick(); await flush();
  expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/lobby/carrom');
  expect(fixture.states[2]).toBe(false);
});

it.each(['room', 'game', 'connection'])('rechecks context after resolving an invitation: %s', async condition => {
  let resolve: (value: any) => void = () => {};
  fixture.resolve.mockImplementation(() => new Promise(done => { resolve = done; }));
  accept().onClick();
  if (condition === 'room') fixture.room = { id: 'new-room' };
  if (condition === 'game') { fixture.pathname = '/games/chess'; render(); }
  if (condition === 'connection') fixture.status = 'reconnecting';
  resolve(invitation); await flush();
  expect(fixture.joinRoom).not.toHaveBeenCalled();
  expect(fixture.navigate).not.toHaveBeenCalled();
});

it('ignores an invitation resolved after the session effect is disposed', async () => {
  let resolve: (value: any) => void = () => {};
  fixture.resolve.mockImplementation(() => new Promise(done => { resolve = done; }));
  render(); const cleanup = fixture.effects[0]() as () => void; await flush();
  accept().onClick(); cleanup(); resolve(invitation); await flush();
  expect(fixture.joinRoom).not.toHaveBeenCalled();
  expect(fixture.navigate).not.toHaveBeenCalled();
});

it('refreshes again when a notification arrives during an in-flight load', async () => {
  let resolve: (value: any) => void = () => {};
  fixture.pending.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  render(); fixture.effects[0](); fixture.effects[1]();
  const event = fixture.socket.on.mock.calls.find(call => call[0] === 'room:invitation')![1];
  event(); event();
  expect(fixture.pending).toHaveBeenCalledOnce();
  resolve({ items: [] }); await flush();
  expect(fixture.pending).toHaveBeenCalledTimes(2);
});

it('does not redirect over navigation that occurred while joining', async () => {
  let resolve: (value: any) => void = () => {};
  fixture.joinRoom.mockImplementation(() => new Promise(done => { resolve = done; }));
  accept().onClick(); await flush();
  fixture.pathname = '/profile'; render();
  resolve({ id: 'room-1' }); await flush();
  expect(fixture.respond).toHaveBeenCalledExactlyOnceWith('invite-1', true);
  expect(fixture.navigate).not.toHaveBeenCalled();
});

it('does not redisplay a handled request from an older pending refresh', async () => {
  let resolve: (value: any) => void = () => {};
  fixture.pending.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  render(); fixture.effects[0]();
  fixture.states[0] = [invitation];
  decline().onClick(); await flush();
  resolve({ items: [invitation] }); await flush();
  expect(fixture.states[0]).toEqual([]);
});
