import type { FastifyInstance } from "fastify";
import { AppError, clampPagination } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, routeParams, queryParams, queryString } from "../lib/http";
import {
  countUnreadAnnouncements,
  listAnnouncements,
  markAnnouncementRead,
} from "../services/announcements";
import { isFeatureEnabled } from "../services/featureFlags";

export async function announcementsRoutes(app: FastifyInstance) {
  app.get("/api/announcements", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (!(await isFeatureEnabled("content.announcements"))) {
      return { items: [], total: 0, page: 1, pageSize: 10 };
    }
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    return listAnnouncements(user.id, page, pageSize);
  });

  app.get("/api/announcements/unread-count", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    if (!(await isFeatureEnabled("content.announcements"))) {
      return { count: 0 };
    }
    return { count: await countUnreadAnnouncements(user.id) };
  });

  app.post("/api/announcements/:id/read", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    const { id } = routeParams(request);
    return markAnnouncementRead(user.id, id);
  });
}
