import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, clampPagination } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema, routeParams, queryParams, queryString } from "../lib/http";
import {
  blockUser,
  countUnreadMessages,
  getMessages,
  listBlocked,
  listConversations,
  sendMessage,
  startConversation,
  unblockUser,
} from "../services/messages";
import { isFeatureEnabled } from "../services/featureFlags";

const startSchema = z.object({
  userId: z.string().min(1).max(100),
});

const sendSchema = z.object({
  conversationId: z.string().min(1).max(100),
  body: z.string().trim().min(1).max(4000),
});

export async function messagesRoutes(app: FastifyInstance) {
  app.get("/api/messages/conversations", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (!(await isFeatureEnabled("social.messaging"))) {
      throw new AppError("FEATURE_DISABLED", "Messaging is disabled", 403);
    }
    return listConversations(user.id);
  });

  app.get("/api/messages/unread-count", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (!(await isFeatureEnabled("social.messaging"))) return { count: 0 };
    return { count: await countUnreadMessages(user.id) };
  });

  app.post("/api/messages/start", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (!(await isFeatureEnabled("social.messaging"))) {
      throw new AppError("FEATURE_DISABLED", "Messaging is disabled", 403);
    }
    const { userId: otherId } = parseSchema(startSchema, request.body);
    return startConversation(user.id, otherId);
  });

  app.post("/api/messages/send", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (!(await isFeatureEnabled("social.messaging"))) {
      throw new AppError("FEATURE_DISABLED", "Messaging is disabled", 403);
    }
    const { conversationId, body } = parseSchema(sendSchema, request.body);
    return sendMessage(user.id, conversationId, body);
  });

  app.get("/api/messages/:conversationId", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (!(await isFeatureEnabled("social.messaging"))) {
      throw new AppError("FEATURE_DISABLED", "Messaging is disabled", 403);
    }
    const { conversationId } = routeParams(request);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    return getMessages(user.id, conversationId, page, pageSize);
  });

  // ---- Block list ----------------------------------------------------------
  app.get("/api/messages/blocked", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    return listBlocked(user.id);
  });

  app.post("/api/messages/block", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { userId } = parseSchema(startSchema, request.body);
    return blockUser(user.id, userId);
  });

  app.post("/api/messages/unblock", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { userId } = parseSchema(startSchema, request.body);
    return unblockUser(user.id, userId);
  });
}
