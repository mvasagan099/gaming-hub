import { prisma, type Prisma } from '@gaming-hub/db';
import { AppError, isGameId } from '@gaming-hub/shared';
import { notifyUserSocket } from './socketBridge';
import { getPrivacySettings } from './privacyService';

type InvitationData = { kind: 'PRIVATE_ROOM_INVITE'; roomId: string; senderId: string; senderName: string; expiresAt: string; gameId: string; code: string; stake: number; response: 'PENDING' | 'ACCEPTED' | 'DECLINED' };
type RoomInfo = { id: string; code: string; gameId: string; stake: number; maxPlayers: number; players: string[]; isPrivate: boolean; status: string; unavailable: boolean };
const unavailable = () => new AppError('INVALID_ACTION', 'This room is full, closed, or has already started.', 409);

async function roomInfo(id: string): Promise<RoomInfo> {
  const checkpoint = await prisma.liveRoomCheckpoint.findUnique({ where: { id } });
  if (checkpoint) {
    const snapshot = checkpoint.snapshot as any;
    const room = snapshot.room, config = room?.config;
    if (!config || !Array.isArray(snapshot.players)) throw unavailable();
    return { id, code: room.code, gameId: config.gameId, stake: config.stake, maxPlayers: config.maxPlayers,
      players: snapshot.players.map((p: { id: string }) => p.id), isPrivate: config.isPrivate, status: room.status,
      unavailable: checkpoint.closed || room.locked || !!config.password || !!config.settings?.tournamentId ||
        (room.expiresAt != null && room.expiresAt <= Date.now()) };
  }
  const room = await prisma.room.findUnique({ where: { id }, include: { players: true } });
  if (!room) throw unavailable();
  return { id, code: room.code, gameId: room.gameId, stake: room.stake, maxPlayers: room.maxPlayers,
    players: room.players.filter(p => !p.isSpectator).map(p => p.userId), isPrivate: room.isPrivate,
    status: room.status.toLowerCase(), unavailable: !!(room.settings as any)?.tournamentId };
}
function assertRoom(room: RoomInfo, senderId: string, recipientId: string) {
  if (!room.isPrivate || !isGameId(room.gameId) || room.unavailable || room.status !== 'waiting' ||
    room.players.length >= room.maxPlayers || !room.players.includes(senderId) || room.players.includes(recipientId)) throw unavailable();
}
async function assertFriends(senderId: string, recipientId: string) {
  if (senderId === recipientId) throw new AppError('VALIDATION_ERROR', 'Choose a friend to invite.', 422);
  const [friend, blocked] = await Promise.all([
    prisma.friend.findFirst({ where: { status: 'ACCEPTED', OR: [
      { requesterId: senderId, addresseeId: recipientId }, { requesterId: recipientId, addresseeId: senderId },
    ] } }),
    prisma.blockedUser.findFirst({ where: { OR: [
      { blockerId: senderId, blockedId: recipientId }, { blockerId: recipientId, blockedId: senderId },
    ] } }),
  ]);
  if (!friend || blocked) throw new AppError('FORBIDDEN', 'You can only invite your current friends.', 403);
  const active = await prisma.user.count({ where: { id: { in: [senderId, recipientId] }, deletedAt: null } });
  if (active !== 2 || !(await getPrivacySettings(recipientId)).allowGameInvites) throw new AppError('FORBIDDEN', 'Game invitations are unavailable for this account.', 403);
}
function invitationData(value: Prisma.JsonValue | null): InvitationData | null {
  const data = value as Partial<InvitationData> | null;
  return data?.kind === 'PRIVATE_ROOM_INVITE' && typeof data.roomId === 'string' && typeof data.senderId === 'string' &&
    typeof data.senderName === 'string' && typeof data.expiresAt === 'string' ? data as InvitationData : null;
}
function serialize(id: string, data: InvitationData, room: RoomInfo) {
  return { id, ...data, code: room.code, gameId: room.gameId, stake: room.stake };
}
export async function sendRoomInvitation(senderId: string, recipientId: string, roomId: string) {
  await assertFriends(senderId, recipientId);
  const room = await roomInfo(roomId);
  assertRoom(room, senderId, recipientId);
  const sender = await prisma.user.findUniqueOrThrow({ where: { id: senderId }, select: { displayName: true, username: true } });
  const data: InvitationData = { kind: 'PRIVATE_ROOM_INVITE', roomId, senderId, senderName: sender.displayName || sender.username,
    expiresAt: new Date(Date.now() + 5 * 60000).toISOString(), gameId: room.gameId, code: room.code, stake: room.stake, response: 'PENDING' };
  const referenceId = `room-invite:${roomId}:${senderId}`;
  const notification = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`room-invites:${senderId}`}))`;
    const recent = await tx.appNotification.findFirst({ where: { userId: recipientId, referenceId, type: 'MATCH_INVITE',
      OR: [{ data: { path: ['response'], equals: 'PENDING' }, createdAt: { gt: new Date(Date.now() - 5 * 60000) } },
        { createdAt: { gt: new Date(Date.now() - 30000) } }] } });
    if (recent) {
      if (invitationData(recent.data)?.response === 'PENDING') return recent;
      throw new AppError('RATE_LIMITED', 'Please wait before inviting this friend again.', 429);
    }
    const count = await tx.appNotification.count({ where: { type: 'MATCH_INVITE', data: { path: ['senderId'], equals: senderId },
      createdAt: { gt: new Date(Date.now() - 60000) } } });
    if (count >= 20) throw new AppError('RATE_LIMITED', 'Please wait before sending more invitations.', 429);
    return tx.appNotification.create({ data: { userId: recipientId, type: 'MATCH_INVITE', referenceId,
      title: 'Private room invitation', body: `${data.senderName} invited you to room ${room.code} (${room.stake} coins).`, data } });
  });
  await notifyUserSocket(recipientId, 'room:invitation', { invitationId: notification.id });
  return { sent: true };
}
export async function resolveRoomInvitation(userId: string, id: string) {
  const invitation = await prisma.appNotification.findFirst({ where: { id, userId, type: 'MATCH_INVITE' } });
  const data = invitationData(invitation?.data ?? null);
  if (!invitation || !data || data.response !== 'PENDING' || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()) throw new AppError('NOT_FOUND', 'This invitation has expired.', 410);
  await assertFriends(data.senderId, userId);
  const room = await roomInfo(data.roomId);
  assertRoom(room, data.senderId, userId);
  return serialize(id, data, room);
}
export async function pendingRoomInvitations(userId: string) {
  const notifications = await prisma.appNotification.findMany({ where: { userId, type: 'MATCH_INVITE', data: { path: ['response'], equals: 'PENDING' },
    createdAt: { gt: new Date(Date.now() - 5 * 60000) } }, orderBy: { createdAt: 'asc' }, take: 20 });
  const results = await Promise.all(notifications.map(async notification => {
    try { return await resolveRoomInvitation(userId, notification.id); } catch (error) {
      if (error instanceof AppError) return null;
      throw error;
    }
  }));
  return results.filter(result => result !== null);
}
export async function respondRoomInvitation(userId: string, id: string, accepted: boolean) {
  const notification = await prisma.appNotification.findFirst({ where: { id, userId, type: 'MATCH_INVITE' } });
  const data = invitationData(notification?.data ?? null);
  if (!notification || !data) throw new AppError('NOT_FOUND', 'Invitation not found.', 404);
  const response = accepted ? 'ACCEPTED' : 'DECLINED';
  if (data.response !== 'PENDING') {
    if (data.response === response) return { responded: true };
    throw new AppError('INVALID_ACTION', 'This invitation has already been answered.', 409);
  }
  // Acceptance is recorded only after the authoritative room join succeeded.
  if (accepted) {
    const room = await roomInfo(data.roomId);
    if (!room.players.includes(userId)) throw new AppError('INVALID_ACTION', 'Join the room before accepting this invitation.', 409);
  }
  const updated = await prisma.appNotification.updateMany({ where: { id, userId, data: { path: ['response'], equals: 'PENDING' } },
    data: { readAt: new Date(), data: { ...data, response: accepted ? 'ACCEPTED' : 'DECLINED' } } });
  if (updated.count === 0) {
    const current = await prisma.appNotification.findFirst({ where: { id, userId } });
    if (invitationData(current?.data ?? null)?.response !== response) throw new AppError('INVALID_ACTION', 'This invitation has already been answered.', 409);
  }
  await notifyUserSocket(userId, 'room:invitation', { invitationId: id });
  return { responded: true };
}
