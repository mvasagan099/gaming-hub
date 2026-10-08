import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ states: [] as any[], index: 0, refs: [] as any[], refIndex: 0, effects: [] as any[], list: vi.fn(), send: vi.fn() }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return { ...actual, useEffect: (effect: any) => fixture.effects.push(effect),
    useRef: (value: any) => fixture.refs[fixture.refIndex++] ??= { current: value },
    useState: (value: any) => { const i = fixture.index++; if (!(i in fixture.states)) fixture.states[i] = value;
      return [fixture.states[i], (next: any) => { fixture.states[i] = typeof next === 'function' ? next(fixture.states[i]) : next; }]; },
  };
});
vi.mock('react-router-dom', () => ({ Link: () => null }));
vi.mock('../ui/Modal', () => ({ Modal: () => null }));
vi.mock('../../services/api/enterprise', () => ({ friendsApi: { list: fixture.list } }));
vi.mock('../../services/api/roomInvitations', () => ({ roomInvitationsApi: { send: fixture.send } }));
import { InviteFriendsDialog } from './InviteFriendsDialog';
function render() { fixture.index = fixture.refIndex = 0; return InviteFriendsDialog({ roomId: 'room-1', isOpen: true, onClose: vi.fn() }) as React.ReactElement<any>; }
function findButton(node: any): any { if (Array.isArray(node)) return node.map(findButton).find(Boolean); if (!node?.props) return null; return node.type === 'button' ? node : findButton(node.props.children); }
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
beforeEach(() => { vi.clearAllMocks(); fixture.states = [[{ friend: { userId: 'friend-1', username: 'friend', displayName: 'Friend', isOnline: true } }]];
  fixture.index = fixture.refIndex = 0; fixture.refs = []; fixture.effects = []; fixture.send.mockResolvedValue({ sent: true }); });
describe('invite friend picker', () => {
  it('sends the friend user ID and room ID exactly once', async () => {
    const action = findButton(render()).props.onClick; action(); action(); await flush();
    expect(fixture.send).toHaveBeenCalledExactlyOnceWith('room-1', 'friend-1');
    expect(findButton(render()).props.children).toBe('Sent');
  });
  it('shows send failures without marking the friend as invited', async () => {
    fixture.send.mockRejectedValue(new Error('Room has already started'));
    findButton(render()).props.onClick(); await flush();
    expect(fixture.states[2]).toBe('Room has already started');
    expect(findButton(render()).props.children).toBe('Invite');
  });
  it('ignores friend-list results after the picker closes', async () => {
    let resolve: (value: any) => void = () => {};
    fixture.list.mockImplementation(() => new Promise(done => { resolve = done; }));
    render(); const cleanup = fixture.effects[0](); cleanup(); resolve([]); await flush();
    expect(fixture.states[0]).toHaveLength(1);
  });
  it('ignores a delayed send after the picker closes', async () => {
    let resolve: (value: any) => void = () => {};
    fixture.list.mockResolvedValue(fixture.states[0]);
    fixture.send.mockImplementation(() => new Promise(done => { resolve = done; }));
    render(); const cleanup = fixture.effects[0](); await flush();
    findButton(render()).props.onClick(); cleanup(); resolve({ sent: true }); await flush();
    expect(fixture.states[4]).toEqual([]);
  });

});
