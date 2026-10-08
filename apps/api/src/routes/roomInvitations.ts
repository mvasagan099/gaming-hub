import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../plugins/authenticate';
import { requireUser, parseSchema, routeParams } from '../lib/http';
import { assertFeatureEnabled } from '../services/featureFlags';
import { sendRoomInvitation, resolveRoomInvitation, pendingRoomInvitations, respondRoomInvitation } from '../services/roomInvitations';
export async function roomInvitationsRoutes(app: FastifyInstance) {
  app.get('/api/room-invitations', { preHandler: authenticate }, async request => ({ items: await pendingRoomInvitations(requireUser(request).id) }));
  app.post('/api/room-invitations', { preHandler: authenticate }, async request => {
    await assertFeatureEnabled('social.friends', 'Friends');
    await assertFeatureEnabled('games.enabled', 'Games');
    const input = parseSchema(z.object({ roomId: z.string().min(1).max(128), friendId: z.string().min(1).max(128) }), request.body);
    return sendRoomInvitation(requireUser(request).id, input.friendId, input.roomId);
  });
  app.get('/api/room-invitations/:id', { preHandler: authenticate }, async request => resolveRoomInvitation(requireUser(request).id, routeParams(request).id));
  app.post('/api/room-invitations/:id/respond', { preHandler: authenticate }, async request => {
    const input = parseSchema(z.object({ accepted: z.boolean() }), request.body);
    return respondRoomInvitation(requireUser(request).id, routeParams(request).id, input.accepted);
  });
}
