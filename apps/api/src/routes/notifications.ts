import type { FastifyInstance } from "fastify";
import { clampPagination } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, routeParams, queryParams, queryString } from "../lib/http";
import {
  countUnread,
  deleteAllNotifications,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notifications";

export async function notificationsRoutes(app: FastifyInstance) {
  app.get("/api/notifications", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    return listNotifications(user.id, page, pageSize);
  });

  app.get("/api/notifications/unread-count", { preHandler: authenticate }, async (request) => {
    return { count: await countUnread(requireUser(request).id) };
  });

  app.post("/api/notifications/:id/read", { preHandler: authenticate }, async (request) => {
    const { id } = routeParams(request);
    await markNotificationRead(requireUser(request).id, id);
    return { ok: true };
  });

  app.post("/api/notifications/read-all", { preHandler: authenticate }, async (request) => {
    await markAllNotificationsRead(requireUser(request).id);
    return { ok: true };
  });

  app.delete("/api/notifications/clear-all", { preHandler: authenticate }, async (request) => {
    await deleteAllNotifications(requireUser(request).id);
    return { ok: true };
  });

  app.delete("/api/notifications", { preHandler: authenticate }, async (request) => {
    await deleteAllNotifications(requireUser(request).id);
    return { ok: true };
  });

  app.delete("/api/notifications/:id", { preHandler: authenticate }, async (request) => {
    const { id } = routeParams(request);
    await deleteNotification(requireUser(request).id, id);
    return { ok: true };
  });
}

