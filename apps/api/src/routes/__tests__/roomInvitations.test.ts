import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { prisma } from '@gaming-hub/db';
import { GAME_IDS } from '@gaming-hub/shared';
import { buildApp } from '../../app';
import { resetTestDatabase } from '../../../test/db';
import { createTestUser } from '../../../test/helpers';
import { socketBridge, resetSocketBridge } from '../../services/socketBridge';
const app = buildApp();
beforeAll(async () => { await app.ready(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetTestDatabase(); resetSocketBridge(); });
async function setup(gameId = 'table-tennis') {
  const owner = await createTestUser(), friend = await createTestUser(), stranger = await createTestUser();
  await prisma.friend.create({ data: { requesterId: owner.id, addresseeId: friend.id, status: 'ACCEPTED' } });
  const snapshot = { room: { id: 'room-1', code: 'ABC123', status: 'waiting', expiresAt: Date.now()+600000, locked: false,
    config: { gameId, stake: 100, isPrivate: true, maxPlayers: 2, password: '', settings: {} as Record<string, unknown> } }, players: [{ id: owner.id }] };
  await prisma.liveRoomCheckpoint.create({ data: { id: 'room-1', code: 'ABC123', snapshot } });
  const send = (user = owner, target = friend.id) => app.inject({ method: 'POST', url: '/api/room-invitations', headers: { authorization: `Bearer ${user.token}` }, payload: { roomId: 'room-1', friendId: target } });
  const pending = (user = friend) => app.inject({ method: 'GET', url: '/api/room-invitations', headers: { authorization: `Bearer ${user.token}` } });
  const respond = (id: string, accepted: boolean, user = friend) => app.inject({ method: 'POST', url: `/api/room-invitations/${id}/respond`, headers: { authorization: `Bearer ${user.token}` }, payload: { accepted } });
  const save = () => prisma.liveRoomCheckpoint.update({ where: { id: 'room-1' }, data: { snapshot } });
  return { owner, friend, stranger, snapshot, send, pending, respond, save };
}
describe('private room invitation flow', () => {
  it.each(GAME_IDS)('%s invites a friend with the correct room and stake, without moving money', async gameId => {
    const fixture = await setup(gameId);
    const before = await prisma.wallet.findUniqueOrThrow({ where: { userId: fixture.friend.id } });
    expect((await fixture.send()).statusCode).toBe(200);
    const pending = await fixture.pending();
    expect(pending.json().items).toHaveLength(1);
    expect(pending.json().items[0]).toMatchObject({ code: 'ABC123', gameId, stake: 100, senderId: fixture.owner.id, roomId: 'room-1' });
    expect(socketBridge.calls).toContainEqual(expect.objectContaining({ userId: fixture.friend.id, event: 'room:invitation' }));
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: fixture.friend.id } })).balance).toBe(before.balance);
    expect(await prisma.transaction.count()).toBe(0);
  });
  it('requires actual friendship and room membership', async () => {
    const f = await setup();
    expect((await f.send(f.stranger)).statusCode).toBe(403);
    await prisma.friend.create({ data: { requesterId: f.stranger.id, addresseeId: f.friend.id, status: 'ACCEPTED' } });
    expect((await f.send(f.stranger)).statusCode).toBe(409);
    expect((await f.send(f.owner, f.owner.id)).statusCode).toBe(422);
  });
  it('prevents blocked friends from sending or resolving invitations', async () => {
    const f = await setup(); await f.send();
    const invitation = (await f.pending()).json().items[0];
    await prisma.blockedUser.create({ data: { blockerId: f.friend.id, blockedId: f.owner.id } });
    expect((await f.send()).statusCode).toBe(403);
    expect((await f.pending()).json().items).toEqual([]);
    const resolve = await app.inject({ method: 'GET', url: `/api/room-invitations/${invitation.id}`, headers: { authorization: `Bearer ${f.friend.token}` } });
    expect(resolve.statusCode).toBe(403);
  });
  it.each(['full', 'started', 'closed', 'public', 'owner-left', 'expired-room', 'locked', 'password', 'tournament'])('rejects invitations to an unavailable room: %s', async condition => {
    const f = await setup();
    if (condition === 'full') f.snapshot.players.push({ id: f.stranger.id });
    if (condition === 'started') f.snapshot.room.status = 'playing';
    if (condition === 'closed') await prisma.liveRoomCheckpoint.update({ where: { id: 'room-1' }, data: { closed: true } });
    if (condition === 'public') f.snapshot.room.config.isPrivate = false;
    if (condition === 'owner-left') f.snapshot.players = [];
    if (condition === 'expired-room') f.snapshot.room.expiresAt = Date.now()-1;
    if (condition === 'locked') f.snapshot.room.locked = true;
    if (condition === 'password') f.snapshot.room.config.password = 'private-password';
    if (condition === 'tournament') f.snapshot.room.config.settings.tournamentId = 'tournament-1';
    await f.save();
    expect((await f.send()).statusCode).toBe(409);
  });
  it('deduplicates simultaneous invitations', async () => {
    const f = await setup();
    const results = await Promise.all([f.send(), f.send(), f.send()]);
    expect(results.map(result => result.statusCode)).toEqual([200, 200, 200]);
    expect(await prisma.appNotification.count({ where: { type: 'MATCH_INVITE' } })).toBe(1);
  });
  it('only allows the recipient to respond, and acceptance requires a successful join', async () => {
    const f = await setup(); await f.send();
    const invitation = (await f.pending()).json().items[0];
    expect((await f.respond(invitation.id, false, f.stranger)).statusCode).toBe(404);
    expect((await f.respond(invitation.id, true)).statusCode).toBe(409);
    f.snapshot.players.push({ id: f.friend.id }); await f.save();
    expect((await f.respond(invitation.id, true)).statusCode).toBe(200);
    expect((await f.pending()).json().items).toEqual([]);
  });
  it('keeps the join request available after its notification is read', async () => {
    const f = await setup(); await f.send();
    const invitation = (await f.pending()).json().items[0];
    await prisma.appNotification.update({ where: { id: invitation.id }, data: { readAt: new Date() } });
    expect((await f.pending()).json().items).toHaveLength(1);
    expect((await f.respond(invitation.id, false)).statusCode).toBe(200);
    expect((await f.pending()).json().items).toEqual([]);
  });
  it('declines without joining and persists the response across devices', async () => {
    const f = await setup(); await f.send();
    const invitation = (await f.pending()).json().items[0];
    expect((await f.respond(invitation.id, false)).statusCode).toBe(200);
    expect((await f.pending()).json().items).toEqual([]);
    expect((await prisma.liveRoomCheckpoint.findUniqueOrThrow({ where: { id: 'room-1' } })).snapshot).toMatchObject({ players: [{ id: f.owner.id }] });
  });
  it('revalidates room capacity and expiry before accepting a delivered invitation', async () => {
    const f = await setup(); await f.send();
    const invitation = (await f.pending()).json().items[0];
    f.snapshot.room.status = 'playing'; await f.save();
    expect((await f.pending()).json().items).toEqual([]);
    const resolve = await app.inject({ method: 'GET', url: `/api/room-invitations/${invitation.id}`, headers: { authorization: `Bearer ${f.friend.token}` } });
    expect(resolve.statusCode).toBe(409);
    await prisma.appNotification.update({ where: { id: invitation.id }, data: { data: { ...invitation, expiresAt: new Date(Date.now()-1000).toISOString() } } });
    const expired = await app.inject({ method: 'GET', url: `/api/room-invitations/${invitation.id}`, headers: { authorization: `Bearer ${f.friend.token}` } });
    expect(expired.statusCode).toBe(410);
  });
  it('allows acknowledgement retries after the joined room closes without changing the response', async () => {
    const f = await setup(); await f.send();
    const invitation = (await f.pending()).json().items[0];
    f.snapshot.players.push({ id: f.friend.id }); await f.save();
    expect((await f.respond(invitation.id, true)).statusCode).toBe(200);
    await prisma.liveRoomCheckpoint.update({ where: { id: 'room-1' }, data: { closed: true } });
    expect((await f.respond(invitation.id, true)).statusCode).toBe(200);
    expect((await f.respond(invitation.id, false)).statusCode).toBe(409);
  });
  it('keeps simultaneous conflicting responses consistent', async () => {
    const f = await setup(); await f.send();
    const invitation = (await f.pending()).json().items[0];
    f.snapshot.players.push({ id: f.friend.id }); await f.save();
    const results = await Promise.all([f.respond(invitation.id, true), f.respond(invitation.id, false)]);
    expect(results.map(result => result.statusCode).sort()).toEqual([200, 409]);
    const saved = await prisma.appNotification.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(saved.data).toMatchObject({ response: results[0].statusCode === 200 ? 'ACCEPTED' : 'DECLINED' });
  });

  it('reports the resend cooldown instead of claiming a declined request was delivered', async () => {
    const f = await setup(); await f.send();
    const invitation = (await f.pending()).json().items[0];
    expect((await f.respond(invitation.id, false)).statusCode).toBe(200);
    expect((await f.send()).statusCode).toBe(429);
    expect((await f.pending()).json().items).toEqual([]);
    expect(await prisma.appNotification.count({ where: { type: 'MATCH_INVITE' } })).toBe(1);
  });

});
