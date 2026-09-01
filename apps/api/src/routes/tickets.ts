import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clampPagination } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema, routeParams, queryParams, queryString } from "../lib/http";
import { assertFeatureEnabled } from "../services/featureFlags";
import {
  createTicket,
  getTicket,
  listMyTickets,
  replyToTicket,
} from "../services/tickets";

const createTicketSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  category: z.string().trim().min(1).max(60),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  body: z.string().trim().min(1).max(4000),
});

const replySchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export async function ticketsRoutes(app: FastifyInstance) {
  app.post("/api/support/tickets", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("support.tickets", "Support tickets");
    const input = parseSchema(createTicketSchema, request.body);
    return createTicket(user.id, input);
  });

  app.get("/api/support/tickets", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("support.tickets", "Support tickets");
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    return listMyTickets(user.id, page, pageSize);
  });

  app.get("/api/support/tickets/:id", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("support.tickets", "Support tickets");
    const { id } = routeParams(request);
    return getTicket(user.id, id, false);
  });

  app.post("/api/support/tickets/:id/reply", { preHandler: authenticate }, async (request) => {
    const user = requireUser(request);
    await assertFeatureEnabled("support.tickets", "Support tickets");
    const { id } = routeParams(request);
    const { body } = parseSchema(replySchema, request.body);
    return replyToTicket(user.id, id, body, false);
  });
}
